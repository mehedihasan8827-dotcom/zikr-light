import { useRef, useState, type MouseEvent, type TouchEvent } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toBengaliNumber } from '@/lib/bengali';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

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
    <div className="relative overflow-hidden rounded-2xl bg-card/50 backdrop-blur p-5 animate-scale-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-baseline gap-2">
          <span className={cn(
            "font-bengali text-sm font-medium",
            isI ? "text-istegfar" : "text-durood"
          )}>
            {nameBn}
          </span>
          <span className="text-[11px] font-bengali text-muted-foreground/70">
            ল্যাপ {toBengaliNumber(laps)}
          </span>
        </div>

        {/* Mini ring */}
        <div className="relative">
          <svg width="48" height="48" viewBox="0 0 56 56" className="-rotate-90">
            <circle cx="28" cy="28" r={R} stroke="hsl(var(--muted))" strokeWidth="3" fill="none" />
            <circle
              cx="28" cy="28" r={R}
              stroke={`hsl(var(--${accent}))`}
              strokeWidth="3" fill="none" strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - pct)}
              className="transition-all duration-300 opacity-80"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-bengali text-muted-foreground tabular-nums">
              {toBengaliNumber(Math.round(pct * 100))}%
            </span>
          </div>
        </div>
      </div>

      {/* Arabic */}
      <p
        className="font-arabic text-center leading-loose mb-2 text-foreground/85"
        style={{ fontSize: isI ? '1.6rem' : '1.45rem', direction: 'rtl' }}
      >
        {arabic}
      </p>
      <p className="text-center text-[11px] text-muted-foreground/70 font-bengali mb-5">{translit}</p>

      {/* Count */}
      <div className="text-center mb-5">
        <div
          className={cn(
            "font-bengali tabular-nums font-light",
            isI ? "text-istegfar" : "text-durood"
          )}
          style={{ fontSize: '3rem', lineHeight: 1 }}
        >
          {toBengaliNumber(count)}
        </div>
        <div className="text-[10px] text-muted-foreground/70 font-bengali mt-1.5 tracking-wide">
          / {toBengaliNumber(target)}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          ref={btnRef}
          onClick={handleTap}
          className={cn(
            "relative overflow-hidden flex-1 h-14 rounded-xl font-bengali font-medium text-sm text-primary-foreground transition-transform active:scale-[0.98]",
            isI ? "bg-istegfar/90 hover:bg-istegfar" : "bg-durood/90 hover:bg-durood"
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
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              aria-label="রিসেট"
              className="h-14 w-14 rounded-xl bg-secondary/60 text-muted-foreground/80 hover:text-foreground active:scale-95 transition flex items-center justify-center"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-bengali">গণনা রিসেট করবেন?</AlertDialogTitle>
              <AlertDialogDescription className="font-bengali">
                এই ওয়াক্তের {nameBn}-এর বর্তমান গণনা ({toBengaliNumber(count)}) মুছে যাবে। ল্যাপ অপরিবর্তিত থাকবে।
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="font-bengali">বাতিল</AlertDialogCancel>
              <AlertDialogAction onClick={onReset} className="font-bengali">রিসেট</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};
