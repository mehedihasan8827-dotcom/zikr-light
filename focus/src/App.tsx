import { useEffect, useMemo, useRef, useState } from "react";
import { FocusCard, NextPrayerCard, Scoreboard, Timeline } from "./components/HomeCards";
import { Onboarding } from "./components/Onboarding";
import { PrayingScreen, SalatGate } from "./components/SalatGate";
import { SettingsSheet } from "./components/SettingsSheet";
import { useNow } from "./hooks/useNow";
import type { Lang } from "./lib/i18n";
import { t } from "./lib/i18n";
import { showNotification, vibrate } from "./lib/notify";
import type { CalcSettings, DayPrayer, PrayerKey } from "./lib/prayer";
import {
  getCurrentPrayer,
  getDayPrayers,
  getNextPrayer,
  getWindowEnd,
  prayerLabelKey,
} from "./lib/prayer";
import type { DayRecord } from "./lib/store";
import {
  computeStreak,
  dateKey,
  emptyDay,
  loadDays,
  loadSession,
  loadSettings,
  saveDays,
  saveSession,
  saveSettings,
} from "./lib/store";

const MAX_SNOOZES = 2;
const SNOOZE_MS = 5 * 60_000;

interface PrayingState {
  prayer: PrayerKey;
  timeMs: number;
  dayKey: string;
}

interface SnoozeState {
  key: string;
  until: number;
  count: number;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

export default function App() {
  const now = useNow();
  const [settings, setSettings] = useState(loadSettings);
  const [days, setDays] = useState(loadDays);
  const [session, setSession] = useState(loadSession);
  const [praying, setPraying] = useState<PrayingState | null>(() => readJson<PrayingState>("focus:praying"));
  const [snooze, setSnooze] = useState<SnoozeState | null>(() => readJson<SnoozeState>("focus:snooze"));
  const [showSettings, setShowSettings] = useState(false);
  const notified = useRef<Set<string>>(new Set());

  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => saveDays(days), [days]);
  useEffect(() => saveSession(session), [session]);
  useEffect(() => writeJson("focus:praying", praying), [praying]);
  useEffect(() => writeJson("focus:snooze", snooze), [snooze]);

  const lang: Lang = settings.lang;
  const calc: CalcSettings = useMemo(
    () => ({ lat: settings.lat, lng: settings.lng, method: settings.method, madhab: settings.madhab }),
    [settings.lat, settings.lng, settings.method, settings.madhab],
  );

  const todayKey = dateKey(now);
  const todayPrayers = useMemo(
    () => getDayPrayers(now, calc),
    // recompute when the calendar day or calculation settings change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayKey, calc],
  );
  const next = useMemo(() => getNextPrayer(now, calc), [now, calc]);
  const current = useMemo(() => getCurrentPrayer(now, calc), [now, calc]);

  const todayRecord: DayRecord = days[todayKey] ?? emptyDay();
  const streak = useMemo(() => computeStreak(days, now), [days, now]);

  const updateDay = (key: string, fn: (rec: DayRecord) => DayRecord) => {
    setDays((prev) => ({ ...prev, [key]: fn(prev[key] ?? emptyDay()) }));
  };

  // --- focus session ---
  const startFocus = (task: string) => {
    setSession({ task, startedAt: Date.now() });
    vibrate(30);
  };

  const stopFocus = () => {
    if (!session) return;
    const minutes = Math.round((Date.now() - session.startedAt) / 60_000);
    updateDay(todayKey, (rec) => ({
      ...rec,
      focusMinutes: rec.focusMinutes + minutes,
      sessions: rec.sessions + 1,
    }));
    setSession(null);
    vibrate([30, 50, 30]);
  };

  // --- salat gate ---
  const gatePrayer: DayPrayer | null = current;
  const gateDayKey = gatePrayer ? dateKey(gatePrayer.time) : todayKey;
  const gateRecord = days[gateDayKey] ?? emptyDay();
  const gateKey = gatePrayer ? `${gateDayKey}:${gatePrayer.key}` : "";
  const snoozesUsed = snooze && snooze.key === gateKey ? snooze.count : 0;
  const snoozeActive = snooze !== null && snooze.key === gateKey && snooze.until > now.getTime();

  const gateVisible =
    settings.onboarded &&
    !praying &&
    gatePrayer !== null &&
    gateRecord.prayed[gatePrayer.key] === undefined &&
    !snoozeActive;

  const goingToPray = () => {
    if (!gatePrayer) return;
    if (session) stopFocus();
    setPraying({ prayer: gatePrayer.key, timeMs: gatePrayer.time.getTime(), dayKey: gateDayKey });
    vibrate(50);
  };

