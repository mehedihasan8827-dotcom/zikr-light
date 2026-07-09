import { useState } from "react";
import type { Lang } from "../lib/i18n";
import { formatCountdown, formatTime, localizeDigits, t } from "../lib/i18n";
import type { DayPrayer, NextPrayer, PrayerKey } from "../lib/prayer";
import { PRAYER_KEYS, prayerEmoji, prayerLabelKey } from "../lib/prayer";
import type { DayRecord, FocusSession } from "../lib/store";

interface NextPrayerCardProps {
  lang: Lang;
  now: Date;
  next: NextPrayer;
  current: DayPrayer | null;
}

export function NextPrayerCard({ lang, now, next, current }: NextPrayerCardProps) {
  const nextLabel = t(prayerLabelKey(next.key, next.date), lang);
  const blockLabel = current
    ? `${t(prayerLabelKey(current.key, current.time), lang)} → ${nextLabel}`
    : `→ ${nextLabel}`;

  return (
    <div className="rounded-3xl bg-gradient-to-br from-emerald-700 to-teal-800 text-white p-6 shadow-lg">
      <p className="text-emerald-200 text-sm">
        {t("currentBlock", lang)} · {blockLabel}
      </p>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-emerald-100 text-sm">
            {t("nextPrayer", lang)}
            {next.isTomorrow ? ` (${t("tomorrow", lang)})` : ""}
          </p>
          <p className="text-3xl font-bold mt-1">
            {prayerEmoji(next.key)} {nextLabel}
          </p>
          <p className="text-emerald-200 mt-1">{formatTime(next.time, lang)}</p>
        </div>
        <div className="text-right">
          <p className="text-4xl font-bold tabular-nums tracking-tight">
            {formatCountdown(next.time.getTime() - now.getTime(), lang)}
          </p>
          <p className="text-emerald-200 text-sm">{t("untilNext", lang)}</p>
        </div>
      </div>
    </div>
  );
}

interface FocusCardProps {
  lang: Lang;
  now: Date;
  next: NextPrayer;
  session: FocusSession | null;
  preWarnMin: number;
  onStart: (task: string) => void;
  onStop: () => void;
}

export function FocusCard({ lang, now, next, session, preWarnMin, onStart, onStop }: FocusCardProps) {
  const [task, setTask] = useState("");
  const msToNext = next.time.getTime() - now.getTime();
  const warning = session !== null && msToNext > 0 && msToNext <= preWarnMin * 60_000;

  if (session) {
    const elapsed = now.getTime() - session.startedAt;
    return (
      <div className={`rounded-3xl p-6 shadow-lg text-white ${warning ? "bg-gradient-to-br from-amber-600 to-orange-700" : "bg-gradient-to-br from-slate-800 to-slate-900"}`}>
        <p className="text-sm opacity-80">
          {t("focusRunning", lang)} {session.task ? `· ${session.task}` : ""}
        </p>
        <p className="text-6xl font-bold tabular-nums mt-3 text-center tracking-tight">
          {formatCountdown(elapsed, lang)}
        </p>
        {warning ? (
          <p className="text-center mt-3 font-semibold animate-pulse">⚠️ {t("preWarn", lang)}</p>
        ) : (
          <p className="text-center mt-3 text-sm opacity-70">
            {t("sessionEndsAtPrayer", lang)} · {formatCountdown(msToNext, lang)}
          </p>
        )}
        <button
          onClick={onStop}
          className="w-full mt-5 py-3 rounded-2xl bg-white/15 hover:bg-white/25 font-semibold"
        >
          {t("stopFocus", lang)}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white p-6 shadow-lg border border-emerald-100">
      <p className="font-bold text-slate-800">🎯 {t("focusTitle", lang)}</p>
      <input
        value={task}
        onChange={(e) => setTask(e.target.value)}
        placeholder={t("taskPlaceholder", lang)}
        className="w-full mt-3 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <button
        onClick={() => {
          onStart(task.trim());
          setTask("");
        }}
        className="w-full mt-3 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg active:scale-95 transition"
      >
        {t("startFocus", lang)}
      </button>
      <p className="text-xs text-slate-400 mt-3 text-center">{t("sessionEndsAtPrayer", lang)}</p>
    </div>
  );
}

interface TimelineProps {
  lang: Lang;
  now: Date;
  prayers: DayPrayer[];
  record: DayRecord;
  onMark: (key: PrayerKey) => void;
}

export function Timeline({ lang, now, prayers, record, onMark }: TimelineProps) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow-lg border border-emerald-100">
      <p className="font-bold text-slate-800 mb-4">🕐 {t("todayTimes", lang)}</p>
      <div className="space-y-1">
        {prayers.map((p) => {
          const status = record.prayed[p.key];
          const started = now.getTime() >= p.time.getTime();
          return (
            <div key={p.key} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-xl">{prayerEmoji(p.key)}</span>
                <span className={`font-semibold ${started ? "text-slate-800" : "text-slate-400"}`}>
                  {t(prayerLabelKey(p.key, p.time), lang)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`tabular-nums ${started ? "text-slate-600" : "text-slate-400"}`}>
                  {formatTime(p.time, lang)}
                </span>
                {status ? (
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-semibold ${
                      status === "ontime" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    ✓ {t(status === "ontime" ? "onTime" : "late", lang)}
                  </span>
                ) : started ? (
                  <button
                    onClick={() => onMark(p.key)}
                    className="text-xs px-3 py-1.5 rounded-full border border-emerald-300 text-emerald-700 hover:bg-emerald-50 font-semibold"
                  >
                    {t("prayedTick", lang)}
                  </button>
                ) : (
                  <span className="w-14" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ScoreboardProps {
  lang: Lang;
  record: DayRecord;
  streak: number;
}

export function Scoreboard({ lang, record, streak }: ScoreboardProps) {
  const prayedCount = PRAYER_KEYS.filter((k) => record.prayed[k]).length;
  const stat = (value: string, label: string, hint?: string) => (
    <div className="flex-1 text-center">
      <p className="text-2xl font-bold text-emerald-800">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
  return (
    <div className="rounded-3xl bg-emerald-50 border border-emerald-100 p-5 flex divide-x divide-emerald-100">
      {stat(localizeDigits(`${prayedCount}/5`, lang), `${t("today", lang)} · ${t("waqtScore", lang)}`)}
      {stat(localizeDigits(String(record.focusMinutes), lang), t("focusMinutes", lang))}
      {stat(`🔥 ${localizeDigits(String(streak), lang)}`, t("streak", lang), t("streakHint", lang))}
    </div>
  );
}
