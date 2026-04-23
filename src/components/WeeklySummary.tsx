import { useMemo } from 'react';
import { Flame, Trophy } from 'lucide-react';
import { toBengaliNumber } from '@/lib/bengali';
import { computeStreak } from '@/lib/streak';

interface Props {
  todayIstegfar: number;
  todayDurood: number;
  targetIstegfar: number; // per waqt
  targetDurood: number;
}

const MONTHS_BN = [
  'জানু', 'ফেব', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগ', 'সেপ্ট', 'অক্টো', 'নভে', 'ডিসে',
];

function fmtBnDate(key: string): string {
  // key is YYYY-MM-DD
  const [, m, d] = key.split('-');
  return `${toBengaliNumber(parseInt(d, 10))} ${MONTHS_BN[parseInt(m, 10) - 1]}`;
}

export const WeeklySummary = ({ todayIstegfar, todayDurood, targetIstegfar, targetDurood }: Props) => {
  const dailyI = targetIstegfar * 5;
  const dailyD = targetDurood * 5;

  const info = useMemo(
    () => computeStreak({ istegfar: todayIstegfar, durood: todayDurood }, dailyI, dailyD),
    [todayIstegfar, todayDurood, dailyI, dailyD],
  );

  return (
    <section className="rounded-xl bg-card/40 backdrop-blur p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bengali text-sm text-foreground/85 font-medium">এই সপ্তাহ</h2>
        <div className="flex items-center gap-3 text-[11px] font-bengali text-muted-foreground/85">
          <span className="inline-flex items-center gap-1">
            <Flame className="h-3 w-3 text-istegfar/80" />
            <span className="text-foreground/85 tabular-nums">{toBengaliNumber(info.current)}</span>
            দিন
          </span>
          <span className="inline-flex items-center gap-1">
            <Trophy className="h-3 w-3 text-durood/80" />
            সর্বোচ্চ
            <span className="text-foreground/85 tabular-nums">{toBengaliNumber(info.best)}</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Tile
          label="ইস্তেগফার"
          value={info.weekTotal.istegfar}
          accent="text-istegfar"
        />
        <Tile
          label="দরূদ"
          value={info.weekTotal.durood}
          accent="text-durood"
        />
      </div>

      {info.bestDay && info.bestDay.total > 0 && (
        <p className="text-[11px] font-bengali text-muted-foreground/75">
          সেরা দিন · <span className="text-foreground/85">{fmtBnDate(info.bestDay.key)}</span> ·{' '}
          <span className="tabular-nums">{toBengaliNumber(info.bestDay.total)}</span>
        </p>
      )}
    </section>
  );
};

const Tile = ({ label, value, accent }: { label: string; value: number; accent: string }) => (
  <div className="rounded-lg bg-muted/40 px-3 py-2.5">
    <div className="text-[10px] font-bengali text-muted-foreground/80">{label}</div>
    <div className={`mt-0.5 font-bengali tabular-nums text-lg font-light ${accent}`}>
      {toBengaliNumber(value)}
    </div>
  </div>
);
