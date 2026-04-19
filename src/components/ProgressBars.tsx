import { toBengaliNumber } from '@/lib/bengali';

interface Props {
  istegfar: { count: number; target: number };
  durood:   { count: number; target: number };
}

export const ProgressBars = ({ istegfar, durood }: Props) => {
  const ip = Math.min(100, (istegfar.count / istegfar.target) * 100);
  const dp = Math.min(100, (durood.count / durood.target) * 100);
  return (
    <div className="space-y-2">
      <Bar label="ইস্তেগফার" colorClass="bg-gradient-istegfar" pct={ip} text={`${toBengaliNumber(istegfar.count)} / ${toBengaliNumber(istegfar.target)}`} />
      <Bar label="দরূদ"      colorClass="bg-gradient-durood"   pct={dp} text={`${toBengaliNumber(durood.count)} / ${toBengaliNumber(durood.target)}`} />
    </div>
  );
};

const Bar = ({ label, colorClass, pct, text }: { label: string; colorClass: string; pct: number; text: string }) => (
  <div>
    <div className="flex items-center justify-between text-[11px] font-bengali text-muted-foreground mb-1 px-0.5">
      <span>{label}</span><span>{text}</span>
    </div>
    <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
      <div className={`h-full ${colorClass} transition-all duration-300`} style={{ width: `${pct}%` }} />
    </div>
  </div>
);
