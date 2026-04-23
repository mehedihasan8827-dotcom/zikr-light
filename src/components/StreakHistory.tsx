import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toBengaliNumber } from '@/lib/bengali';
import { todayKey, earliestDateKey, type HistoryMap } from '@/lib/history';

interface Props {
  history: HistoryMap;
  todayIstegfar: number;
  todayDurood: number;
  targetIstegfar: number; // per waqt
  targetDurood: number;
}

const DAY_LABELS_BN = ['র', 'সো', 'ম', 'বু', 'বৃ', 'শু', 'শ'];
const MONTHS_BN = [
  'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
];

function fmtKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const StreakHistory = ({ history, todayIstegfar, todayDurood, targetIstegfar, targetDurood }: Props) => {
  const dailyI = targetIstegfar * 5;
  const dailyD = targetDurood * 5;
  const tKey = todayKey();

  const today = new Date();
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const isCurrentMonth =
    view.getFullYear() === today.getFullYear() && view.getMonth() === today.getMonth();

  const earliest = earliestDateKey();
  const earliestDate = earliest ? new Date(earliest + 'T00:00:00') : today;
  const isEarliestMonth =
    view.getFullYear() === earliestDate.getFullYear() && view.getMonth() === earliestDate.getMonth();

  const cells = useMemo(() => {
    const year = view.getFullYear();
    const month = view.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const arr: ({ date: Date; key: string; iPct: number; dPct: number; combined: number; iVal: number; dVal: number } | null)[] = [];
    for (let i = 0; i < firstDow; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const key = fmtKey(date);
      const isToday = key === tKey;
      const totals = isToday
        ? { istegfar: todayIstegfar, durood: todayDurood }
        : history[key] ?? { istegfar: 0, durood: 0 };
      const iPct = Math.min(1, totals.istegfar / dailyI);
      const dPct = Math.min(1, totals.durood / dailyD);
      arr.push({
        date, key, iPct, dPct,
        combined: (iPct + dPct) / 2,
        iVal: totals.istegfar, dVal: totals.durood,
      });
    }
    // Pad to a full 6-row grid only if needed (keeps height consistent within month)
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [view, history, todayIstegfar, todayDurood, dailyI, dailyD, tKey]);

  const monthStats = useMemo(() => {
    let active = 0, totalI = 0, totalD = 0;
    cells.forEach(c => {
      if (!c) return;
      if (c.combined >= 0.5) active++;
      totalI += c.iVal;
      totalD += c.dVal;
    });
    return { active, totalI, totalD };
  }, [cells]);

  const prevMonth = () => {
    if (isEarliestMonth) return;
    setView(v => new Date(v.getFullYear(), v.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    if (isCurrentMonth) return;
    setView(v => new Date(v.getFullYear(), v.getMonth() + 1, 1));
  };

  return (
    <section className="rounded-xl bg-card/40 backdrop-blur p-4">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          disabled={isEarliestMonth}
          aria-label="আগের মাস"
          className="h-8 w-8 rounded-md text-muted-foreground/80 hover:text-foreground hover:bg-secondary/60 transition flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="font-bengali text-sm text-foreground/85 font-medium">
          {MONTHS_BN[view.getMonth()]} {toBengaliNumber(view.getFullYear())}
        </h2>
        <button
          onClick={nextMonth}
          disabled={isCurrentMonth}
          aria-label="পরের মাস"
          className="h-8 w-8 rounded-md text-muted-foreground/80 hover:text-foreground hover:bg-secondary/60 transition flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {DAY_LABELS_BN.map((d, i) => (
          <div key={i} className="text-[9px] text-center text-muted-foreground/60 font-bengali">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c) return <div key={i} className="aspect-square" />;
          const isToday = c.key === tKey;
          return (
            <div
              key={c.key}
              className={cn(
                "relative aspect-square rounded-md overflow-hidden bg-muted/50",
                isToday && "ring-1 ring-foreground/40"
              )}
              title={`${c.key} — ইস্তেগফার ${c.iVal}, দরূদ ${c.dVal}`}
            >
              <div
                className="absolute left-0 bottom-0 w-1/2 bg-istegfar/75 transition-all"
                style={{ height: `${c.iPct * 100}%` }}
              />
              <div
                className="absolute right-0 bottom-0 w-1/2 bg-durood/75 transition-all"
                style={{ height: `${c.dPct * 100}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bengali tabular-nums text-foreground/80 drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]">
                {toBengaliNumber(c.date.getDate())}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer: month summary + legend */}
      <div className="flex items-center justify-between mt-3">
        <span className="text-[10px] font-bengali text-muted-foreground/80">
          সক্রিয় দিন <span className="text-foreground/85 font-medium">{toBengaliNumber(monthStats.active)}</span>
        </span>
        <div className="flex items-center gap-3">
          <Legend swatchClass="bg-istegfar/80" label="ইস্তেগফার" />
          <Legend swatchClass="bg-durood/80" label="দরূদ" />
        </div>
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
