# Master Planning & Feature Architecture Blueprint

**Project:** Advanced Exit-Intent & Behavioral Popup Plugin for WooCommerce + CartFlows + Elementor
**Optimized for:** Mobile traffic from Facebook Ads (Facebook In-App Browser / WebView)
**Status:** Phase 1 — Brainstorming, Architecture & Logic (no code)
**Working name:** *RescueCart* (placeholder — final name TBD)

---

## 1. Expert Review of the Core Concept

### What is strong about this concept

- **The trigger mix is correct for the target environment.** Classic exit-intent (mouse leaving the viewport) does not exist on mobile. Your three chosen signals — dwell time + scroll depth, fast up-scroll (the user reaching for the URL bar / back gesture), and the back-button intercept — are exactly the three signals that *do* work inside a mobile WebView.
- **Same-page recovery is the right conversion model.** On a CartFlows one-page checkout, sending the user anywhere else (a coupon page, a cart page) would kill the conversion. Applying the coupon via AJAX, refreshing fragments in place, and scrolling to the form keeps the user inside the funnel with zero page loads — which matters double in the Facebook browser, where every navigation risks the user closing the WebView.
- **A concrete, small discount (e.g., 50 TK) is a proven abandonment-rescue pattern**, especially for COD-heavy markets like Bangladesh where the final objection is often small.

### The four risks we must design around (not after)

1. **Coupon abuse.** "An AJAX request creates a coupon" is an attack surface. If the endpoint is naive, bots and repeat visitors will mint unlimited discounts. → Solved in §6 (Coupon Service design: server-authoritative, session-bound, single-use, auto-expiring).
2. **Back-button trapping.** `history.pushState` interception must fire **once**, then genuinely let the user leave on the next back press. A back-button *trap* frustrates users, and Google classifies persistent history manipulation as an abusive experience (ad-ranking / Chrome intervention risk). → Solved in §5.3 (one-shot sentinel design).
3. **Facebook WebView quirks.** iOS WKWebView and Android WebView inside the Facebook app have unreliable `beforeunload`, storage partitioning/eviction (especially iOS ITP), viewport-height (`vh`) bugs, and occasionally odd history behavior. → Solved in §8 (compatibility layer with feature detection + graceful degradation).
4. **Page caching.** Most WooCommerce stores run a cache plugin. A cached checkout page means stale nonces → every AJAX call fails silently. → Solved in §7 (nonce strategy via `wc-ajax` style dynamic endpoint).

**Verdict:** The concept is sound and commercially valuable. The plan below keeps your core mechanism intact and hardens it, plus adds conversion features (intent scoring, countdown urgency, A/B testing, Meta Pixel events, analytics) that compound its value.

---

## 2. Product Definition

### 2.1 One-line definition
When a mobile buyer on a CartFlows one-page checkout shows intent to leave, show one perfectly-timed offer that applies itself to the order in one tap — no reload, no navigation, no re-typing.

### 2.2 Target user (store owner)
- Runs Facebook/Instagram ads to WooCommerce landing pages built with Elementor.
- Uses CartFlows one-page checkout (often COD).
- Non-technical: needs presets and sensible defaults, not a JS rules language.

### 2.3 Success metrics the plugin itself must measure
- Popup impression rate (per trigger type)
- Claim rate (popup shown → discount claimed)
- Rescue conversion rate (claimed → order placed)
- Attributed revenue (orders carrying a plugin-issued coupon)
- Net discount cost vs. rescued revenue

---

## 3. High-Level Architecture

