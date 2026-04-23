import { useEffect, useState } from 'react';
import { setHapticsEnabled } from './haptics';

export type BgTone = 'darker' | 'default' | 'lighter';

export interface AppSettings {
  patternOpacity: number; // 0..1
  bgTone: BgTone;
  haptics: boolean;
  targetIstegfar: number;
  targetDurood: number;
}

const KEY = 'zikr-settings-v1';

const DEFAULTS: AppSettings = {
  patternOpacity: 0.02,
  bgTone: 'default',
  haptics: true,
  targetIstegfar: 1000,
  targetDurood: 100,
};

export const TARGET_PRESETS = [33, 100, 300, 500, 1000];

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(s: AppSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

const BG_HSL: Record<BgTone, string> = {
  darker:  '30 12% 4%',
  default: '30 12% 7%',
  lighter: '30 10% 11%',
};

const CARD_HSL: Record<BgTone, string> = {
  darker:  '30 10% 7%',
  default: '30 10% 10%',
  lighter: '30 10% 14%',
};

export function applySettings(s: AppSettings) {
  const root = document.documentElement;
  root.style.setProperty('--background', BG_HSL[s.bgTone]);
  root.style.setProperty('--card', CARD_HSL[s.bgTone]);
  root.style.setProperty('--popover', CARD_HSL[s.bgTone]);
  root.style.setProperty('--pattern-opacity', String(s.patternOpacity));
  setHapticsEnabled(s.haptics);
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  useEffect(() => {
    applySettings(settings);
    saveSettings(settings);
  }, [settings]);

  return [settings, setSettings] as const;
}
