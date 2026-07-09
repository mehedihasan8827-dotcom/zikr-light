import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from "adhan";
import type { Lang, StringKey } from "./i18n";

export type PrayerKey = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";

export const PRAYER_KEYS: PrayerKey[] = [
  "fajr",
  "dhuhr",
  "asr",
  "maghrib",
  "isha",
];

export type MethodKey =
  | "Karachi"
  | "MuslimWorldLeague"
  | "Egyptian"
  | "UmmAlQura"
  | "NorthAmerica";

export const METHOD_LABELS: Record<MethodKey, string> = {
  Karachi: "Karachi (বাংলাদেশ/উপমহাদেশ)",
  MuslimWorldLeague: "Muslim World League",
  Egyptian: "Egyptian",
  UmmAlQura: "Umm Al-Qura (মক্কা)",
  NorthAmerica: "ISNA (North America)",
};

export interface CalcSettings {
  lat: number;
  lng: number;
  method: MethodKey;
  madhab: "hanafi" | "shafi";
}

export interface DayPrayer {
  key: PrayerKey;
  time: Date;
}

function params(settings: CalcSettings) {
  const p = CalculationMethod[settings.method]();
  p.madhab = settings.madhab === "hanafi" ? Madhab.Hanafi : Madhab.Shafi;
  return p;
}

export function getDayPrayers(date: Date, settings: CalcSettings): DayPrayer[] {
  const pt = new PrayerTimes(
    new Coordinates(settings.lat, settings.lng),
    date,
    params(settings),
  );
  return [
    { key: "fajr", time: pt.fajr },
    { key: "dhuhr", time: pt.dhuhr },
    { key: "asr", time: pt.asr },
    { key: "maghrib", time: pt.maghrib },
    { key: "isha", time: pt.isha },
  ];
}

export function getSunrise(date: Date, settings: CalcSettings): Date {
  const pt = new PrayerTimes(
    new Coordinates(settings.lat, settings.lng),
    date,
    params(settings),
  );
  return pt.sunrise;
}

/** Friday's dhuhr is Jumu'ah. */
export function prayerLabelKey(key: PrayerKey, date: Date): StringKey {
  if (key === "dhuhr" && date.getDay() === 5) return "jumuah";
  return key;
}

export interface NextPrayer {
  key: PrayerKey;
  time: Date;
  /** The date whose prayer this is (today or tomorrow). */
  date: Date;
  isTomorrow: boolean;
}

export function getNextPrayer(now: Date, settings: CalcSettings): NextPrayer {
  for (const p of getDayPrayers(now, settings)) {
    if (p.time.getTime() > now.getTime()) {
      return { key: p.key, time: p.time, date: now, isTomorrow: false };
    }
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const fajr = getDayPrayers(tomorrow, settings)[0];
  return { key: fajr.key, time: fajr.time, date: tomorrow, isTomorrow: true };
}

/**
 * The prayer whose window contains `now` (started, next prayer not yet in),
 * or null before fajr. A prayer's window ends when the next prayer begins;
 * isha's window ends at tomorrow's fajr.
 */
export function getCurrentPrayer(
  now: Date,
  settings: CalcSettings,
): DayPrayer | null {
  const todays = getDayPrayers(now, settings);
  // Before today's fajr we may still be inside yesterday's isha window.
  if (now.getTime() < todays[0].time.getTime()) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isha = getDayPrayers(yesterday, settings)[4];
    return now.getTime() >= isha.time.getTime() ? isha : null;
  }
  let current: DayPrayer = todays[0];
  for (const p of todays) {
    if (p.time.getTime() <= now.getTime()) current = p;
  }
  return current;
}

/** When the given prayer's window ends (= start of the following prayer). */
export function getWindowEnd(
  prayer: DayPrayer,
  settings: CalcSettings,
): Date {
  const dayPrayers = getDayPrayers(prayer.time, settings);
  const idx = dayPrayers.findIndex((p) => p.key === prayer.key);
  if (idx < dayPrayers.length - 1) return dayPrayers[idx + 1].time;
  const tomorrow = new Date(prayer.time);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getDayPrayers(tomorrow, settings)[0].time;
}

