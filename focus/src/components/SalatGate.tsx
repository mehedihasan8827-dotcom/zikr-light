import type { Lang } from "../lib/i18n";
import { t, formatTime } from "../lib/i18n";
import type { DayPrayer } from "../lib/prayer";
import { pickQuote, prayerEmoji, prayerLabelKey } from "../lib/prayer";

interface GateProps {
  lang: Lang;
  prayer: DayPrayer;
  snoozesUsed: number;
  maxSnoozes: number;
  onGoing: () => void;
  onSnooze: () => void;
}

/** Full-screen prompt shown the moment a prayer's time arrives. */
export function SalatGate({ lang, prayer, snoozesUsed, maxSnoozes, onGoing, onSnooze }: GateProps) {
  const quote = pickQuote(prayer.time);
  const label = t(prayerLabelKey(prayer.key, prayer.time), lang);
  const snoozesLeft = maxSnoozes - snoozesUsed;

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-emerald-950 via-emerald-900 to-teal-950 text-white flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-sm w-full space-y-8">
        <div className="text-7xl animate-pulse">{prayerEmoji(prayer.key)}</div>
        <div>
          <p className="text-emerald-300 text-lg">{t("gateTitle", lang)}</p>
          <h1 className="text-5xl font-bold mt-1">{label}</h1>
          <p className="text-emerald-200 mt-2 text-xl">{formatTime(prayer.time, lang)}</p>
        </div>
        <blockquote className="bg-white/5 rounded-2xl p-5 border border-white/10">
          <p className="leading-relaxed">“{quote.text[lang]}”</p>
          <footer className="text-emerald-300 text-sm mt-3">— {quote.source[lang]}</footer>
        </blockquote>
        <div className="space-y-3">
          <button
            onClick={onGoing}
            className="w-full py-5 rounded-2xl bg-white text-emerald-900 font-bold text-xl active:scale-95 transition shadow-lg"
          >
            {t("gateGoing", lang)}
          </button>
          {snoozesLeft > 0 && (
            <button onClick={onSnooze} className="w-full py-3 rounded-2xl bg-white/10 text-emerald-200 text-sm">
              {t("gateSnooze", lang)} · {snoozesLeft} {t("gateSnoozeLeft", lang)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface PrayingProps {
  lang: Lang;
  prayerLabel: string;
  onPrayed: () => void;
}

/** Calm screen shown while the user is away praying. */
export function PrayingScreen({ lang, prayerLabel, onPrayed }: PrayingProps) {
  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-teal-950 via-emerald-900 to-emerald-950 text-white flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-sm w-full space-y-8">
        <div className="text-7xl">🤲</div>
        <div>
          <h1 className="text-3xl font-bold">{t("prayingTitle", lang)}</h1>
          <p className="text-emerald-200 mt-3">
            {prayerLabel} — {t("prayingBody", lang)}
          </p>
        </div>
        <button
          onClick={onPrayed}
          className="w-full py-5 rounded-2xl bg-emerald-400 text-emerald-950 font-bold text-xl active:scale-95 transition shadow-lg"
        >
          {t("prayedDone", lang)}
        </button>
      </div>
    </div>
  );
}
