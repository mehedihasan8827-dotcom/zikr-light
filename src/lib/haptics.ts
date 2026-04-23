// Lightweight haptic helper using the Vibration API (mobile only).
// Silently no-ops where unsupported or disabled.

export type HapticIntensity = 'tap' | 'lap';

let enabled = true;

export function setHapticsEnabled(v: boolean) {
  enabled = v;
}

export function haptic(kind: HapticIntensity = 'tap') {
  if (!enabled) return;
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    if (kind === 'tap') navigator.vibrate(8);
    else navigator.vibrate([18, 40, 35]);
  } catch {}
}