export function prayerEmoji(key: PrayerKey): string {
  switch (key) {
    case "fajr":
      return "🌅";
    case "dhuhr":
      return "☀️";
    case "asr":
      return "🌤️";
    case "maghrib":
      return "🌇";
    case "isha":
      return "🌙";
  }
}

export interface City {
  name: { bn: string; en: string };
  lat: number;
  lng: number;
}

export const CITIES: City[] = [
  { name: { bn: "ঢাকা", en: "Dhaka" }, lat: 23.8103, lng: 90.4125 },
  { name: { bn: "চট্টগ্রাম", en: "Chattogram" }, lat: 22.3569, lng: 91.7832 },
  { name: { bn: "সিলেট", en: "Sylhet" }, lat: 24.8949, lng: 91.8687 },
  { name: { bn: "রাজশাহী", en: "Rajshahi" }, lat: 24.3745, lng: 88.6042 },
  { name: { bn: "খুলনা", en: "Khulna" }, lat: 22.8456, lng: 89.5403 },
  { name: { bn: "বরিশাল", en: "Barishal" }, lat: 22.701, lng: 90.3535 },
  { name: { bn: "রংপুর", en: "Rangpur" }, lat: 25.7439, lng: 89.2752 },
  { name: { bn: "ময়মনসিংহ", en: "Mymensingh" }, lat: 24.7471, lng: 90.4203 },
  { name: { bn: "কুমিল্লা", en: "Cumilla" }, lat: 23.4607, lng: 91.1809 },
  { name: { bn: "কক্সবাজার", en: "Cox's Bazar" }, lat: 21.4272, lng: 92.0058 },
  { name: { bn: "মক্কা", en: "Makkah" }, lat: 21.3891, lng: 39.8579 },
  { name: { bn: "মদিনা", en: "Madinah" }, lat: 24.5247, lng: 39.5692 },
  { name: { bn: "দুবাই", en: "Dubai" }, lat: 25.2048, lng: 55.2708 },
  { name: { bn: "রিয়াদ", en: "Riyadh" }, lat: 24.7136, lng: 46.6753 },
  { name: { bn: "কুয়ালালামপুর", en: "Kuala Lumpur" }, lat: 3.139, lng: 101.6869 },
  { name: { bn: "লন্ডন", en: "London" }, lat: 51.5074, lng: -0.1278 },
  { name: { bn: "নিউ ইয়র্ক", en: "New York" }, lat: 40.7128, lng: -74.006 },
  { name: { bn: "টরন্টো", en: "Toronto" }, lat: 43.6532, lng: -79.3832 },
];

export interface GateQuote {
  text: { bn: string; en: string };
  source: { bn: string; en: string };
}

export const GATE_QUOTES: GateQuote[] = [
  {
    text: {
      bn: "নিশ্চয়ই সালাত মুমিনদের উপর নির্দিষ্ট সময়ে ফরজ করা হয়েছে।",
      en: "Indeed, prayer has been decreed upon the believers at specified times.",
    },
    source: { bn: "সূরা আন-নিসা ৪:১০৩", en: "Surah An-Nisa 4:103" },
  },
  {
    text: {
      bn: "আল্লাহর কাছে সবচেয়ে প্রিয় আমল — সালাত তার নির্ধারিত সময়ে আদায় করা।",
      en: "The deed most beloved to Allah is the prayer offered at its proper time.",
    },
    source: { bn: "বুখারী ও মুসলিম", en: "Bukhari & Muslim" },
  },
  {
    text: {
      bn: "এবং আমার স্মরণে সালাত কায়েম করো।",
      en: "And establish prayer for My remembrance.",
    },
    source: { bn: "সূরা ত্বহা ২০:১৪", en: "Surah Ta-Ha 20:14" },
  },
];

export function pickQuote(date: Date): GateQuote {
  const dayIndex =
    Math.floor(date.getTime() / 86400000) % GATE_QUOTES.length;
  return GATE_QUOTES[dayIndex];
}

export function cityLabel(city: City, lang: Lang): string {
  return city.name[lang];
}
