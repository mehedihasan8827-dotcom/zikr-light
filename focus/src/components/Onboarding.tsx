import { useState } from "react";
import { CITIES, cityLabel } from "../lib/prayer";
import type { Lang } from "../lib/i18n";
import { t } from "../lib/i18n";
import { requestNotifPermission } from "../lib/notify";

interface Props {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  onComplete: (loc: { lat: number; lng: number; city: string }) => void;
}

export function Onboarding({ lang, onLangChange, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [loc, setLoc] = useState<{ lat: number; lng: number; city: string } | null>(null);
  const [gpsError, setGpsError] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  const useGps = () => {
    setGpsLoading(true);
    setGpsError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLoading(false);
        setLoc({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          city: lang === "bn" ? "আমার অবস্থান" : "My location",
        });
        setStep(2);
      },
      () => {
        setGpsLoading(false);
        setGpsError(true);
      },
      { timeout: 10000 },
    );
  };

  const pickCity = (i: number) => {
    const c = CITIES[i];
    setLoc({ lat: c.lat, lng: c.lng, city: cityLabel(c, lang) });
    setStep(2);
  };

  const finish = async (withNotif: boolean) => {
    if (withNotif) await requestNotifPermission();
    if (loc) onComplete(loc);
  };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-emerald-900 via-emerald-800 to-teal-900 text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="flex justify-center gap-2">
          {(["bn", "en"] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => onLangChange(l)}
              className={`px-3 py-1 rounded-full text-sm ${
                lang === l ? "bg-white text-emerald-900 font-bold" : "bg-white/10"
              }`}
            >
              {l === "bn" ? "বাংলা" : "English"}
            </button>
          ))}
        </div>

        {step === 0 && (
          <>
            <div className="text-6xl">🕌</div>
            <h1 className="text-3xl font-bold">{t("obWelcomeTitle", lang)}</h1>
            <p className="text-emerald-100 leading-relaxed">{t("obWelcomeBody", lang)}</p>
            <button
              onClick={() => setStep(1)}
              className="w-full py-4 rounded-2xl bg-white text-emerald-900 font-bold text-lg active:scale-95 transition"
            >
              {t("obStart", lang)}
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <div className="text-5xl">📍</div>
            <h2 className="text-2xl font-bold">{t("obLocationTitle", lang)}</h2>
            <p className="text-emerald-100 text-sm leading-relaxed">{t("obLocationBody", lang)}</p>
            <button
              onClick={useGps}
              disabled={gpsLoading}
              className="w-full py-4 rounded-2xl bg-white text-emerald-900 font-bold active:scale-95 transition disabled:opacity-60"
            >
              {gpsLoading ? "…" : t("obUseGps", lang)}
            </button>
            {gpsError && <p className="text-amber-300 text-sm">{t("obGpsError", lang)}</p>}
            <p className="text-emerald-200 text-sm">{t("obOrCity", lang)}</p>
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {CITIES.map((c, i) => (
                <button
                  key={c.name.en}
                  onClick={() => pickCity(i)}
                  className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-sm text-left"
                >
                  {cityLabel(c, lang)}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="text-5xl">🔔</div>
            <h2 className="text-2xl font-bold">{t("obNotifTitle", lang)}</h2>
            <p className="text-emerald-100 text-sm leading-relaxed">{t("obNotifBody", lang)}</p>
            <button
              onClick={() => finish(true)}
              className="w-full py-4 rounded-2xl bg-white text-emerald-900 font-bold active:scale-95 transition"
            >
              {t("obEnableNotif", lang)}
            </button>
            <button onClick={() => finish(false)} className="w-full py-3 rounded-2xl bg-white/10 text-emerald-100">
              {t("obSkip", lang)}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
