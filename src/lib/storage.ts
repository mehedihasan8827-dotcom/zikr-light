import type { WaqtId } from './waqt';

export type ZikrId = 'istegfar' | 'durood';

export interface ZikrState {
  count: number;
  laps: number;
}

const KEY = 'zikr-tracker-v1';

type AllState = Record<WaqtId, Record<ZikrId, ZikrState>>;

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

export function loadAll(): AllState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw);
    return { ...blank(), ...parsed };
  } catch {
    return blank();
  }
}

export function saveAll(state: AllState) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}
