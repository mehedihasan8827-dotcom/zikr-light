import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { toBengaliNumber } from '@/lib/bengali';
import { lastNDays, type HistoryMap } from '@/lib/history';

interface Props {
  history: HistoryMap;
  todayIstegfar: number;
  todayDurood: number;
  targetIstegfar: number; // per waqt
  targetDurood: number;
}

const DAY_LABELS_BN = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'];

export const StreakHistory = ({ history, todayIstegfar, todayDurood, targetIstegfar, targetDurood }: Props) => {
  // Daily target = 5 waqts × per-waqt target
  const dailyI = targetIstegfar * 5;
  const dailyD = targetDurood * 5;

  const days = useMemo(() => {
    const arr = lastNDays(7);
    return arr.map(({ key, date }, idx) => {
      const isToday = idx === arr.length - 1;
      const totals = isToday
        ? { istegfar: todayIstegfar, durood: todayDurood }
        : history[key] ?? { istegfar: 0, durood: 0 };
      const iPct = Math.min(1, totals.istegfar / dailyI);
      const dPct = Math.min(1, totals.durood / dailyD);
      const combined = (iPct + dPct) / 2;
      return {
        key,
        date,
        isToday,
        totals,
        iPct,
        dPct,
        combined,
        dayLabel: DAY_LABELS_BN[date.getDay()],
        dayNum: date.getDate(),
      };
    });
  }, [history, todayIstegfar, todayDurood, dailyI, dailyD]);

  const streak = useMemo(() => {
    let s = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].combined >= 0.5) s++;
      else break;
    }
    return s;
  }, [days]);

  return (
    <section className="rounded-xl bg-card/40 backdrop-blur p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bengali text-sm text-foreground/85 font-medium">৭ দিনের ধারাবাহিকতা</h2>
        <span className="text-[11px] font-bengali text-muted-foreground/80">
          স্ট্রিক <span className="text-foreground/85 font-medium">{toBengaliNumber(streak)}</span> দিন
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {days.map(d => (
          <div key={d.key} className="flex flex-col items-center gap-1.5">
            <div className="text-[9px] text-muted-foreground/70 font-bengali">{d.dayLabel}</div>
            <div
              className={cn(
                "relative w-full aspect-square rounded-md overflow-hidden bg-muted/60",
                d.isToday && "ring-1 ring-foreground/40"
              )}
              title={`${d.key} — ইস্তেগফার ${d.totals.istegfar}, দরূদ ${d.totals.durood}`}
            >
              {/* Istegfar fill (left half) */}
              <div
                className="absolute left-0 bottom-0 w-1/2 bg-istegfar/80 transition-all"
                style={{ height: `${d.iPct * 100}%` }}
              />
              {/* Durood fill (right half) */}
              <div
                className="absolute right-0 bottom-0 w-1/2 bg-durood/80 transition-all"
                style={{ height: `${d.dPct * 100}%` }}
              />
            </div>
            <div className="text-[9px] tabular-nums text-muted-foreground/70 font-bengali">
              {toBengaliNumber(d.dayNum)}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-4 mt-3">
        <Legend swatchClass="bg-istegfar/80" label="ইস্তেগফার" />
        <Legend swatchClass="bg-durood/80" label="দরূদ" />
      </div>
    </section>
  );
};

const Legend = ({ swatchClass, label }: { swatchClass: string; label: string }) => (
  <div className="flex items-center gap-1.5">
    <span className={cn("h-2 w-2 rounded-sm", swatchClass)} />
    <span className="text-[10px] font-bengali text-muted-foreground/80">{label}</span>
  </div>
);
