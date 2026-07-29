/*
 * Live Order Counter.
 *
 * The count is a pure function of the time of day. The server hands over the
 * day's curve plus its own position in that day; from there the browser ticks
 * forward on elapsed time alone. The device clock is only ever used to measure
 * deltas, never to establish what time it is, so a visitor whose phone is set
 * to the wrong date still sees the right number.
 */
(function () {
	'use strict';

	var CONFIG = window.LOCConfig || {};
	var STORAGE_KEY = 'loc_peak_v1';
	var DAY_SECONDS = 86400;
	var BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

	var badges = [];
	var profile = null;
	var anchorSeconds = 0;
	var anchorWall = 0;
	var displayed = 0;
	var frozen = false;
	var hiddenAt = 0;

	/**
	 * Read the highest count this browser has already shown today.
	 *
	 * Keyed on the server's date rather than the device's, so the memory clears
	 * at the site's midnight and not the visitor's.
	 */
	function readPeak(date) {
		try {
			var raw = window.localStorage.getItem(STORAGE_KEY);
			if (!raw) {
				return 0;
			}
			var saved = JSON.parse(raw);
			if (!saved || saved.d !== date) {
				return 0;
			}
			return parseInt(saved.v, 10) || 0;
		} catch (e) {
			// Safari in private mode throws on storage access. The counter still
			// works, it just forgets between page loads.
			return 0;
		}
	}

	function writePeak(date, value) {
		try {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ d: date, v: value }));
		} catch (e) {
			/* Non-fatal. */
		}
	}

	function formatNumber(value) {
		var text = String(value);

		if (!profile || !profile.bn_digits) {
			return text;
		}

		return text.replace(/[0-9]/g, function (digit) {
			return BN_DIGITS[digit];
		});
	}

	/**
	 * Adopt a payload from the server and precompute its cumulative weights.
	 */
	function adopt(payload) {
		if (!payload || !payload.weights || payload.weights.length !== 24) {
			return false;
		}

		var prefix = [0];
		var running = 0;
		var i;

		for (i = 0; i < 24; i++) {
			running += Math.max(0, Number(payload.weights[i]) || 0);
			prefix.push(running);
		}

		if (running <= 0) {
			return false;
		}

		// A different day than the one already on screen means the HTML came
		// from a page cache written before midnight. Drop the carried-over
		// value so the new day starts from its own curve.
		if (profile && profile.date !== String(payload.date)) {
			displayed = 0;
		}

		profile = {
			date: String(payload.date),
			base: Number(payload.base) || 0,
			total: Number(payload.total) || 0,
			weights: payload.weights,
			prefix: prefix,
			sum: running,
			lead: Math.max(0, Number(payload.lead) || 0),
			bn_digits: !!payload.bn_digits
		};

		anchorSeconds = Math.max(0, Number(payload.seconds) || 0);
		anchorWall = Date.now();
		frozen = false;

		return true;
	}

	/**
	 * Seconds since site-local midnight, right now.
	 */
	function secondsNow() {
		var elapsed = (Date.now() - anchorWall) / 1000;

		// A clock adjusted backwards mid-session would otherwise rewind the
		// counter, which is the one thing it must never do.
		if (elapsed < 0) {
			elapsed = 0;
		}

		return anchorSeconds + elapsed;
	}

	/**
	 * Evaluate the curve, interpolating inside the hour so it moves smoothly.
	 */
	function curveAt(seconds) {
		if (seconds >= DAY_SECONDS) {
			seconds = DAY_SECONDS - 1;
		}
		if (seconds < 0) {
			seconds = 0;
		}

		var hours = seconds / 3600;
		var hour = Math.floor(hours);
		var part = hours - hour;
		var cumulative = profile.prefix[hour] + (Number(profile.weights[hour]) * part);
		var progress = cumulative / profile.sum;

		return profile.base + Math.round((profile.total - profile.base) * progress);
	}

	/**
	 * The number to put on screen.
	 *
	 * Never below the curve, never below what this browser has already shown,
	 * and never more than `lead` ahead of the curve. That ceiling is what stops
	 * repeat visits from compounding: the session increments preview the next
	 * few minutes of the curve rather than stacking on top of it, so twenty
	 * reloads cannot inflate the counter past `curve + lead`.
	 *
	 * Because the stored peak is always written at or below `curve + lead` and
	 * the curve only rises with time, the displayed value can never decrease.
	 */
	function resolve(seconds) {
		var curve = curveAt(seconds);
		var value = Math.max(curve, readPeak(profile.date), displayed);

		return Math.min(value, curve + profile.lead);
	}

	function render(value) {
		if (value === displayed && badges.length && badges[0].rendered) {
			return;
		}

		displayed = value;

		badges.forEach(function (badge) {
			// Tracked rather than queried: an outgoing digit lingers in the DOM
			// for the length of its transition, so two updates inside that
			// window would otherwise find the departing node instead of the
			// live one.
			var current = badge.current;

			if (current && current.getAttribute('data-v') === String(value)) {
				badge.rendered = true;
				return;
			}

			var next = document.createElement('span');
			next.className = 'loc-num loc-in';
			next.setAttribute('data-v', String(value));
			next.textContent = formatNumber(value);

			if (current) {
				current.classList.remove('loc-in');
				current.classList.add('loc-out');
				window.setTimeout(function () {
					if (current.parentNode) {
						current.parentNode.removeChild(current);
					}
				}, 400);
			}

			badge.count.appendChild(next);
			badge.current = next;

			// Force a reflow so the browser registers the offset start position
			// before the transition to the resting position begins.
			void next.offsetWidth;
			next.classList.remove('loc-in');

			badge.rendered = true;
		});

		writePeak(profile.date, value);
	}

	function refresh() {
		if (!profile || frozen) {
			return;
		}

		var seconds = secondsNow();

		// Midnight passed with the tab open. Watching 130 collapse to 4 on
		// screen would undo exactly the trust this badge exists to build, so
		// hold the last value; the next page load starts the new day cleanly.
		if (seconds >= DAY_SECONDS) {
			frozen = true;
			return;
		}

		render(resolve(seconds));
	}

	/**
	 * One simulated order arriving during the visit.
	 */
	function bump() {
		if (!profile || frozen) {
			return;
		}

		var seconds = secondsNow();

		if (seconds >= DAY_SECONDS) {
			frozen = true;
			return;
		}

		var ceiling = curveAt(seconds) + profile.lead;

		if (displayed < ceiling) {
			render(displayed + 1);
		}
	}

	function randomBetween(min, max) {
		return min + Math.floor(Math.random() * (max - min + 1));
	}

	function scheduleBumps() {
		window.setTimeout(bump, randomBetween(1000, 2000));
		window.setTimeout(bump, randomBetween(8000, 10000));
		window.setTimeout(bump, randomBetween(35000, 40000));
	}

	/**
	 * Reconcile against the server.
	 *
	 * The HTML this badge came from may have been served by a full-page cache,
	 * in which case its embedded numbers are stale. This response is not
	 * page-cached, so it is authoritative.
	 */
	function sync() {
		// Once the day has rolled over mid-visit the display is deliberately
		// held; adopting the new day's curve here would produce exactly the
		// on-screen collapse the freeze exists to prevent.
		if (frozen || !CONFIG.endpoint || !window.fetch) {
			return;
		}

		window.fetch(CONFIG.endpoint, { credentials: 'omit', cache: 'no-store' })
			.then(function (response) {
				return response.ok ? response.json() : null;
			})
			.then(function (payload) {
				if (payload && !frozen && adopt(payload)) {
					refresh();
				}
			})
			.catch(function () {
				// Offline or blocked: the embedded payload and the local clock
				// carry the counter for this pageview.
			});
	}

	function collect() {
		var nodes = document.querySelectorAll('.loc-badge');
		var embedded = null;
		var i;

		for (i = 0; i < nodes.length; i++) {
			var node = nodes[i];
			var count = node.querySelector('.loc-count');

			if (!count) {
				continue;
			}

			badges.push({
				el: node,
				count: count,
				current: count.querySelector('.loc-num'),
				rendered: false
			});

			if (!embedded) {
				try {
					embedded = JSON.parse(node.getAttribute('data-loc'));
				} catch (e) {
					embedded = null;
				}
			}
		}

		return embedded;
	}

	function start() {
		var embedded = collect();

		if (!badges.length) {
			return;
		}

		if (adopt(embedded)) {
			displayed = Math.max(0, Number(embedded.count) || 0);
			refresh();
		}

		sync();
		scheduleBumps();

		// Catches the curve overtaking the displayed value during a long visit.
		window.setInterval(refresh, 10000);

		// Another tab moved the counter forward.
		window.addEventListener('storage', function (event) {
			if (event.key === STORAGE_KEY) {
				refresh();
			}
		});

		document.addEventListener('visibilitychange', function () {
			if (document.hidden) {
				hiddenAt = Date.now();
				return;
			}

			// Back after a while: re-anchor to the server rather than trusting
			// however long the device thinks it was away.
			if (hiddenAt && Date.now() - hiddenAt > 60000) {
				sync();
			}

			hiddenAt = 0;
			refresh();
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', start);
	} else {
		start();
	}
}());
