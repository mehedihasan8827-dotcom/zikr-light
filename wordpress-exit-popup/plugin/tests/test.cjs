/**
 * ZL Exit Popup — বাস্তব Chromium-এ স্বয়ংক্রিয় টেস্ট (Playwright)
 * প্লাগইনের আসল exit-popup.js ফাইলটাই টেস্ট হয়; cfg-এ শুধু
 * minSecondsOnPage=2 (টেস্ট দ্রুত চালাতে — লজিক একই)।
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8123;
const results = [];

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const file = req.url === '/' || req.url.startsWith('/?') ? 'index.html'
        : req.url.split('?')[0].slice(1);
      // JS/CSS সবসময় প্লাগইনের আসল ফাইল থেকে পরিবেশন হয় — কপি নয়,
      // তাই টেস্ট সবসময় শিপ করা কোডটাই যাচাই করে
      const assets = {
        'exit-popup.js': '../zl-exit-popup/assets/js/exit-popup.js',
        'exit-popup.css': '../zl-exit-popup/assets/css/exit-popup.css'
      };
      const p = path.join(__dirname, assets[file] || file);
      if (fs.existsSync(p)) {
        const type = file.endsWith('.js') ? 'text/javascript'
          : file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8';
        res.writeHead(200, { 'Content-Type': type });
        res.end(fs.readFileSync(p));
      } else { res.writeHead(404); res.end(); }
    });
    server.listen(PORT, () => resolve(server));
  });
}

function record(name, pass, detail) {
  results.push({ name, pass, detail: detail || '' });
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  [' + detail + ']' : ''));
}

// ডেস্কটপ এক্সিট-ইনটেন্ট সিমুলেশন: মাউস ভিউপোর্টের উপর দিয়ে বেরিয়ে গেল
async function mouseExit(page) {
  await page.evaluate(() => {
    document.dispatchEvent(new MouseEvent('mouseout', {
      bubbles: true, clientY: 0, relatedTarget: null
    }));
  });
}

async function popupVisible(page) {
  return page.evaluate(() =>
    document.getElementById('zl-exit-overlay').classList.contains('zl-show'));
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const URL = 'http://localhost:' + PORT + '/';

  /* টেস্ট ১-৫: এক কনটেক্সটে ধারাবাহিক ভিজিটর-যাত্রা */
  let ctx = await browser.newContext();
  let page = await ctx.newPage();
  await page.goto(URL);

  // ১) সময়ের গেট: নির্ধারিত সেকেন্ডের আগে এক্সিট করলে পপআপ আসবে না
  await mouseExit(page);
  record('১. নির্ধারিত সেকেন্ডের আগে পপআপ আসে না', !(await popupVisible(page)));

  // ২) সময় পেরোলে ডেস্কটপ মাউস-এক্সিটে পপআপ আসে
  await page.waitForTimeout(2600);
  await mouseExit(page);
  const shown = await popupVisible(page);
  const dl = await page.evaluate(() => window.dataLayer || []);
  const shownEvt = dl.find((e) => e.event === 'exit_popup_shown');
  record('২. সময় পেরোলে মাউস-এক্সিটে পপআপ আসে', shown);
  record('৩. GA4 ইভেন্ট exit_popup_shown (trigger: mouse_exit) যায়',
    !!shownEvt && shownEvt.popup_trigger === 'mouse_exit');
  const countdown = await page.textContent('#zl-exit-countdown');
  record('৪. কাউন্টডাউন বাংলা ডিজিটে চলে', /[০-৯]{2}:[০-৯]{2}/.test(countdown), countdown);
  const amount = await page.textContent('.zl-exit-amount');
  record('৫. হেডলাইনে ডিসকাউন্ট বসে', amount.indexOf('১০০') !== -1, amount);

  // ৬) CTA: কুপন AJAX + কুকি + সবুজ নোট + দাম আপডেট
  await page.click('#zl-exit-cta');
  await page.waitForTimeout(400);
  const afterClaim = await page.evaluate(() => ({
    hidden: !document.getElementById('zl-exit-overlay').classList.contains('zl-show'),
    ajaxCalled: (window.__fetchCalls || []).some((c) => c.body && c.body.indexOf('zl_apply_exit_coupon') !== -1 && c.body.indexOf('EXIT100') !== -1),
    cookie: document.cookie.indexOf('zl_exit_coupon=EXIT100') !== -1,
    note: !!document.getElementById('zl-exit-applied-note'),
    priceCut: document.querySelector('[data-zl-price]').textContent.indexOf('৮৯০') !== -1,
    claimedEvt: (window.dataLayer || []).some((e) => e.event === 'exit_popup_claimed'),
    appliedEvt: (window.dataLayer || []).some((e) => e.event === 'exit_popup_coupon_applied' && e.apply_status === 'applied')
  }));
  record('৬. CTA-তে পপআপ বন্ধ হয়', afterClaim.hidden);
  record('৭. কুপন AJAX কল যায় (EXIT100)', afterClaim.ajaxCalled);
  record('৮. ফলব্যাক কুকি বসে', afterClaim.cookie);
  record('৯. সবুজ নিশ্চিতকরণ বার্তা বসে', afterClaim.note);
  record('১০. পেজের দাম ৯৯০→৮৯০ হয়', afterClaim.priceCut);
  record('১১. claimed + coupon_applied ইভেন্ট যায়', afterClaim.claimedEvt && afterClaim.appliedEvt);

  // ১২) ফ্রিকোয়েন্সি: রিলোডের পর আবার দেখায় না
  await page.reload();
  await page.waitForTimeout(2600);
  await mouseExit(page);
  record('১২. একই ভিজিটরকে ফ্রিকোয়েন্সির মধ্যে আবার দেখায় না', !(await popupVisible(page)));

  // ১৩) ফ্রিকোয়েন্সির সময় (২৪ ঘণ্টা) পেরোলে আবার দেখায় — v1.3.0 ফিক্স
  await page.evaluate(() => {
    localStorage.setItem('zl_exit_shown_at', String(Date.now() - 25 * 3600 * 1000));
    document.cookie = 'zl_exit_coupon=; path=/; max-age=0';
  });
  await page.reload();
  await page.waitForTimeout(2600);
  await mouseExit(page);
  record('১৩. ফ্রিকোয়েন্সির সময় পেরোলে আবার দেখায়', await popupVisible(page));
  await ctx.close();

  /* টেস্ট ১৪: মোবাইল ব্যাক-বাটন (নতুন ভিজিটর) */
  ctx = await browser.newContext();
  page = await ctx.newPage();
  await page.goto('data:text/html,<a href="#">আগের পেজ</a>');
  await page.goto(URL);
  await page.click('body'); // user activation → ব্যাক-ট্র্যাপ আর্ম
  await page.waitForTimeout(2600);
  await page.goBack().catch(() => {}); // ব্যাক বাটন চাপা
  await page.waitForTimeout(600);
  const backShown = await popupVisible(page).catch(() => false);
  const backEvt = await page.evaluate(() =>
    (window.dataLayer || []).some((e) => e.event === 'exit_popup_shown' && e.popup_trigger === 'back_button')
  ).catch(() => false);
  const stillOnPage = page.url() === URL;
  record('১৪. মোবাইল ব্যাক-বাটনে পপআপ আসে (পেজেই থাকে)', backShown && backEvt && stillOnPage);
  await ctx.close();

  /* টেস্ট ১৫: সময়ের আগে ব্যাক চাপলে ভিজিটর আটকায় না (pass-through) */
  ctx = await browser.newContext();
  page = await ctx.newPage();
  const PREV = 'data:text/html,<title>prev</title>আগের পেজ';
  await page.goto(PREV);
  await page.goto(URL);
  await page.click('body'); // আর্ম হয়, কিন্তু ২ সেকেন্ড হয়নি
  await page.waitForTimeout(300);
  await page.goBack().catch(() => {});
  await page.waitForTimeout(1200);
  record('১৫. সময়ের আগে ব্যাক চাপলে স্বাভাবিকভাবে বেরিয়ে যায়', page.url() !== URL, page.url().slice(0, 30));
  await ctx.close();

  /* টেস্ট ১৬: মোবাইল দ্রুত স্ক্রল-আপ ট্রিগার */
  ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForTimeout(2600);
  await page.evaluate(() => new Promise((done) => {
    window.scrollTo(0, 1400);
    setTimeout(() => { window.scrollTo(0, 800); setTimeout(done, 300); }, 120);
  }));
  record('১৬. দ্রুত স্ক্রল-আপে পপআপ আসে (মোবাইল ভিউপোর্ট)', await popupVisible(page));
  await ctx.close();

  await browser.close();
  server.close();

  const passed = results.filter((r) => r.pass).length;
  console.log('\n===== ফলাফল: ' + passed + '/' + results.length + ' পাস =====');
  process.exit(passed === results.length ? 0 : 1);
})();
