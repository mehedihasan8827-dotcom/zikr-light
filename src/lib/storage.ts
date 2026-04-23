import type { WaqtId } from './waqt';
import { todayKey, setTotals } from './history';

export type ZikrId = 'istegfar' | 'durood';

export interface ZikrState {
  count: number;
  laps: number;
}

const KEY = 'zikr-tracker-v1';
const TARGETS = { istegfar: 1000, durood: 100 } as const;

type AllState = Record<WaqtId, Record<ZikrId, ZikrState>>;

interface Persisted {
  date: string; // YYYY-MM-DD
  state: AllState;
}

const empty = (): ZikrState => ({ count: 0, laps: 0 });

function blank(): AllState {
  return {
    fajr:    { istegfar: empty(), durood: empty() },
    dhuhr:   { istegfar: empty(), durood: empty() },
    asr:     { istegfar: empty(), durood: empty() },
    maghrib: { istegfar: empty(), durood: empty() },
    isha:    { istegfar: empty(), durood: empty() },
  };
}

function totalsOf(state: AllState) {
  let i = 0, d = 0;
  (Object.keys(state) as WaqtId[]).forEach(w => {
    i += state[w].istegfar.laps * TARGETS.istegfar + state[w].istegfar.count;
    d += state[w].durood.laps   * TARGETS.durood   + state[w].durood.count;
  });
  return { istegfar: i, durood: d };
}

export function loadAll(): AllState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw) as Persisted | AllState;
    const today = todayKey();

    // Legacy format (no date wrapper) — treat as today, no rollover
    if (!('date' in (parsed as any)) || !('state' in (parsed as any))) {
      return { ...blank(), ...(parsed as AllState) };
    }

    const p = parsed as Persisted;
    if (p.date !== today) {
      // Day changed — archive previous day's totals, then reset
      try { setTotals(p.date, totalsOf(p.state)); } catch {}
      const fresh = blank();
      saveAll(fresh);
      return fresh;
    }
    return { ...blank(), ...p.state };
  } catch {
    return blank();
  }
}

export function saveAll(state: AllState) {
  try {
    const payload: Persisted = { date: todayKey(), state };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {}
}
