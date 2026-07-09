# ফোকাস (Focus) 🕌

**আপনার কর্মদিবস সাজান সালাতের চারপাশে — সালাত সাজাবেন না কাজের ফাঁকে।**

Focus is a prayer-aware deep work timer (PWA). It divides your day into
**salat blocks** — the natural work windows between the five daily prayers.
Start a focus session, work deeply, and the moment prayer time arrives the
app stops you with a full-screen **Salat Gate**: *"stop working, it's time
to pray."*

দিনটা আমাদের কাছে ২৪ ঘণ্টা নয় — ৫টা ওয়াক্তের মাঝের ৫–৬টা ব্লক:

```
ফজর ──[ব্লক ১]── যোহর ──[ব্লক ২]── আসর ──[ব্লক ৩]── মাগরিব ──[ব্লক ৪]── এশা ──[ব্লক ৫]
```

## Features (MVP)

- 🕐 **Offline prayer times** — calculated on-device with [adhan-js](https://github.com/batoulapps/adhan-js); no server, no account, no data leaves your phone. Default: Karachi method + Hanafi asr (configurable).
- 🕌 **জুমা** shown instead of যোহর on Fridays.
- 🎯 **Prayer-aware focus timer** — a session never crosses into prayer time; soft warning N minutes (default 15) before the waqt.
- 🚪 **Salat Gate** — full-screen prompt at prayer time with an ayah/hadith; "৫ মিনিট পরে" allowed at most twice.
- ✅ **Daily scoreboard & streak** — on-time prayers, focus minutes, consecutive 5/5 days.
- 🌐 **বাংলা + English**, Bengali numerals in bn mode.
- 📱 **Installable PWA**, works fully offline; in-app notifications while open.

See [`../docs/PRD-salat-focus.md`](../docs/PRD-salat-focus.md) for the full product spec.

## Development

```bash
npm install
npm run icons   # regenerate PWA icons (pure Node, no deps)
npm run dev     # local dev server
npm test        # unit tests (prayer windows, jumu'ah, streaks, i18n)
npm run build   # production build (dist/)
```

## Deploying

`npm run build` produces a static `dist/` — host it anywhere (Netlify,
Vercel, GitHub Pages, Cloudflare Pages). HTTPS is required for
notifications and PWA install.

## Disclaimer

Prayer times are astronomically calculated — always verify against your
local masjid. সময়সূচী জ্যোতির্বৈজ্ঞানিক গণনায় তৈরি — স্থানীয় মসজিদের সাথে মিলিয়ে নিন।
