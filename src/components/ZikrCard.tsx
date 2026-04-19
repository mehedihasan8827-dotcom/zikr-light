import { useRef, useState, type MouseEvent, type TouchEvent } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toBengaliNumber } from '@/lib/bengali';

type Variant = 'istegfar' | 'durood';

interface Props {
  variant: Variant;
  nameBn: string;
  arabic: string;
  translit: string;
  target: number;
  count: number;
  laps: number;
  onTap: () => void;
  onReset: () => void;
}

export const ZikrCard = ({ variant, nameBn, arabic, translit, target, count, laps, onTap, onReset }: Props) => {
  const isI = variant === 'istegfar';
  const accent = isI ? 'istegfar' : 'durood';
  const pct = Math.min(1, count / target);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([]);

  const handleTap = (e: MouseEvent | TouchEvent) => {
    const btn = btnRef.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const point = 'touches' in e && e.touches[0]
        ? { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }
        : (e as MouseEvent);
      const size = Math.max(rect.width, rect.height);
      const x = point.clientX - rect.left - size / 2;
      const y = point.clientY - rect.top - size / 2;
      const id = Date.now() + Math.random();
      setRipples(r => [...r, { id, x, y, size }]);
      setTimeout(() => setRipples(r => r.filter(rp => rp.id !== id)), 600);
    }
    onTap();
  };

  // Ring geometry
  const R = 22, C = 2 * Math.PI * R;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card/80 backdrop-blur p-4 animate-scale-in",
        isI ? "border-istegfar/30 shadow-istegfar" : "border-durood/30 shadow-durood"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(
            "px-2.5 py-1 rounded-full text-[11px] font-bengali font-semibold",
            isI ? "bg-istegfar/15 text-istegfar" : "bg-durood/15 text-durood"
          )}>
            {nameBn} · {toBengaliNumber(target)} বার
          </span>
          <span className="px-2 py-1 rounded-full text-[10px] font-bengali bg-secondary text-muted-foreground">
            ল্যাপ {toBengaliNumber(laps)} বার
          </span>
        </div>

        {/* Mini ring */}
        <div className="relative">
          <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
            <circle cx="28" cy="28" r={R} stroke="hsl(var(--secondary))" strokeWidth="5" fill="none" />
            <circle
              cx="28" cy="28" r={R}
              stroke={`hsl(var(--${accent}))`}
              strokeWidth="5" fill="none" strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - pct)}
              className="transition-all duration-300"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={cn("text-[11px] font-bengali font-bold", isI ? "text-istegfar" : "text-durood")}>
              {toBengaliNumber(Math.round(pct * 100))}%
            </span>
          </div>
        </div>
      </div>

      {/* Arabic */}
      <p className={cn(
        "font-arabic text-center leading-loose mb-1",
        isI ? "text-istegfar-glow" : "text-durood-glow"
      )} style={{ fontSize: isI ? '1.65rem' : '1.5rem', direction: 'rtl' }}>
        {arabic}
      </p>
      <p className="text-center text-xs text-muted-foreground font-bengali mb-4">{translit}</p>

      {/* Count */}
      <div className="text-center mb-3">
        <div className={cn(
          "font-bengali font-bold tabular-nums",
          isI ? "text-istegfar" : "text-durood"
        )} style={{ fontSize: '2.4rem', lineHeight: 1 }}>
          {toBengaliNumber(count)}
        </div>
        <div className="text-[10px] text-muted-foreground font-bengali mt-0.5">
          লক্ষ্য {toBengaliNumber(target)}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          ref={btnRef}
          onClick={handleTap}
          className={cn(
            "relative overflow-hidden flex-1 h-14 rounded-xl font-bengali font-semibold text-base text-primary-foreground active:animate-pop transition-transform",
            isI ? "bg-gradient-istegfar shadow-istegfar" : "bg-gradient-durood shadow-durood"
          )}
        >
          <span className="relative z-10">গণনা করুন</span>
          {ripples.map(r => (
            <span
              key={r.id}
              className="ripple"
              style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
            />
          ))}
        </button>
        <button
          onClick={onReset}
          aria-label="রিসেট"
          className="h-14 w-14 rounded-xl bg-secondary text-muted-foreground hover:text-foreground active:scale-95 transition flex items-center justify-center"
        >
          <RotateCcw className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};
