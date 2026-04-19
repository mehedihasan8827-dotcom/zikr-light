import { toBengaliNumber } from '@/lib/bengali';
import { cn } from '@/lib/utils';

interface Props {
  todayIstegfar: number;
  waqtIstegfar: number;
  todayDurood: number;
  waqtDurood: number;
}

export const StatsBar = ({ todayIstegfar, waqtIstegfar, todayDurood, waqtDurood }: Props) => {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Tile label="আজকের ইস্তেগফার" value={todayIstegfar} variant="istegfar" />
      <Tile label="এ ওয়াক্তে ইস্তেগফার" value={waqtIstegfar} variant="istegfar" subtle />
      <Tile label="আজকের দরূদ" value={todayDurood} variant="durood" />
      <Tile label="এ ওয়াক্তে দরূদ" value={waqtDurood} variant="durood" subtle />
    </div>
  );
};

const Tile = ({ label, value, variant, subtle }: { label: string; value: number; variant: 'istegfar' | 'durood'; subtle?: boolean }) => (
  <div className={cn(
    "rounded-xl border p-3 bg-card/70 backdrop-blur",
    variant === 'istegfar' ? "border-istegfar/20" : "border-durood/20",
    subtle && "opacity-90"
  )}>
    <div className="text-[10px] font-bengali text-muted-foreground mb-0.5">{label}</div>
    <div className={cn(
      "font-bengali font-bold text-xl tabular-nums",
      variant === 'istegfar' ? "text-istegfar" : "text-durood"
    )}>
      {toBengaliNumber(value)}
    </div>
  </div>
);
