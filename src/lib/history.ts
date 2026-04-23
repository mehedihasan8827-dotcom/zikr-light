import type { ZikrId } from './storage';

const KEY = 'zikr-history-v1';

export type DayTotals = Record<ZikrId, number>;
export type HistoryMap = Record<string, DayTotals>; // YYYY-MM-DD -> totals

export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function loadHistory(): HistoryMap {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveHistory(h: HistoryMap) {
  try { localStorage.setItem(KEY, JSON.stringify(h)); } catch {}
}

/** Set totals for an arbitrary date (used when archiving previous day on rollover). */
export function setTotals(dateKey: string, totals: DayTotals) {
  const h = loadHistory();
  h[dateKey] = totals;
  saveHistory(h);
}

export function setToday(totals: DayTotals) {
  setTotals(todayKey(), totals);
}

/** Earliest date we have any record of (used to limit calendar back-navigation). */
export function earliestDateKey(): string | null {
  const h = loadHistory();
  const keys = Object.keys(h).sort();
  return keys[0] ?? null;
}

export function lastNDays(n: number): { key: string; date: Date }[] {
  const out: { key: string; date: Date }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push({ key: todayKey(d), date: d });
  }
  return out;
}
