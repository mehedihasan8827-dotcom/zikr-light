import { toBengaliNumber } from '@/lib/bengali';
import { cn } from '@/lib/utils';

interface Props {
  todayIstegfar: number;
  todayDurood: number;
}

export const StatsBar = ({ todayIstegfar, todayDurood }: Props) => {
  return (
    <div className="flex items-center justify-around rounded-xl bg-card/40 backdrop-blur py-3 px-2">
      <Stat label="আজকের ইস্তেগফার" value={todayIstegfar} variant="istegfar" />
      <div className="h-8 w-px bg-border/60" />
      <Stat label="আজকের দরূদ" value={todayDurood} variant="durood" />
    </div>
  );
};

const Stat = ({ label, value, variant }: { label: string; value: number; variant: 'istegfar' | 'durood' }) => (
  <div className="flex flex-col items-center gap-0.5 px-2">
    <div className={cn(
      "font-bengali font-medium text-lg tabular-nums",
      variant === 'istegfar' ? "text-istegfar" : "text-durood"
    )}>
      {toBengaliNumber(value)}
    </div>
    <div className="text-[10px] font-bengali text-muted-foreground/70">{label}</div>
  </div>
);
