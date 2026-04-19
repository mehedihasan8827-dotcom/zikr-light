import { useMemo } from 'react';
import { toBengaliNumber } from '@/lib/bengali';
import { cn } from '@/lib/utils';

interface Props {
  variant: 'istegfar' | 'durood';
  waqtLabel: string;
  laps: number;
  onClose: () => void;
}

export const CompletionOverlay = ({ variant, waqtLabel, laps, onClose }: Props) => {
  const isI = variant === 'istegfar';
  const colorVar = isI ? '--istegfar' : '--durood';

  const dua = isI
    ? 'رَبِّ اغْفِرْ لِي وَتُبْ عَلَيَّ إِنَّكَ أَنْتَ التَّوَّابُ الرَّحِيمُ'
    : 'صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ';

  const arabicHero = isI
    ? 'أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ'
    : 'اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبِيِّنَا مُحَمَّد';

  const particles = useMemo(() =>
    Array.from({ length: 60 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      duration: 1.6 + Math.random() * 1.4,
      dx: (Math.random() - 0.5) * 200,
      size: 6 + Math.random() * 8,
    })), []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-background/85 backdrop-blur-md animate-fade-in">
      {/* Confetti */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {particles.map(p => (
          <span
            key={p.id}
            className="absolute top-0 rounded-sm"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 1.6,
              background: `hsl(var(${colorVar}))`,
              boxShadow: `0 0 8px hsl(var(${colorVar}))`,
              animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
              ['--dx' as any]: `${p.dx}px`,
            }}
          />
        ))}
      </div>

      <div className={cn(
        "relative w-full max-w-sm rounded-3xl border bg-card p-6 text-center animate-scale-in",
        isI ? "border-istegfar/40 shadow-istegfar" : "border-durood/40 shadow-durood"
      )}>
        <div className="text-5xl mb-2">{isI ? '🤲' : '🌙'}</div>
        <p className="font-arabic text-2xl mb-3 leading-loose" dir="rtl"
           style={{ color: `hsl(var(${colorVar}))` }}>
          {arabicHero}
        </p>
        <h2 className={cn(
          "font-bengali font-bold text-3xl mb-2",
          isI ? "text-istegfar" : "text-durood"
        )}>মাশাআল্লাহ!</h2>
        <p className="font-bengali text-sm text-foreground/90 mb-3">
          {waqtLabel} ওয়াক্তে {isI ? 'ইস্তেগফার' : 'দরূদ'}-এর{' '}
          <span className="font-bold">{toBengaliNumber(laps)}</span> ল্যাপ পূর্ণ হয়েছে।
        </p>
        <p className="font-arabic text-base text-muted-foreground mb-5 leading-loose" dir="rtl">{dua}</p>
        <button
          onClick={onClose}
          className={cn(
            "w-full h-12 rounded-xl font-bengali font-semibold text-primary-foreground active:scale-95 transition",
            isI ? "bg-gradient-istegfar" : "bg-gradient-durood"
          )}
        >
          আবার শুরু
        </button>
      </div>
    </div>
  );
};
