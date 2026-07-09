import type { Lang } from "./i18n";
import type { MethodKey, PrayerKey } from "./prayer";
import { PRAYER_KEYS } from "./prayer";

export interface Settings {
  lang: Lang;
  lat: number;
  lng: number;
  city: string;
  method: MethodKey;
  madhab: "hanafi" | "shafi";
  preWarnMin: number;
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: "bn",
  lat: 23.8103,
  lng: 90.4125,
  city: "ঢাকা",
  method: "Karachi",
  madhab: "hanafi",
  preWarnMin: 15,
  onboarded: false,
};

export type PrayedStatus = "ontime" | "late";

export interface DayRecord {
  prayed: Partial<Record<PrayerKey, PrayedStatus>>;
  focusMinutes: number;
  sessions: number;
  snoozes: number;
}

export interface FocusSession {
  task: string;
  startedAt: number;
}

const SETTINGS_KEY = "focus:settings";
const DAYS_KEY = "focus:days";
const SESSION_KEY = "focus:session";
const KEEP_DAYS = 90;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full/unavailable — app keeps working in memory
  }
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...(read<Partial<Settings>>(SETTINGS_KEY) ?? {}) };
}

export function saveSettings(s: Settings) {
  write(SETTINGS_KEY, s);
}

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type DayMap = Record<string, DayRecord>;

export function loadDays(): DayMap {
  return read<DayMap>(DAYS_KEY) ?? {};
}

export function saveDays(days: DayMap) {
  const keys = Object.keys(days).sort();
  if (keys.length > KEEP_DAYS) {
    for (const k of keys.slice(0, keys.length - KEEP_DAYS)) delete days[k];
  }
  write(DAYS_KEY, days);
}

export function emptyDay(): DayRecord {
  return { prayed: {}, focusMinutes: 0, sessions: 0, snoozes: 0 };
}

export function loadSession(): FocusSession | null {
  return read<FocusSession>(SESSION_KEY);
}

export function saveSession(s: FocusSession | null) {
  if (s === null) localStorage.removeItem(SESSION_KEY);
  else write(SESSION_KEY, s);
}

export function isFullDay(rec: DayRecord | undefined): boolean {
  if (!rec) return false;
  return PRAYER_KEYS.every((k) => rec.prayed[k] !== undefined);
}

/**
 * Consecutive days with all 5 prayers marked, counting backwards from today
 * (today itself counts only once complete; an incomplete today doesn't break
 * a streak that ran through yesterday).
 */
export function computeStreak(days: DayMap, today: Date): number {
  let streak = 0;
  const cursor = new Date(today);
  if (isFullDay(days[dateKey(cursor)])) {
    streak++;
  }
  cursor.setDate(cursor.getDate() - 1);
  while (isFullDay(days[dateKey(cursor)])) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
