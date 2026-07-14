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
  var claimed = false;
  var countdownTimer = null;
  // localStorage ব্যর্থ হলে (যেমন কিছু প্রাইভেট মোডে) মেমোরি-ফলব্যাক
  var memShownAt = 0;

  var DEBUG = /[?&]zl_exit_debug=1/.test(window.location.search);
  function log() {
    if (DEBUG && window.console) {
      console.log.apply(console, ['[zl-exit]'].concat([].slice.call(arguments)));
    }
  }

  /* ---------- ইন-অ্যাপ ব্রাউজার শনাক্তকরণ ----------
     ফেসবুক/মেসেঞ্জার/ইনস্টাগ্রামের ভেতরের ব্রাউজার Chrome নয় — WebView।
     Chrome-এর "history manipulation intervention" (ট্যাপ ছাড়া pushState
     এন্ট্রি ব্যাক-বাটনে স্কিপ করা) সেখানে প্রযোজ্য নয়: অ্যাপ নিজে
     webView.goBack() চালায়, যা সব এন্ট্রিকেই সম্মান করে। তাই ইন-অ্যাপে
     ট্যাপের অপেক্ষা না করে সময়-গেট পেরোলেই ট্র্যাপ আর্ম করা যায় —
     শুধু-স্ক্রল-করা ভিজিটরও ব্যাক-বাটনের জালে ধরা পড়েন। */
  var IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|FB4A|Instagram/i.test(navigator.userAgent || '');

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

  // সর্বশেষ কখন পপআপ দেখানো হয়েছে — localStorage, না পারলে মেমোরি থেকে।
  // মেমোরি ভেরিয়েবলের বদলে টাইমস্ট্যাম্প ব্যবহারের কারণ: ট্যাব দিনের পর
  // দিন খোলা/রিস্টোর থাকলেও ফ্রিকোয়েন্সির সময় পেরোলে পপআপ আবার আসবে।
  function lastShownAt() {
    try {
      var v = parseInt(localStorage.getItem(LS_SHOWN) || '0', 10);
      if (v) return v;
    } catch (e) {}
    return memShownAt;
  }

  // ফ্রিকোয়েন্সি চেক: সম্প্রতি দেখানো হলে বা ডিসকাউন্ট নেওয়া থাকলে আর দেখাবে না
  function suppressed() {
    if (hasCookie(COOKIE)) return true;
    var at = lastShownAt();
    return !!at && (Date.now() - at) < cfg.frequencyHours * 3600 * 1000;
  }

  function popupOpen() {
    return overlay.classList.contains('zl-show');
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

  // পপআপ দেখানো যাবে কি না — ঠিক দেখানোর মুহূর্তে যাচাই হয়।
  // ইচ্ছাকৃতভাবে কোনো "shown" মেমোরি-ফ্ল্যাগ নেই: দেখানোর মুহূর্তেই
  // টাইমস্ট্যাম্প জমা হয় বলে একই পেজলোডে দ্বিতীয়বার আসে না, আবার
  // দীর্ঘদিন খোলা ট্যাবেও ফ্রিকোয়েন্সির সময় পেরোলে আবার আসতে পারে।
  function canShow() {
    var t = visibleSeconds();
    var supp = suppressed();
    var open = popupOpen();
    var ok = t >= cfg.minSecondsOnPage && !open && !supp;
    log('canShow?', ok, '(visible:', Math.round(t) + 's, open:', open, ', suppressed:', supp + ')');
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
    if (sentinelActive || popupOpen() || suppressed()) return;
    // Chrome-এ activation ছাড়া পুশ করা অর্থহীন (এন্ট্রি skippable হয়ে
    // যায় এবং পরে আর বদলানো যায় না); ইন-অ্যাপ WebView-তে এই নীতি
    // নেই, তাই সেখানে activation-এর অপেক্ষা করা হয় না
    if (!IN_APP && navigator.userActivation && !navigator.userActivation.hasBeenActive) {
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

  /* ইন-অ্যাপ ব্রাউজার (ফেসবুক/ইনস্টাগ্রাম): ট্যাপের দরকার নেই — সময়-গেট
     পেরোনো মাত্র আর্ম। ইচ্ছাকৃতভাবে ৪৫ সেকেন্ডের *আগে* আর্ম করা হয় না,
     যাতে আগেই বেরিয়ে যেতে চাওয়া ভিজিটর এক চাপেই স্বাভাবিকভাবে বেরোতে
     পারেন — সেন্টিনেল তখনো থাকেই না। */
  if (IN_APP) {
    var inAppArmTimer = setInterval(function () {
      if (suppressed()) { clearInterval(inAppArmTimer); return; }
      if (visibleSeconds() >= cfg.minSecondsOnPage) {
        armBackTrap();
        if (sentinelActive) {
          log('in-app back trap armed at time gate');
          clearInterval(inAppArmTimer);
        }
      }
    }, 1000);
  }

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

  /* ---------- ট্রিগার ৩: মোবাইল — দ্রুত উপরের দিকে স্ক্রল ----------
     বাস্তব ফোনে ফ্লিক-স্ক্রলে scroll ইভেন্ট প্রতি ফ্রেমে ছোট ছোট ধাপে
     (৩০-৮০px) আসে — পরপর দুই ইভেন্টে ৪০০px লাফ প্রায় কখনো হয় না।
     তাই দুই ইভেন্টের ব্যবধান নয়, একটানা উপরে ওঠার *জমা দূরত্ব* মাপা হয়:
     ৭০০ মিলিসেকেন্ডের জানালায় মোট ৪০০px+ উপরে উঠলে ট্রিগার। ধীরে
     স্ক্রল করে পড়তে থাকা ভিজিটরের বেলায় ফায়ার হয় না। */
  var upAnchorY = null, upAnchorT = 0, lastScrollY = window.pageYOffset;
  window.addEventListener('scroll', function () {
    var y = window.pageYOffset, t = Date.now();
    if (y < lastScrollY) {
      // উপরের দিকে উঠছে — নতুন ধাক্কা হলে বা জানালা পেরোলে নোঙর রিসেট
      if (upAnchorY === null || t - upAnchorT > 700) {
        upAnchorY = lastScrollY;
        upAnchorT = t;
      }
      if (upAnchorY - y > 400 && y > 200 && canShow()) {
        upAnchorY = null;
        showPopup('fast_scroll_up');
      }
    } else if (y > lastScrollY) {
      upAnchorY = null; // নিচের দিকে গেলে হিসাব বাতিল
    }
    lastScrollY = y;
  }, { passive: true });

  /* ---------- পপআপ দেখানো ---------- */
  function showPopup(trigger) {
    memShownAt = Date.now();
    try { localStorage.setItem(LS_SHOWN, String(memShownAt)); } catch (e) {}
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
    // সেটিংসে ভুল সিলেক্টর লিখলে যেন স্ক্রিপ্ট না ভাঙে, তাই try/catch
    var form = null;
    try { form = document.querySelector(cfg.formSelector); } catch (e) { log('bad formSelector:', e); }
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
    // ডিসকাউন্ট নেওয়া হয়ে গেছে — কাউন্টডাউনের ডেডলাইন আর দরকার নেই
    try { localStorage.removeItem(LS_DEADLINE); } catch (e) {}
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

  /* ---------- ডিবাগ ব্যাজ: স্ক্রিনের কোণে লাইভ স্ট্যাটাস ----------
     ইন-অ্যাপ ব্রাউজারে (ফেসবুক/ইনস্টাগ্রাম) কনসোল দেখা যায় না, তাই
     ?zl_exit_debug=1 দিলে পেজের কোণেই দেখা যায়: ইন-অ্যাপ শনাক্ত হলো
     কি না, কত সেকেন্ড হলো, ট্র্যাপ আর্ম হয়েছে কি না। */
  if (DEBUG) {
    var dbg = document.createElement('div');
    dbg.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:2147483000;' +
      'background:rgba(0,0,0,.78);color:#4ade80;font:11px/1.5 monospace;' +
      'padding:6px 9px;border-radius:6px;pointer-events:none;white-space:pre';
    document.body.appendChild(dbg);
    setInterval(function () {
      dbg.textContent = 'zl-exit ডিবাগ' +
        '\nin-app: ' + IN_APP +
        '\nসময়: ' + Math.floor(visibleSeconds()) + 's / ' + cfg.minSecondsOnPage + 's' +
        '\narmed: ' + sentinelActive +
        '\nsuppressed: ' + suppressed();
    }, 500);
  }
})();
