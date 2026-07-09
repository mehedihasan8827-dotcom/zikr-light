import type { Lang } from "../lib/i18n";
import { localizeDigits, t } from "../lib/i18n";
import type { MethodKey } from "../lib/prayer";
import { CITIES, METHOD_LABELS, cityLabel } from "../lib/prayer";
import type { Settings } from "../lib/store";

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
}

export function SettingsSheet({ settings, onChange, onClose }: Props) {
  const lang = settings.lang;
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 max-h-[85dvh] overflow-y-auto space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">⚙️ {t("settings", lang)}</h2>
          <button onClick={onClose} className="text-slate-400 text-2xl leading-none px-2">×</button>
        </div>

        <label className="block">
          <span className="text-sm font-semibold text-slate-600">{t("language", lang)}</span>
          <div className="flex gap-2 mt-2">
            {(["bn", "en"] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => set({ lang: l })}
                className={`flex-1 py-2.5 rounded-xl font-semibold ${
                  lang === l ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {l === "bn" ? "বাংলা" : "English"}
              </button>
            ))}
          </div>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-600">{t("location", lang)}</span>
          <select
            className="w-full mt-2 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50"
            value={settings.city}
            onChange={(e) => {
              const c = CITIES.find((c) => cityLabel(c, lang) === e.target.value);
              if (c) set({ lat: c.lat, lng: c.lng, city: cityLabel(c, lang) });
            }}
          >
            <option value={settings.city}>{settings.city}</option>
            {CITIES.filter((c) => cityLabel(c, lang) !== settings.city).map((c) => (
              <option key={c.name.en} value={cityLabel(c, lang)}>
                {cityLabel(c, lang)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-600">{t("calcMethod", lang)}</span>
          <select
            className="w-full mt-2 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50"
            value={settings.method}
            onChange={(e) => set({ method: e.target.value as MethodKey })}
          >
            {(Object.keys(METHOD_LABELS) as MethodKey[]).map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-600">{t("asrMethod", lang)}</span>
          <div className="flex gap-2 mt-2">
            {(["hanafi", "shafi"] as const).map((m) => (
              <button
                key={m}
                onClick={() => set({ madhab: m })}
                className={`flex-1 py-2.5 rounded-xl font-semibold ${
                  settings.madhab === m ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {t(m, lang)}
              </button>
            ))}
          </div>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-600">
            {t("preWarnLabel", lang)} — {localizeDigits(String(settings.preWarnMin), lang)} {t("minutes", lang)}
          </span>
          <input
            type="range"
            min={5}
            max={30}
            step={5}
            value={settings.preWarnMin}
            onChange={(e) => set({ preWarnMin: Number(e.target.value) })}
            className="w-full mt-2 accent-emerald-600"
          />
        </label>

        <p className="text-xs text-slate-400 leading-relaxed">⚠️ {t("disclaimer", lang)}</p>

        <button onClick={onClose} className="w-full py-3 rounded-2xl bg-emerald-600 text-white font-bold">
          {t("close", lang)}
        </button>
      </div>
    </div>
  );
}
