import { loadHistory, todayKey, type DayTotals } from './history';

export interface StreakInfo {
  current: number;
  best: number;
  weekTotal: DayTotals;
  bestDay: { key: string; total: number } | null;
  lifetime: DayTotals;
}

function isActive(t: DayTotals | undefined, dailyI: number, dailyD: number): boolean {
  if (!t) return false;
  const i = Math.min(1, t.istegfar / dailyI);
  const d = Math.min(1, t.durood / dailyD);
  return (i + d) / 2 >= 0.5;
}

function dateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function computeStreak(
  todayTotals: DayTotals,
  dailyI: number,
  dailyD: number,
): StreakInfo {
  const history = { ...loadHistory(), [todayKey()]: todayTotals };

  // Current streak: count consecutive active days ending today (or yesterday if today not yet active)
  let current = 0;
  const start = new Date();
  // If today not active yet, start from yesterday so streak doesn't reset mid-day.
  if (!isActive(history[dateKey(start)], dailyI, dailyD)) {
    start.setDate(start.getDate() - 1);
  }
  for (let i = 0; i < 3650; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() - i);
    if (isActive(history[dateKey(d)], dailyI, dailyD)) current++;
    else break;
  }

  // Best streak: scan all sorted history keys.
  const keys = Object.keys(history).sort();
  let best = 0, run = 0;
  let prev: Date | null = null;
  for (const k of keys) {
    const d = new Date(k + 'T00:00:00');
    if (!isActive(history[k], dailyI, dailyD)) { run = 0; prev = d; continue; }
    if (prev) {
      const diff = Math.round((d.getTime() - prev.getTime()) / 86400000);
      run = diff === 1 ? run + 1 : 1;
    } else run = 1;
    if (run > best) best = run;
    prev = d;
  }
  if (current > best) best = current;

  // Week total (last 7 days incl today) + best day
  const weekTotal: DayTotals = { istegfar: 0, durood: 0 };
  let bestDay: { key: string; total: number } | null = null;
  const lifetime: DayTotals = { istegfar: 0, durood: 0 };
  for (const k of keys) {
    const t = history[k];
    lifetime.istegfar += t.istegfar;
    lifetime.durood += t.durood;
  }
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = dateKey(d);
    const t = history[k] ?? { istegfar: 0, durood: 0 };
    weekTotal.istegfar += t.istegfar;
    weekTotal.durood += t.durood;
    const total = t.istegfar + t.durood;
    if (!bestDay || total > bestDay.total) bestDay = { key: k, total };
  }

  return { current, best, weekTotal, bestDay, lifetime };
}
