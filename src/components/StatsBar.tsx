import { toBengaliNumber } from '@/lib/bengali';
import { cn } from '@/lib/utils';

interface Props {
  todayIstegfar: number;
  todayDurood: number;
  targetIstegfar: number; // daily (5 waqts × per-waqt)
  targetDurood: number;
}

export const StatsBar = ({ todayIstegfar, todayDurood, targetIstegfar, targetDurood }: Props) => {
  return (
    <div className="flex items-stretch justify-around rounded-xl bg-card/40 backdrop-blur py-3 px-2">
      <Stat label="আজকের ইস্তেগফার" value={todayIstegfar} target={targetIstegfar} variant="istegfar" />
      <div className="w-px bg-border/60 my-1" />
      <Stat label="আজকের দরূদ" value={todayDurood} target={targetDurood} variant="durood" />
    </div>
  );
};

const Stat = ({ label, value, target, variant }: { label: string; value: number; target: number; variant: 'istegfar' | 'durood' }) => (
  <div className="flex flex-col items-center gap-0.5 px-2">
    <div className="flex items-baseline gap-1">
      <span className={cn(
        "font-bengali font-medium text-lg tabular-nums",
        variant === 'istegfar' ? "text-istegfar" : "text-durood"
      )}>
        {toBengaliNumber(value)}
      </span>
      <span className="text-[10px] font-bengali text-muted-foreground/60 tabular-nums">
        / {toBengaliNumber(target)}
      </span>
    </div>
    <div className="text-[10px] font-bengali text-muted-foreground/70">{label}</div>
  </div>
);
