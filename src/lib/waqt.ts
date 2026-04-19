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

export function getCurrentWaqt(date = new Date()): WaqtId {
  const h = date.getHours();
  if (h >= 4  && h < 12) return 'fajr';        // pre-dhuhr → treat morning as fajr
  if (h >= 12 && h < 15) return 'dhuhr';
  if (h >= 15 && h < 17) return 'asr';
  if (h >= 17 && h < 19) return 'maghrib';
  return 'isha'; // 19:00 – 03:59
}

export function waqtLabel(id: WaqtId): string {
  return WAQTS.find(w => w.id === id)?.label ?? '';
}