```
┌─────────────────────────────  BROWSER (mobile / FB WebView)  ─────────────────────────────┐
│                                                                                           │
│  Behavior Engine (vanilla JS, ~12–15 KB, no jQuery dependency for the engine itself)      │
│  ├─ Signal Collectors: dwell timer, scroll tracker, velocity tracker,                     │
│  │   history sentinel, visibility watcher, checkout-field watcher                         │
│  ├─ Intent Scoring Core (weighted signals → single intent score)                          │
│  ├─ Trigger Arbiter (thresholds, frequency caps, cooldowns, one-per-session)              │
│  ├─ Popup Renderer (template injected server-side, hidden; JS only toggles/animates)      │
│  └─ Claim Handler (AJAX → apply coupon → refresh fragments → smooth-scroll → focus)       │
│                                                                                           │
└───────────────────────────────────────────┬───────────────────────────────────────────────┘
                                            │  dynamic AJAX endpoint (cache-proof)
┌───────────────────────────────────────────┴───────────────────────────────────────────────┐
│                                      WORDPRESS (PHP)                                      │
│                                                                                           │
│  Core Plugin Container (single entry file + PSR-4 autoloaded /includes)                   │
│  ├─ Settings Service          — campaign config, trigger thresholds, offer definition     │
│  ├─ Campaign/Rules Engine     — where to run (flow pages), device targeting, schedules    │
│  ├─ Coupon Service            — mint/validate/apply/expire session-bound Woo coupons      │
│  ├─ Endpoint Controller       — claim, impression-log, nonce-refresh (REST + wc-ajax)     │
│  ├─ Abuse Guard               — rate limiting, session binding, honeypot, IP throttle     │
│  ├─ Analytics Service         — event log (custom table), attribution to orders           │
│  ├─ Integration Adapters      — WooCommerce, CartFlows, Elementor, Meta Pixel/CAPI        │
│  ├─ Compatibility Layer       — cache-plugin awareness, theme/JS conflict isolation       │
│  └─ Admin UI                  — campaign builder, popup designer (presets), dashboard     │
│                                                                                           │
│  Storage: wp_options (settings) · custom table (analytics events) ·                       │
│           shop_coupon posts + meta (issued coupons) · order meta (attribution)            │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

**Key architectural decisions (and why):**

| Decision | Choice | Rationale |
|---|---|---|
| Frontend engine | Vanilla JS, dependency-free | FB WebView is slow; jQuery may load late/deferred; the engine must boot fast and never break if the theme's jQuery is broken. We *use* jQuery only to trigger Woo's own `update_checkout` events, feature-detected. |
| Popup markup | Rendered server-side into the page (hidden), not built in JS | Instant display (no layout jank at the critical moment), Elementor/brand styling possible, no template strings shipped in JS. |
| AJAX transport | `wc-ajax`-style dynamic endpoint (+ REST as secondary) | `wc-ajax` endpoints bypass page cache by design; solves the stale-nonce problem that kills naive popup plugins on cached sites. |
| Coupons | Real WooCommerce `shop_coupon` objects, minted server-side per session | Full compatibility with totals, refunds, reporting; nothing custom in the totals pipeline. |
| Analytics | Custom DB table, not post meta | High-volume append-only writes; cheap aggregation for the dashboard; auto-pruned. |
| State on client | `sessionStorage` primary, cookie fallback | iOS WebView may evict/partition `localStorage`; session-scoped state is all we need, cookie covers the rest. |

---

## 4. Intent Scoring Engine (my main architectural enhancement)

Instead of three independent triggers each firing the popup, all signals feed **one intent score (0–100)**. The popup fires when the score crosses a threshold **and** the arbiter's policies allow it.

**Why:** isolated triggers either fire too eagerly (annoying) or too conservatively (useless). A score lets weak signals *combine* — e.g., 40s dwell + 70% scroll + one fast up-scroll = leave intent, even though no single signal alone would qualify. It also gives store owners one intuitive dial ("sensitivity: low / balanced / aggressive") instead of six raw thresholds.

**Signals and default weights (all tunable, presets provided):**

| Signal | Detection | Default contribution |
|---|---|---|
| Dwell + scroll depth | ≥ N seconds on page AND ≥ M% max scroll depth | up to +35 |
| Fast up-scroll | upward scroll velocity above threshold (px/ms over a rolling window), near top of page | +30 per event (decays) |
| Back-button press | `popstate` on our sentinel state | **+100 (immediate fire — this signal is definitive)** |
| Tab/app switch & return | `visibilitychange` hidden→visible after ≥ X s | +20 |
| Checkout form abandonment | focused a checkout field, then blurred + no input for Y s | +25 |
| Idle | no touch/scroll for Z s after partial scroll | +15 |

**Trigger Arbiter policies (hard rules that override the score):**
- Max **one popup per session** (configurable), with a per-visitor cooldown (e.g., 24h) via cookie + fingerprint-free session key.
- **Never** fire: if cart is empty, if a plugin coupon is already applied, after order placement, on the Thank-You step, or within the first N seconds of page load (ad-click settle time).
- Back-button signal always wins arbitration if allowed (it's the last chance).

---

## 5. Trigger Mechanics — Detailed Logic

### 5.1 Time-Spent + Scrolling
- Dwell timer counts only *visible* time (pauses on `visibilitychange: hidden`) — FB users constantly flip back to the feed; wall-clock time overcounts.
- Scroll depth = max depth reached (percentage of scrollable height), throttled sampling.
- Both conditions must hold before this signal contributes.

### 5.2 Fast Up-Scroll
- Rolling window (~300ms) of scroll positions → upward velocity in px/ms.
- Fires only when: velocity > threshold, direction sustained, and resulting position lands in the top ~20% of the page (the "reaching for chrome/back" gesture), with a small debounce so normal re-reading doesn't trigger it.
- Mobile-only signal (disabled when a fine pointer is detected; desktop gets classic `mouseleave` exit-intent as a bonus signal instead).

### 5.3 Mobile Back-Button Intercept (one-shot sentinel — the safe design)
1. On page load (only on pages where a campaign is active), push **one** sentinel history entry.
2. On `popstate`: if the popup hasn't been shown this session → suppress the exit *once*, show the popup, and mark the sentinel spent.
3. The sentinel is **never re-armed**. The next back press navigates away normally. If the user dismisses the popup, back also works normally.
4. Edge handling: skip arming entirely if `history.length` manipulation is unavailable, if we detect an in-app browser that mishandles `popstate` (feature-tested, not UA-assumed), or if another plugin already manipulates history (namespace check on `history.state`).

This gives you the intercept you asked for while staying on the right side of both UX and Google's abusive-experience rules.

### 5.4 Facebook In-App Browser specifics
- Detect FB/IG WebView via UA markers (`FBAN`, `FBAV`, `Instagram`) **plus** feature tests; detection selects a compatibility profile, it never gates core function.
- In FB profile: rely more on up-scroll + dwell (history behavior is the least reliable there), use `dvh`-safe sizing for the popup (WebView `vh` bug), and prefer bottom-sheet presentation (thumb-reachable, feels native, avoids the "blocked overlay" feel that makes users close the WebView).

---

## 6. The Conversion Flow (popup → paid order)

### 6.1 User-visible flow
1. Popup appears (bottom sheet on mobile): offer headline, discount amount (e.g., **৳50 off**), a **countdown timer** (e.g., 10:00 — urgency, also matches the coupon's real expiry), one big claim button, small dismiss affordance.
2. Tap claim → button shows inline loading state (popup stays; no navigation).
3. On success: popup collapses into a slim sticky confirmation bar ("৳50 discount applied — expires in 9:58"), checkout totals update in place, page smooth-scrolls to the CartFlows checkout form, first empty required field gets focus (without popping the keyboard disruptively — focus after scroll settles).
4. User completes checkout → Thank-You page. The sticky bar and all triggers are permanently disarmed for the session.

### 6.2 Server-side claim sequence (the security-critical path)
1. Request arrives at the dynamic endpoint with: session token, campaign ID, nonce.
2. **Abuse Guard** checks, in order: nonce validity → session already claimed? → per-IP rate limit (transient-based) → honeypot field empty → cart non-empty → campaign active for this page/device.
3. **Coupon Service** mints a real WooCommerce coupon: random unguessable code (prefixed, e.g. `RC-8F3K2M`), fixed-amount discount in store currency, `usage_limit = 1`, **restricted to the current WC session** (validated again at checkout via a `woocommerce_coupon_is_valid` filter tied to session key), auto-expiry (e.g., 30 min), flagged with plugin meta for attribution + cleanup.
4. Coupon is applied to the live cart server-side; response returns fresh checkout fragments + the human-readable saving.
5. Frontend triggers WooCommerce/CartFlows fragment refresh (`update_checkout`) so totals re-render natively.
6. A scheduled cleanup task (WP-Cron / Action Scheduler if present) trashes expired unused plugin coupons daily, keeping the coupon list clean.
7. On order completion with a plugin coupon: write attribution meta to the order, log the conversion event, and (if enabled) fire the Meta Pixel/CAPI event.

### 6.3 Edge cases we handle by design
- **Cart empties between popup and claim** → friendly error, popup offers "reload offer" path.
- **Coupon already applied / stacking** → configurable: block stacking (default) or allow.
- **Woo coupons disabled globally** → plugin detects at campaign save time and warns the admin; frontend never arms.
- **AJAX failure (flaky mobile network)** → automatic single retry with backoff, then a "try again" state; never a dead button.
- **User claims but doesn't buy** → coupon expires harmlessly; optional (later phase) "you left a discount behind" follow-up hook.

---

## 7. Cache & Performance Strategy

- **Assets load only where campaigns run** (CartFlows checkout steps / targeted pages) — zero footprint elsewhere. Engine deferred; boot cost < ~10ms; no layout shift (popup pre-rendered hidden).
- **Nonce/cache problem:** the page may be cached for hours, so nonces are *not* trusted from page HTML. First engine interaction fetches a fresh token from the dynamic (cache-bypassing) endpoint; claim requests use that. This single decision eliminates the #1 field failure of popup plugins on cached WooCommerce sites.
- **Budget:** engine + styles ≤ ~18 KB gzipped total; no external requests; no web fonts of its own.

---

## 8. Compatibility & Degradation Matrix

| Environment | Behavior |
|---|---|
| FB/IG in-app browser (primary target) | Full function, FB compatibility profile (§5.4) |
| Regular mobile Chrome/Safari | Full function, standard profile |
| Desktop | Bonus: classic `mouseleave` exit-intent replaces up-scroll/back signals |
| CartFlows absent (plain Woo checkout) | Works — fragment refresh + scroll target fall back to standard Woo checkout selectors |
| Elementor absent | Works — popup uses built-in presets; Elementor is an enhancement (styling/widgets), never a dependency |
| JS disabled / engine fails to boot | Silent no-op; checkout is never affected. **Hard rule: the plugin must be incapable of breaking checkout.** |

Every integration touchpoint (CartFlows selectors, Woo events) goes through the adapter layer with feature detection, so a CartFlows/Woo update degrades gracefully instead of fatally.

---

## 9. Admin Experience

- **Campaign builder:** offer amount & currency label, coupon expiry, trigger sensitivity preset (Low / Balanced / Aggressive) with an "advanced" drawer exposing raw thresholds, page targeting (auto-detects CartFlows flows), device targeting, schedule.
- **Popup designer:** 3–4 mobile-first presets (bottom sheet, center modal, full-card), colors/text/logo, live mobile preview, full i18n (Bangla-ready — all strings translatable, amount formatting via Woo currency settings).
- **Dashboard:** funnel (impressions → claims → orders), revenue rescued vs. discount cost, breakdown by trigger type — this last one tells the owner *which* exit signal actually converts their audience.
- **A/B testing (v1.1 candidate):** two popup variants per campaign, automatic split, winner stats.
- **Health panel:** environment checks (coupons enabled, cache plugin detected, CartFlows version, FB-browser share of recent traffic).

---

## 10. Security Checklist (summary)

- All endpoints: nonce + origin checks; admin screens: capability checks (`manage_woocommerce`).
- Coupons: server-minted only, unguessable, single-use, session-bound, auto-expiring, revalidated at checkout — the client can never dictate discount amount or code.
- Rate limiting per IP + per session; honeypot on the claim call.
- All input sanitized, all output escaped; no raw SQL outside `$wpdb->prepare`; analytics table writes are fire-and-forget (never block checkout).
- Uninstall routine: removes options, tables, and expired plugin coupons (with an admin opt-in to keep data).

---

## 11. Proposed Build Roadmap (for Phase 2, upon approval)

| Milestone | Scope |
|---|---|
| **M1 — Skeleton & Settings** | Plugin container, autoloading, activation/uninstall, settings service, campaign CRUD, asset loader |
| **M2 — Coupon & Endpoint Core** | Coupon Service, Abuse Guard, dynamic endpoints, session binding, cleanup cron |
| **M3 — Behavior Engine** | Signal collectors, intent scoring, arbiter, sentinel back-intercept, FB profile |
| **M4 — Popup & Conversion Flow** | Presets, renderer, claim flow, fragment refresh, scroll+focus, countdown, sticky bar |
| **M5 — Analytics, Pixel & Polish** | Events table, dashboard, order attribution, Meta Pixel/CAPI hooks, i18n, compatibility passes |

---

## 12. Open Decisions (need your input before Phase 2)

1. **Discount type:** fixed amount only (e.g., ৳50), or also percentage / free-shipping options in v1?
2. **Popup frequency:** confirm "one per session + 24h cooldown" as the default policy?
3. **Coupon expiry:** confirm ~30 minutes (drives the countdown urgency) or another window?
4. **Meta Pixel event on claim:** include in v1 (browser-side Pixel event) or defer CAPI/server-side to v1.1?
5. **Plugin name** for the codebase (folder/prefix/text-domain) — "RescueCart" is a placeholder.
