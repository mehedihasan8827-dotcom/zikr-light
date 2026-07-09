export type Lang = "bn" | "en";

const strings = {
  // App shell
  appName: { bn: "ফোকাস", en: "Focus" },
  tagline: {
    bn: "আপনার কর্মদিবস সাজান সালাতের চারপাশে",
    en: "Structure your workday around salat",
  },

  // Prayer names
  fajr: { bn: "ফজর", en: "Fajr" },
  sunrise: { bn: "সূর্যোদয়", en: "Sunrise" },
  dhuhr: { bn: "যোহর", en: "Dhuhr" },
  jumuah: { bn: "জুমা", en: "Jumu'ah" },
  asr: { bn: "আসর", en: "Asr" },
  maghrib: { bn: "মাগরিব", en: "Maghrib" },
  isha: { bn: "এশা", en: "Isha" },

  // Onboarding
  obWelcomeTitle: { bn: "আসসালামু আলাইকুম 👋", en: "Assalamu alaikum 👋" },
  obWelcomeBody: {
    bn: "ফোকাস আপনার দিনকে ভাগ করে সালাতের ব্লকে — গভীর মনোযোগে কাজ করুন, আর ওয়াক্ত হলেই আমরা মনে করিয়ে দেব: কাজ থামান, সালাতের সময় হয়েছে।",
    en: "Focus divides your day into salat blocks — work deeply, and when the time comes we'll remind you: stop working, it's time to pray.",
  },
  obStart: { bn: "শুরু করি", en: "Get started" },
  obLocationTitle: { bn: "আপনার অবস্থান", en: "Your location" },
  obLocationBody: {
    bn: "নামাজের সঠিক সময় গণনার জন্য আপনার অবস্থান দরকার। সব হিসাব আপনার ফোনেই হয় — কোনো তথ্য কোথাও পাঠানো হয় না।",
    en: "We need your location to calculate accurate prayer times. Everything is computed on your device — nothing is sent anywhere.",
  },
  obUseGps: { bn: "📍 আমার অবস্থান ব্যবহার করুন", en: "📍 Use my location" },
  obGpsError: {
    bn: "অবস্থান পাওয়া যায়নি — নিচ থেকে শহর বেছে নিন",
    en: "Couldn't get location — pick a city below",
  },
  obOrCity: { bn: "অথবা শহর বেছে নিন", en: "or pick a city" },
  obNotifTitle: { bn: "রিমাইন্ডার চালু করুন", en: "Enable reminders" },
  obNotifBody: {
    bn: "ওয়াক্ত হলে ও ওয়াক্তের আগে আমরা জানিয়ে দেব — app খোলা থাকলে সবচেয়ে ভালো কাজ করে।",
    en: "We'll notify you before and at prayer time — works best while the app is open.",
  },
  obEnableNotif: { bn: "🔔 নোটিফিকেশন চালু করুন", en: "🔔 Enable notifications" },
  obSkip: { bn: "এখন নয়", en: "Not now" },
  obDone: { bn: "চলুন শুরু করি ✨", en: "Let's begin ✨" },

  // Home
  currentBlock: { bn: "চলমান ব্লক", en: "Current block" },
  untilNext: { bn: "পর্যন্ত বাকি", en: "until" },
  nextPrayer: { bn: "পরের ওয়াক্ত", en: "Next prayer" },
  todayTimes: { bn: "আজকের সময়সূচী", en: "Today's times" },
  prayedTick: { bn: "পড়েছি", en: "Prayed" },
  onTime: { bn: "সময়মতো", en: "on time" },
  late: { bn: "দেরিতে", en: "late" },

  // Focus timer
  focusTitle: { bn: "ডিপ ওয়ার্ক", en: "Deep work" },
  taskPlaceholder: {
    bn: "কী কাজ করবেন? (যেমন: অর্ডার প্যাকিং)",
    en: "What will you work on?",
  },
  startFocus: { bn: "▶ ফোকাস শুরু", en: "▶ Start focus" },
  stopFocus: { bn: "■ থামান", en: "■ Stop" },
  focusRunning: { bn: "ফোকাস চলছে", en: "Focusing" },
  sessionEndsAtPrayer: {
    bn: "এই সেশন শেষ হবে ওয়াক্তে",
    en: "This session ends at prayer time",
  },
  preWarn: {
    bn: "গুছিয়ে আনুন — একটু পরেই ওয়াক্ত",
    en: "Wrap up — prayer time is near",
  },

  // Salat gate
  gateTitle: { bn: "সময় হয়েছে", en: "It's time for" },
  gateGoing: { bn: "🕌 সালাতে যাচ্ছি", en: "🕌 Going to pray" },
  gateSnooze: { bn: "৫ মিনিট পরে", en: "5 more minutes" },
  gateSnoozeLeft: { bn: "বার বাকি", en: "left" },
  prayingTitle: { bn: "আল্লাহ কবুল করুন", en: "May Allah accept it" },
  prayingBody: {
    bn: "সালাত শেষে ফিরে এসে টিক দিন",
    en: "Come back and check in after salat",
  },
  prayedDone: { bn: "✓ সালাত পড়েছি", en: "✓ I have prayed" },
  startNextBlock: { bn: "পরের ব্লক শুরু করুন", en: "Start next block" },

  // Scoreboard
  today: { bn: "আজ", en: "Today" },
  waqtScore: { bn: "ওয়াক্ত", en: "prayers" },
  focusMinutes: { bn: "মিনিট ফোকাস", en: "min focused" },
  streak: { bn: "দিনের স্ট্রিক", en: "day streak" },
  streakHint: {
    bn: "টানা ৫/৫ ওয়াক্তের দিন",
    en: "consecutive 5/5 days",
  },

  // Settings
  settings: { bn: "সেটিংস", en: "Settings" },
  language: { bn: "ভাষা", en: "Language" },
  location: { bn: "অবস্থান", en: "Location" },
  calcMethod: { bn: "গণনা পদ্ধতি", en: "Calculation method" },
  asrMethod: { bn: "আসরের মত", en: "Asr madhab" },
  hanafi: { bn: "হানাফি", en: "Hanafi" },
  shafi: { bn: "শাফেয়ী / অন্যান্য", en: "Shafi'i / others" },
  preWarnLabel: {
    bn: "ওয়াক্তের কত মিনিট আগে সতর্ক করব?",
    en: "Warn how many minutes before prayer?",
  },
  disclaimer: {
    bn: "সময়সূচী জ্যোতির্বৈজ্ঞানিক গণনায় তৈরি — স্থানীয় মসজিদের সাথে মিলিয়ে নিন।",
    en: "Times are astronomically calculated — please verify with your local masjid.",
  },
  close: { bn: "বন্ধ করুন", en: "Close" },
  minutes: { bn: "মিনিট", en: "min" },
  tomorrow: { bn: "আগামীকাল", en: "tomorrow" },
} as const;

export type StringKey = keyof typeof strings;

export function t(key: StringKey, lang: Lang): string {
  return strings[key][lang];
}

const BN_DIGITS: Record<string, string> = {
  "0": "০", "1": "১", "2": "২", "3": "৩", "4": "৪",
  "5": "৫", "6": "৬", "7": "৭", "8": "৮", "9": "৯",
};

/** Convert Western digits in a string to Bengali digits when lang is bn. */
export function localizeDigits(s: string, lang: Lang): string {
  if (lang !== "bn") return s;
  return s.replace(/[0-9]/g, (d) => BN_DIGITS[d]);
}

export function formatTime(d: Date, lang: Lang): string {
  const s = d.toLocaleTimeString(lang === "bn" ? "bn-BD" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return s;
}

export function formatCountdown(ms: number, lang: Lang): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const raw = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  return localizeDigits(raw, lang);
}
