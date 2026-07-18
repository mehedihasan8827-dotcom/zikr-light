/**
 * RescueCart behavior engine.
 *
 * Dependency-free. Collects leave-intent signals, feeds them into a single
 * 0–100 intent score, and fires one popup per session/cooldown window.
 * On claim: fetches a fresh nonce (never trusts cached HTML), mints/applies
 * a session-bound coupon via wc-ajax, refreshes checkout fragments in place
 * and scrolls the buyer to the checkout form.
 *
 * jQuery is used only — and only if present — to trigger WooCommerce's own
 * `update_checkout` event; everything else is vanilla JS.
 */
(function () {
	'use strict';

	var cfg = window.rescuecartData;
	if (!cfg || !window.history || !window.sessionStorage) {
		return;
	}

	var preset = cfg.preset || {};
	var FIRE_THRESHOLD = Number(preset.fireThreshold) || 60;
	var ARM_DELAY_MS = (Number(preset.armDelay) || 8) * 1000;
	var DWELL_SECONDS = Number(preset.dwellSeconds) || 30;
	var SCROLL_DEPTH = Number(preset.scrollDepth) || 0.5;
	var UP_VELOCITY = Number(preset.upVelocity) || 1.2; // px per ms, upward.
	var IDLE_SECONDS = Number(preset.idleSeconds) || 20;

	var SS_SHOWN = 'rescuecart_shown';
	var SS_CLAIMED = 'rescuecart_claimed';
	var COOKIE_COOLDOWN = 'rescuecart_cd';

	/* -----------------------------------------------------------------
	 * State
	 * ---------------------------------------------------------------- */

	var state = {
		bootedAt: Date.now(),
		score: 0,
		fired: false,
		claiming: false,
		visibleSeconds: 0,
		maxDepth: 0,
		hiddenAt: 0,
		sentinelArmed: false,
		scrollSamples: [],
		countdownTimer: null,
		nonce: null,
		signalsDone: {} // one-shot signal guards.
	};

	/* -----------------------------------------------------------------
	 * Storage helpers (sessionStorage with cookie fallback — iOS WebView
	 * can evict storage inside the Facebook browser)
	 * ---------------------------------------------------------------- */

	function ssGet(key) {
		try {
			return window.sessionStorage.getItem(key);
		} catch (e) {
			return getCookie(key);
		}
	}

	function ssSet(key, value) {
		try {
			window.sessionStorage.setItem(key, value);
		} catch (e) {
			setCookie(key, value, 0); // Session cookie fallback.
		}
	}

	function getCookie(name) {
		var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
		return match ? decodeURIComponent(match[1]) : null;
	}

	function setCookie(name, value, maxAgeSeconds) {
		var cookie = name + '=' + encodeURIComponent(value) + '; path=/; SameSite=Lax';
		if (maxAgeSeconds > 0) {
			cookie += '; max-age=' + maxAgeSeconds;
		}
		document.cookie = cookie;
	}

	/* -----------------------------------------------------------------
	 * Arbiter: hard rules that override the score
	 * ---------------------------------------------------------------- */

	function suppressed() {
		if (state.fired) {
			return true;
		}
		if (ssGet(SS_SHOWN) || ssGet(SS_CLAIMED)) {
			return true;
		}
		if (getCookie(COOKIE_COOLDOWN)) {
			return true;
		}
		return false;
	}

	function armDelayElapsed() {
		return (Date.now() - state.bootedAt) >= ARM_DELAY_MS;
	}

	function addScore(points, signal) {
		if (suppressed()) {
			return;
		}
		state.score = Math.min(100, state.score + points);
		if (state.score >= FIRE_THRESHOLD && armDelayElapsed()) {
			fire(signal);
		}
	}

	/* -----------------------------------------------------------------
	 * Signal collectors
	 * ---------------------------------------------------------------- */

	// 1. Dwell (visible time only) + scroll depth — up to +35, one-shot.
	function startDwellTracker() {
		window.setInterval(function () {
			if (document.visibilityState === 'visible') {
				state.visibleSeconds += 1;
				checkDwellSignal();
			}
		}, 1000);
	}

	function checkDwellSignal() {
		if (state.signalsDone.dwell) {
			return;
		}
		if (state.visibleSeconds >= DWELL_SECONDS && state.maxDepth >= SCROLL_DEPTH) {
			state.signalsDone.dwell = true;
			addScore(35, 'dwell_scroll');
		}
	}

	// 2. Scroll depth + fast up-scroll velocity.
	function onScroll() {
		var doc = document.documentElement;
		var scrollable = Math.max(1, doc.scrollHeight - window.innerHeight);
		var y = window.pageYOffset || doc.scrollTop || 0;

		state.maxDepth = Math.max(state.maxDepth, Math.min(1, (y + window.innerHeight) / doc.scrollHeight));
		checkDwellSignal();

		var now = Date.now();
		state.scrollSamples.push({ t: now, y: y });
		while (state.scrollSamples.length && now - state.scrollSamples[0].t > 400) {
			state.scrollSamples.shift();
		}
		if (state.scrollSamples.length < 3) {
			return;
		}

		var oldest = state.scrollSamples[0];
		var elapsed = now - oldest.t;
		if (elapsed <= 0) {
			return;
		}

		var upwardVelocity = (oldest.y - y) / elapsed; // Positive when scrolling up.
		var nearTop = y < scrollable * 0.25;
		var recentlyFired = state.signalsDone.upscrollAt && (now - state.signalsDone.upscrollAt < 3000);

		if (upwardVelocity >= UP_VELOCITY && nearTop && !recentlyFired) {
			state.signalsDone.upscrollAt = now;
			addScore(30, 'fast_upscroll');
		}
	}

	// 3. Back-button intercept: one-shot history sentinel. Armed once; the
	// back press that triggers the popup consumes it, so the next back press
	// genuinely leaves the page. Never re-armed — no back-button trap.
	function armHistorySentinel() {
		if (suppressed()) {
			return;
		}
		// Respect other code already managing history state.
		if (window.history.state && window.history.state.rescuecart === undefined && Object.keys(window.history.state).length) {
			return;
		}
		try {
			window.history.pushState({ rescuecart: 1 }, '', window.location.href);
			state.sentinelArmed = true;
		} catch (e) {
			state.sentinelArmed = false;
		}

		window.addEventListener('popstate', function () {
			if (!state.sentinelArmed) {
				return;
			}
			state.sentinelArmed = false; // Consumed: never re-armed.
			if (!suppressed()) {
				state.score = 100;
				fire('back_button'); // Definitive signal: ignores arm delay.
			}
		});
	}

	// 4. Tab/app switch and return (FB users flip back to the feed).
	function watchVisibility() {
		document.addEventListener('visibilitychange', function () {
			if (document.visibilityState === 'hidden') {
				state.hiddenAt = Date.now();
			} else if (state.hiddenAt && Date.now() - state.hiddenAt > 3000 && !state.signalsDone.visibility) {
				state.signalsDone.visibility = true;
				addScore(20, 'tab_return');
			}
		});
	}

	// 5. Checkout-field abandonment: focused a field, left it empty, went idle.
	function watchFieldAbandonment() {
		var abandonTimer = null;

		document.addEventListener('focusin', function (event) {
			var field = event.target;
			if (!field.closest || !field.closest('form.checkout, .wcf-embed-checkout-form')) {
				return;
			}
			if (abandonTimer) {
				window.clearTimeout(abandonTimer);
				abandonTimer = null;
			}
		});

		document.addEventListener('focusout', function (event) {
			var field = event.target;
			if (!field.closest || !field.closest('form.checkout, .wcf-embed-checkout-form')) {
				return;
			}
			if (state.signalsDone.abandon || (field.value && field.value.trim() !== '')) {
				return;
			}
			abandonTimer = window.setTimeout(function () {
				state.signalsDone.abandon = true;
				addScore(25, 'field_abandon');
			}, 5000);
		});
	}

	// 6. Idle after partial engagement.
	function watchIdle() {
		var idleTimer = null;

		function resetIdle() {
			if (idleTimer) {
				window.clearTimeout(idleTimer);
			}
			idleTimer = window.setTimeout(function () {
				if (!state.signalsDone.idle && state.maxDepth > 0.2) {
					state.signalsDone.idle = true;
					addScore(15, 'idle');
				}
			}, IDLE_SECONDS * 1000);
		}

		['touchstart', 'scroll', 'keydown', 'pointerdown'].forEach(function (eventName) {
			window.addEventListener(eventName, resetIdle, { passive: true });
		});
		resetIdle();
	}

	// 7. Desktop bonus: classic mouse-leave exit intent (fine pointers only).
	function watchMouseLeave() {
		if (!window.matchMedia || !window.matchMedia('(pointer: fine)').matches) {
			return;
		}
		document.addEventListener('mouseout', function (event) {
			if (!event.relatedTarget && event.clientY <= 0 && !state.signalsDone.mouseleave) {
				state.signalsDone.mouseleave = true;
				addScore(60, 'mouse_leave');
			}
		});
	}

	/* -----------------------------------------------------------------
	 * Popup
	 * ---------------------------------------------------------------- */

	function el(selector) {
		return document.querySelector(selector);
	}

	function fire(signal) {
		if (suppressed()) {
			return;
		}
		var root = el('#rescuecart-root');
		if (!root) {
			return;
		}

		state.fired = true;
		ssSet(SS_SHOWN, '1');
		startCooldown();

		root.hidden = false;
		// Force a layout so the enter transition runs.
		void root.offsetWidth; // eslint-disable-line no-void
		root.classList.add('rescuecart-open');
		startCountdown(Date.now() + cfg.expiryMinutes * 60000, el('[data-rescuecart-countdown]'), function () {
			dismiss();
		});
		pingImpression(signal);

		var claimButton = el('[data-rescuecart-claim]');
		if (claimButton) {
			claimButton.focus({ preventScroll: true });
		}
	}

	function dismiss() {
		var root = el('#rescuecart-root');
		if (!root || root.hidden) {
			return;
		}
		root.classList.remove('rescuecart-open');
		window.setTimeout(function () {
			root.hidden = true;
		}, 250);
		stopCountdown();
	}

	function startCooldown() {
		var hours = Number(cfg.cooldownHours) || 0;
		if (hours > 0) {
			setCookie(COOKIE_COOLDOWN, '1', hours * 3600);
		}
	}

	function startCountdown(deadline, targetEl, onExpire) {
		stopCountdown();
		if (!targetEl) {
			return;
		}
		state.countdownTimer = window.setInterval(function () {
			var remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
			var minutes = Math.floor(remaining / 60);
			var seconds = remaining % 60;
			targetEl.textContent = (minutes < 10 ? '0' : '') + minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
			if (remaining <= 0) {
				stopCountdown();
				if (onExpire) {
					onExpire();
				}
			}
		}, 1000);
	}

	function stopCountdown() {
		if (state.countdownTimer) {
			window.clearInterval(state.countdownTimer);
			state.countdownTimer = null;
		}
	}

	/* -----------------------------------------------------------------
	 * Network
	 * ---------------------------------------------------------------- */

	function postForm(url, params) {
		var body = new URLSearchParams();
		Object.keys(params).forEach(function (key) {
			body.append(key, params[key]);
		});
		return window.fetch(url, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
			body: body.toString()
		}).then(function (response) {
			return response.json().then(function (json) {
				return { ok: response.ok, json: json };
			});
		});
	}

	function getToken() {
		if (state.nonce) {
			return Promise.resolve(state.nonce);
		}
		return window.fetch(cfg.endpoints.token, { credentials: 'same-origin' })
			.then(function (response) { return response.json(); })
			.then(function (json) {
				if (json && json.success && json.data && json.data.nonce) {
					state.nonce = json.data.nonce;
					return state.nonce;
				}
				throw new Error('token');
			});
	}

	function pingImpression(signal) {
		try {
			postForm(cfg.endpoints.impression, { signal: signal || '' }).catch(function () {});
		} catch (e) {
			/* Never let telemetry break the popup. */
		}
	}

	/* -----------------------------------------------------------------
	 * Claim flow
	 * ---------------------------------------------------------------- */

	function claim(signal, isRetry) {
		if (state.claiming) {
			return;
		}
		state.claiming = true;

		var button = el('[data-rescuecart-claim]');
		var errorEl = el('[data-rescuecart-error]');
		if (button) {
			button.disabled = true;
			button.dataset.originalLabel = button.dataset.originalLabel || button.textContent;
			button.textContent = cfg.i18n.claiming;
		}
		if (errorEl) {
			errorEl.hidden = true;
		}

		getToken()
			.then(function (nonce) {
				return postForm(cfg.endpoints.claim, {
					security: nonce,
					rc_website: '', // Honeypot: must be present and empty.
					signal: signal || ''
				});
			})
			.then(function (result) {
				if (result.json && result.json.success) {
					onClaimSuccess(result.json.data);
					return;
				}
				// A stale nonce gets one silent refresh + retry.
				if (result.json && !result.json.success && !isRetry && result.ok === false) {
					state.nonce = null;
					state.claiming = false;
					claim(signal, true);
					return;
				}
				var message = (result.json && result.json.data && result.json.data.message) || cfg.i18n.error;
				onClaimError(message);
			})
			.catch(function () {
				// Flaky mobile network: one automatic retry with backoff.
				if (!isRetry) {
					window.setTimeout(function () {
						state.claiming = false;
						claim(signal, true);
					}, 1200);
				} else {
					onClaimError(cfg.i18n.error);
				}
			});
	}

	function onClaimSuccess(data) {
		state.claiming = false;
		ssSet(SS_CLAIMED, '1');
		stopCountdown();
		dismiss();
		firePixel();
		refreshCheckoutFragments();
		showAppliedBar(data);
		window.setTimeout(scrollToCheckout, 350);
	}

	function onClaimError(message) {
		state.claiming = false;
		var button = el('[data-rescuecart-claim]');
		var errorEl = el('[data-rescuecart-error]');
		if (button) {
			button.disabled = false;
			button.textContent = button.dataset.originalLabel || cfg.i18n.retry;
		}
		if (errorEl) {
			errorEl.textContent = message;
			errorEl.hidden = false;
		}
	}

	function firePixel() {
		if (cfg.pixelEvent && typeof window.fbq === 'function') {
			try {
				window.fbq('trackCustom', 'RescueCartOfferClaimed', {
					value: cfg.discountValue,
					discount_type: cfg.discountType,
					currency: cfg.currency
				});
			} catch (e) {
				/* Pixel failures must never affect checkout. */
			}
		}
	}

	function refreshCheckoutFragments() {
		var jq = window.jQuery;
		if (jq && jq(document.body).length) {
			jq(document.body).trigger('update_checkout');
			jq(document.body).trigger('wc_fragment_refresh');
		}
	}

	function showAppliedBar(data) {
		var bar = el('#rescuecart-bar');
		if (!bar) {
			return;
		}
		var text = bar.querySelector('.rescuecart-bar-text');
		if (text) {
			text.textContent = (data && data.message) || cfg.appliedText;
		}
		bar.hidden = false;
		bar.classList.add('rescuecart-bar-visible');

		var expiresAt = (data && data.expires) ? data.expires * 1000 : Date.now() + cfg.expiryMinutes * 60000;
		startCountdown(expiresAt, el('[data-rescuecart-bar-countdown]'), function () {
			bar.classList.remove('rescuecart-bar-visible');
			window.setTimeout(function () {
				bar.hidden = true;
			}, 250);
		});
	}

	function scrollToCheckout() {
		var target = null;
		(cfg.scrollTargets || []).some(function (selector) {
			target = el(selector);
			return !!target;
		});
		if (!target) {
			return;
		}
		try {
			target.scrollIntoView({ behavior: 'smooth', block: 'start' });
		} catch (e) {
			target.scrollIntoView();
		}
		// Focus the first empty required field once the scroll has settled.
		window.setTimeout(function () {
			var field = target.querySelector('input.input-text:not([type="hidden"]):not([value]), input.input-text[value=""]');
			if (field && !field.value) {
				field.focus({ preventScroll: true });
			}
		}, 700);
	}

	/* -----------------------------------------------------------------
	 * Wiring
	 * ---------------------------------------------------------------- */

	function bindUi() {
		document.addEventListener('click', function (event) {
			var target = event.target;
			if (target.closest('[data-rescuecart-claim]')) {
				claim('click', false);
			} else if (target.closest('[data-rescuecart-dismiss]')) {
				dismiss();
			}
		});

		document.addEventListener('keydown', function (event) {
			if (event.key === 'Escape') {
				dismiss();
			}
		});
	}

	function boot() {
		if (suppressed()) {
			return; // Already shown/claimed or inside the cooldown window.
		}
		bindUi();
		startDwellTracker();
		watchVisibility();
		watchFieldAbandonment();
		watchIdle();
		watchMouseLeave();
		armHistorySentinel();
		window.addEventListener('scroll', onScroll, { passive: true });
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot);
	} else {
		boot();
	}

	// Minimal debug surface for support.
	window.RescueCart = {
		version: '1.0.0',
		getScore: function () {
			return state.score;
		}
	};
})();
