/**
 * ZL Exit Intent Discount Popup — ফ্রন্টএন্ড স্ক্রিপ্ট
 *
 * ট্রিগারসমূহ (সবগুলোই সেটিংসের min_seconds পার হওয়ার পর):
 *  - ডেস্কটপ: মাউস ভিউপোর্টের উপর দিয়ে বেরিয়ে গেলে
 *  - মোবাইল: ব্যাক বাটন/জেসচার (user-activation-এ আর্ম করা সেন্টিনেল)
 *  - মোবাইল: দ্রুত উপরের দিকে স্ক্রল
 *
 * ডিবাগ: পেজ URL-এ ?zl_exit_debug=1 দিলে আগের টেস্টের ব্লক মুছে যায়
 * এবং প্রতিটি ধাপ ব্রাউজার কনসোলে লগ হয়।
 */
(function () {
  'use strict';

  var cfg = window.zlExitCfg;
  var overlay = document.getElementById('zl-exit-overlay');
  if (!cfg || !overlay) return;

  var LS_SHOWN = 'zl_exit_shown_at';
  var LS_DEADLINE = 'zl_exit_deadline';
  var COOKIE = 'zl_exit_coupon';
  var shown = false;
  var claimed = false;
  var countdownTimer = null;

  var DEBUG = /[?&]zl_exit_debug=1/.test(window.location.search);
  function log() {
    if (DEBUG && window.console) {
      console.log.apply(console, ['[zl-exit]'].concat([].slice.call(arguments)));
    }
  }

  // ডিবাগ মোড: আগের টেস্টের suppression মুছে ফেলা হয়
  if (DEBUG) {
    try {
      localStorage.removeItem(LS_SHOWN);
      localStorage.removeItem(LS_DEADLINE);
    } catch (e) {}
    document.cookie = COOKIE + '=; path=/; max-age=0';
    log('debug mode on — suppression cleared, config:', cfg);
  }

  // সংখ্যাকে বাংলা ডিজিটে রূপান্তর
  function bn(n) {
    return String(n).replace(/\d/g, function (d) { return '০১২৩৪৫৬৭৮৯'[d]; });
  }

  /* ---------- GTM / GA4 dataLayer ইভেন্ট ---------- */
  function pushEvent(name, extra) {
    window.dataLayer = window.dataLayer || [];
    var data = {
      event: name,
      coupon_code: cfg.couponCode,
      discount_amount: cfg.discountAmount,
      currency: 'BDT'
    };
    if (extra) { for (var k in extra) { data[k] = extra[k]; } }
    window.dataLayer.push(data);
    log('dataLayer:', name, extra || '');
  }

  function setCookie(name, value, maxAgeSeconds) {
    document.cookie = name + '=' + encodeURIComponent(value) +
      '; path=/; max-age=' + maxAgeSeconds + '; SameSite=Lax';
  }

  function hasCookie(name) {
    return document.cookie.indexOf(name + '=') !== -1;
  }

  // ফ্রিকোয়েন্সি চেক: সম্প্রতি দেখানো হলে বা ডিসকাউন্ট নেওয়া থাকলে আর দেখাবে না
  function suppressed() {
    if (hasCookie(COOKIE)) return true;
    try {
      var at = parseInt(localStorage.getItem(LS_SHOWN) || '0', 10);
      return !!at && (Date.now() - at) < cfg.frequencyHours * 3600 * 1000;
    } catch (e) { return false; }
  }

  // ডিসকাউন্টের পরিমাণ পপআপে বসানো
  Array.prototype.forEach.call(
    overlay.querySelectorAll('.zl-exit-amount'),
    function (el) { el.textContent = '৳' + bn(cfg.discountAmount) + ' টাকা'; }
  );

  /* ---------- সময় গণনা: টাইমস্ট্যাম্প-ভিত্তিক ----------
     ট্যাব দৃশ্যমান থাকা সময় Date.now() দিয়ে জমা হয় — ব্রাউজার টাইমার
     থ্রটল করলেও হিসাব নির্ভুল থাকে। */
  var visibleAccumMs = 0;
  var visibleSince = document.hidden ? null : Date.now();
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (visibleSince) { visibleAccumMs += Date.now() - visibleSince; visibleSince = null; }
    } else if (!visibleSince) {
      visibleSince = Date.now();
    }
  });

  function visibleSeconds() {
    return (visibleAccumMs + (visibleSince ? Date.now() - visibleSince : 0)) / 1000;
  }

  // পপআপ দেখানো যাবে কি না — ঠিক দেখানোর মুহূর্তে যাচাই হয়
  function canShow() {
    var t = visibleSeconds();
    var ok = t >= cfg.minSecondsOnPage && !shown && !suppressed();
    log('canShow?', ok, '(visible:', Math.round(t) + 's, shown:', shown, ', suppressed:', suppressed() + ')');
    return ok;
  }

  /* ---------- ট্রিগার ১: ডেস্কটপ — মাউস উপরের দিকে বেরিয়ে গেলে ---------- */
  document.addEventListener('mouseout', function (e) {
    if (!e.relatedTarget && e.clientY <= 0 && canShow()) showPopup('mouse_exit');
  });

  /* ---------- ট্রিগার ২: মোবাইল — ব্যাক বাটন / ব্যাক জেসচার ----------
     Chrome/Android-এর history manipulation intervention: user activation
     ছাড়া pushState-এ বানানো এন্ট্রি ব্যাক-বাটনে নিঃশব্দে এড়িয়ে যাওয়া হয়।

     গুরুত্বপূর্ণ: ব্রাউজারের চোখে activation গণ্য হয় কেবল pointerdown /
     mousedown / keydown / touchend-এ — scroll বা touchstart এতে পড়ে না।
     তাই সেন্টিনেল pushState শুধু এই ইভেন্টগুলোর হ্যান্ডলারেই করা হয়;
     ভুল ইভেন্টে পুশ করলে এন্ট্রিটি "skippable" মার্ক হয়ে ট্র্যাপ
     নিঃশব্দে অকার্যকর হয়ে যায় (আগের ভার্সনের বাগ)। */
  var ACTIVATION_EVENTS = ['pointerdown', 'mousedown', 'keydown', 'touchend'];
  var sentinelActive = false;

  function armBackTrap() {
    if (sentinelActive || shown || suppressed()) return;
    // যেখানে সম্ভব, ব্রাউজারকে সরাসরি জিজ্ঞেস করা হয় activation আছে কি না
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
      log('armBackTrap skipped — no user activation yet');
      return;
    }
    try {
      history.pushState({ zlExit: true }, '');
      sentinelActive = true;
      log('back trap armed (sentinel pushed)');
    } catch (e) {
      log('pushState failed:', e);
    }
  }

  ACTIVATION_EVENTS.forEach(function (evt) {
    window.addEventListener(evt, armBackTrap, { passive: true, capture: true });
  });

  window.addEventListener('popstate', function () {
    log('popstate fired, sentinelActive:', sentinelActive);
    if (!sentinelActive) return; // অন্য কোনো নেভিগেশন (হ্যাশ লিংক ইত্যাদি)
    sentinelActive = false;      // সেন্টিনেল এন্ট্রিটি এইমাত্র পপ হলো
    if (canShow()) {
      showPopup('back_button');
    } else {
      // সময় পার হয়নি বা পপআপ আগেই দেখানো হয়েছে —
      // ভিজিটরকে আটকানো হবে না, ব্যাক নেভিগেশন চলতে থাকবে
      log('passing through — history.back()');
      history.back();
    }
  });

  /* ---------- ট্রিগার ৩: মোবাইল — দ্রুত উপরের দিকে স্ক্রল ---------- */
  var lastY = 0, lastT = 0;
  window.addEventListener('scroll', function () {
    var y = window.pageYOffset, t = Date.now();
    // পেজের কিছুটা নিচে নেমে দ্রুত (৪০০px/৩০০ms) উপরে উঠলে
    if (lastY - y > 400 && t - lastT < 300 && y > 300 && canShow()) showPopup('fast_scroll_up');
    lastY = y; lastT = t;
  }, { passive: true });

  /* ---------- পপআপ দেখানো ---------- */
  function showPopup(trigger) {
    shown = true;
    try { localStorage.setItem(LS_SHOWN, String(Date.now())); } catch (e) {}
    overlay.classList.add('zl-show');
    overlay.setAttribute('aria-hidden', 'false');
    document.getElementById('zl-exit-cta').focus();
    startCountdown();
    pushEvent('exit_popup_shown', { popup_trigger: trigger });
  }

  function hidePopup(dismissMethod) {
    overlay.classList.remove('zl-show');
    overlay.setAttribute('aria-hidden', 'true');
    if (countdownTimer) clearInterval(countdownTimer);
    // ডিসকাউন্ট না নিয়ে বন্ধ করলে dismissed ইভেন্ট
    if (dismissMethod && !claimed) {
      pushEvent('exit_popup_dismissed', { dismiss_method: dismissMethod });
    }
  }

  /* ---------- কাউন্টডাউন (রিফ্রেশ করলেও রিসেট হয় না) ---------- */
  function startCountdown() {
    var deadline;
    try {
      deadline = parseInt(localStorage.getItem(LS_DEADLINE) || '0', 10);
      if (!deadline || deadline < Date.now()) {
        deadline = Date.now() + cfg.offerMinutes * 60 * 1000;
        localStorage.setItem(LS_DEADLINE, String(deadline));
      }
    } catch (e) {
      deadline = Date.now() + cfg.offerMinutes * 60 * 1000;
    }
    var el = document.getElementById('zl-exit-countdown');
    function tick() {
      var left = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      var m = Math.floor(left / 60), s = left % 60;
      el.textContent = bn((m < 10 ? '0' : '') + m) + ':' + bn((s < 10 ? '0' : '') + s);
      if (left <= 0) { clearInterval(countdownTimer); hidePopup('expired'); }
    }
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  /* ---------- AJAX: কুপন কার্টে অ্যাপ্লাই ---------- */
  function applyCouponViaAjax() {
    var body = 'action=zl_apply_exit_coupon&coupon=' + encodeURIComponent(cfg.couponCode);
    fetch(cfg.ajaxUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        var status = (res && res.data && res.data.status) || (res && res.success ? 'applied' : 'failed');
        pushEvent('exit_popup_coupon_applied', { apply_status: status });
        // CartFlows / WooCommerce চেকআউটের টোটাল রিফ্রেশ — ডিসকাউন্ট
        // কাটা দাম অর্ডার সামারিতে সাথে সাথে দেখা যাবে
        if (window.jQuery) {
          window.jQuery(document.body).trigger('update_checkout');
        }
      })
      .catch(function (err) {
        // AJAX ব্যর্থ হলেও কুকি সেট আছে — পরের পেজলোডে প্লাগইনের PHP
        // অংশ কুপনটি অ্যাপ্লাই করে দেবে
        log('ajax failed:', err);
        pushEvent('exit_popup_coupon_applied', { apply_status: 'ajax_error' });
      });
  }

  /* ---------- ডিসকাউন্ট নেওয়ার পর পেজের দাম ও বার্তা আপডেট ---------- */
  function updatePageAfterClaim() {
    // <span data-zl-price="990">৳৯৯০</span> ধাঁচের এলিমেন্টে কাটা দাম দেখানো
    Array.prototype.forEach.call(document.querySelectorAll('[data-zl-price]'), function (el) {
      var base = parseFloat(el.getAttribute('data-zl-price'));
      if (!isNaN(base)) {
        var now = Math.max(0, base - cfg.discountAmount);
        el.innerHTML = '<del style="color:#94a3b8">৳' + bn(base) + '</del> <strong>৳' + bn(now) + '</strong>';
      }
    });
    // অর্ডার ফর্মের উপরে সবুজ নিশ্চিতকরণ বার্তা
    // {discount} টোকেন "৳X টাকা" দিয়ে বদলে যায় (সেটিংস থেকে আসা লেখা)
    var form = document.querySelector(cfg.formSelector);
    if (form && !document.getElementById('zl-exit-applied-note')) {
      var msg = (cfg.appliedText || '').replace('{discount}', '৳' + bn(cfg.discountAmount) + ' টাকা');
      var note = document.createElement('div');
      note.id = 'zl-exit-applied-note';
      note.className = 'zl-exit-applied-note';
      note.textContent = msg;
      form.parentNode.insertBefore(note, form);
    }
    if (form) form.scrollIntoView({ behavior: 'smooth' });
  }

  /* ---------- CTA: ডিসকাউন্ট নিয়ে অর্ডার ---------- */
  document.getElementById('zl-exit-cta').addEventListener('click', function () {
    claimed = true;
    // ফলব্যাক কুকি — AJAX ব্যর্থ হলে বা পেজ রিলোড হলে PHP এটি দেখে
    // কুপন অ্যাপ্লাই করবে
    setCookie(COOKIE, cfg.couponCode, cfg.offerMinutes * 60);
    pushEvent('exit_popup_claimed');
    hidePopup();
    applyCouponViaAjax();
    updatePageAfterClaim();
  });

  /* ---------- বন্ধ করার উপায়সমূহ ---------- */
  document.getElementById('zl-exit-close').addEventListener('click', function () { hidePopup('close_button'); });
  document.getElementById('zl-exit-no').addEventListener('click', function () { hidePopup('no_thanks'); });
  overlay.addEventListener('click', function (e) { if (e.target === overlay) hidePopup('overlay_click'); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('zl-show')) hidePopup('escape_key');
  });
})();
