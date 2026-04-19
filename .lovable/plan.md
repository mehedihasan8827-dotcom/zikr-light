
## Islamic Zikr Tracker — Build Plan

A focused, mobile-first single-screen app for tracking two specific zikrs across the five daily prayers (waqts), with Bengali UI and Arabic text.

### Layout (top → bottom, single screen)
1. **Header** — App title in Bengali ("যিকর") + small subtitle, current waqt name highlighted.
2. **Waqt tabs** — ফজর · জোহর · আসর · মাগরিব · ইশা. Auto-selected from device time on load. Tapping switches the active waqt.
3. **Two thin progress bars** — Istegfar (teal) and Durood (gold), reflecting current count vs target for the active waqt.
4. **Two stacked zikr cards** (Istegfar on top, Durood below):
   - Colored badge: name + target ("১০০০ বার" / "১০০ বার")
   - Arabic text in large Amiri font
   - Bengali transliteration underneath
   - Mini circular SVG progress ring (top-right) showing count/target
   - Lap counter badge ("X বার")
   - Full-width gradient tap button (haptic + ripple on tap)
   - Small icon-only reset button
5. **5 waqt completion dots** — one per waqt; teal = istegfar done, gold = durood done, teal→gold gradient = both done, dim = neither.
6. **Bottom stats bar** — 4 tiles: আজকের ইস্তেগফার, এ ওয়াক্তে ইস্তেগফার, আজকের দরূদ, এ ওয়াক্তে দরূদ.

### Behavior
- **Counting**: each tap increments active waqt's count for that zikr; triggers `navigator.vibrate(15)`, a ripple animation, and updates the ring.
- **Completion**: when count hits target → laps++, count resets to 0, full-screen overlay appears with emoji, Arabic text, "মাশাআল্লাহ!" title, Bengali message including waqt name + lap count, a short dua in Arabic, and an "আবার শুরু" button. Colored confetti particles (teal or gold) + strong vibration pattern (e.g. `[80,40,80,40,160]`).
- **Auto waqt detection**: simple time-of-day ranges (Fajr 4–6, Dhuhr 12–15, Asr 15–17, Maghrib 17–19, Isha 19–4). User can override via tabs.
- **Persistence**: `sessionStorage` keyed by waqt + zikr (count + laps). Daily totals derived by summing across all 5 waqts.
- **Bengali numerals**: util to convert digits 0-9 → ০-৯ for every displayed number.

### Design system
- Background `#080c10` with subtle Islamic 8-point star SVG pattern overlay (low opacity).
- Istegfar accent `#1a9e8e` (teal), Durood accent `#d4a017` (gold), defined as HSL tokens in `index.css` and exposed via Tailwind theme.
- Fonts loaded from Google Fonts: **Amiri** for Arabic, **Noto Serif Bengali** for UI; applied via utility classes.
- Smooth animations: fade-in for overlay, scale-in for cards, ripple on tap, confetti via lightweight inline particles.

### Files to add / change
- `index.html` — add Google Fonts links for Amiri & Noto Serif Bengali.
- `tailwind.config.ts` — register `istegfar`, `durood` color tokens, `amiri` & `bengali` font families, and ripple/confetti keyframes.
- `src/index.css` — dark theme tokens (#080c10 background), star-pattern background, base font-family Bengali.
- `src/lib/bengali.ts` — `toBengaliNumber()` util.
- `src/lib/waqt.ts` — waqt list, current-waqt detector, labels.
- `src/lib/storage.ts` — sessionStorage get/set per waqt + zikr.
- `src/components/WaqtTabs.tsx` — 5 prayer tabs.
- `src/components/WaqtDots.tsx` — 5-dot completion indicator.
- `src/components/ProgressBars.tsx` — two thin top progress bars.
- `src/components/ZikrCard.tsx` — reusable card (props: variant istegfar/durood, arabic, translit, target, count, laps, onTap, onReset).
- `src/components/CompletionOverlay.tsx` — full-screen mashallah overlay with confetti.
- `src/components/StatsBar.tsx` — 4 stat tiles.
- `src/pages/Index.tsx` — composes everything; holds active waqt + counts state, handles tap/reset/completion logic.

### Out of scope
- No routing, no auth, no backend. Pure client-side, single screen.
