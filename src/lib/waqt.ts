export type WaqtId = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export interface Waqt {
  id: WaqtId;
  label: string; // Bengali
}

export const WAQTS: Waqt[] = [
  { id: 'fajr',    label: 'ফজর' },
  { id: 'dhuhr',   label: 'জোহর' },
  { id: 'asr',     label: 'আসর' },
  { id: 'maghrib', label: 'মাগরিব' },
  { id: 'isha',    label: 'ইশা' },
];

/**
 * Approximate waqt windows (local time).
 * These are heuristics for UI grouping, not precise prayer times.
 *  fajr:    04:00 – 06:30  (pre-sunrise window)
 *  dhuhr:   12:00 – 15:30
 *  asr:     15:30 – 17:30
 *  maghrib: 17:30 – 19:00
 *  isha:    19:00 – 04:00
 *  06:30 – 12:00 → ishraq/duha → bucket as 'fajr' (still morning recitation)
 */
export function getCurrentWaqt(date = new Date()): WaqtId {
  const mins = date.getHours() * 60 + date.getMinutes();
  if (mins >= 240  && mins < 720)  return 'fajr';     // 04:00 – 12:00
  if (mins >= 720  && mins < 930)  return 'dhuhr';    // 12:00 – 15:30
  if (mins >= 930  && mins < 1050) return 'asr';      // 15:30 – 17:30
  if (mins >= 1050 && mins < 1140) return 'maghrib';  // 17:30 – 19:00
  return 'isha';                                       // 19:00 – 04:00
}

export function waqtLabel(id: WaqtId): string {
  return WAQTS.find(w => w.id === id)?.label ?? '';
}