  const snoozeGate = () => {
    if (!gatePrayer || snoozesUsed >= MAX_SNOOZES) return;
    setSnooze({ key: gateKey, until: Date.now() + SNOOZE_MS, count: snoozesUsed + 1 });
    updateDay(gateDayKey, (rec) => ({ ...rec, snoozes: rec.snoozes + 1 }));
  };

  const confirmPrayed = () => {
    if (!praying) return;
    const prayer: DayPrayer = { key: praying.prayer, time: new Date(praying.timeMs) };
    const windowEnd = getWindowEnd(prayer, calc);
    const status = Date.now() < windowEnd.getTime() ? "ontime" : "late";
    updateDay(praying.dayKey, (rec) => ({ ...rec, prayed: { ...rec.prayed, [praying.prayer]: status } }));
    setPraying(null);
    vibrate([30, 50, 30, 50, 30]);
  };

  const markFromTimeline = (key: PrayerKey) => {
    const status = current && current.key === key && dateKey(current.time) === todayKey ? "ontime" : "late";
    updateDay(todayKey, (rec) => ({ ...rec, prayed: { ...rec.prayed, [key]: status } }));
    vibrate(30);
  };

  // --- notifications (app open; in-app gate is the primary mechanism) ---
  useEffect(() => {
    if (!settings.onboarded) return;
    const msLeft = next.time.getTime() - now.getTime();
    const nextLabel = t(prayerLabelKey(next.key, next.date), lang);

    const preKey = `pre:${next.time.getTime()}`;
    if (msLeft > 0 && msLeft <= settings.preWarnMin * 60_000 && !notified.current.has(preKey)) {
      notified.current.add(preKey);
      showNotification(t("appName", lang), `${t("preWarn", lang)} — ${nextLabel}`);
    }

    if (gatePrayer && gateRecord.prayed[gatePrayer.key] === undefined) {
      const atKey = `at:${gatePrayer.time.getTime()}`;
      const sinceStart = now.getTime() - gatePrayer.time.getTime();
      if (sinceStart >= 0 && sinceStart < 60_000 && !notified.current.has(atKey)) {
        notified.current.add(atKey);
        const label = t(prayerLabelKey(gatePrayer.key, gatePrayer.time), lang);
        showNotification(t("appName", lang), `${t("gateTitle", lang)} — ${label}`);
        vibrate([100, 80, 100]);
      }
    }
  }, [now, next, gatePrayer, gateRecord, settings.onboarded, settings.preWarnMin, lang]);

  // --- screens ---
  if (!settings.onboarded) {
    return (
      <Onboarding
        lang={lang}
        onLangChange={(l) => setSettings((s) => ({ ...s, lang: l }))}
        onComplete={(loc) => setSettings((s) => ({ ...s, ...loc, onboarded: true }))}
      />
    );
  }

  if (praying) {
    const label = t(prayerLabelKey(praying.prayer, new Date(praying.timeMs)), lang);
    return <PrayingScreen lang={lang} prayerLabel={label} onPrayed={confirmPrayed} />;
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-emerald-50 to-teal-50">
      {gateVisible && gatePrayer && (
        <SalatGate
          lang={lang}
          prayer={gatePrayer}
          snoozesUsed={snoozesUsed}
          maxSnoozes={MAX_SNOOZES}
          onGoing={goingToPray}
          onSnooze={snoozeGate}
        />
      )}
      {showSettings && (
        <SettingsSheet settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />
      )}

      <div className="max-w-md mx-auto p-4 pb-10 space-y-4">
        <header className="flex items-center justify-between pt-2">
          <div>
            <h1 className="text-2xl font-bold text-emerald-900">🕌 {t("appName", lang)}</h1>
            <p className="text-xs text-emerald-700">
              {settings.city} ·{" "}
              {now.toLocaleDateString(lang === "bn" ? "bn-BD" : "en-US", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettings((s) => ({ ...s, lang: s.lang === "bn" ? "en" : "bn" }))}
              className="px-3 py-1.5 rounded-full bg-white border border-emerald-200 text-emerald-800 text-sm font-semibold"
            >
              {lang === "bn" ? "EN" : "বাং"}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="w-9 h-9 rounded-full bg-white border border-emerald-200 text-lg"
              aria-label={t("settings", lang)}
            >
              ⚙️
            </button>
          </div>
        </header>

        <NextPrayerCard lang={lang} now={now} next={next} current={current} />
        <FocusCard
          lang={lang}
          now={now}
          next={next}
          session={session}
          preWarnMin={settings.preWarnMin}
          onStart={startFocus}
          onStop={stopFocus}
        />
        <Scoreboard lang={lang} record={todayRecord} streak={streak} />
        <Timeline lang={lang} now={now} prayers={todayPrayers} record={todayRecord} onMark={markFromTimeline} />

        <p className="text-center text-xs text-slate-400 pt-2">{t("tagline", lang)}</p>
      </div>
    </div>
  );
}
