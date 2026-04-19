import { WAQTS, type WaqtId } from '@/lib/waqt';
import { cn } from '@/lib/utils';

interface DotState { istegfar: boolean; durood: boolean; }

interface Props {
  states: Record<WaqtId, DotState>;
  active: WaqtId;
}

export const WaqtDots = ({ states, active }: Props) => {
  return (
    <div className="flex items-center justify-center gap-3 py-2">
      {WAQTS.map(w => {
        const s = states[w.id];
        const both = s.istegfar && s.durood;
        const onlyI = s.istegfar && !s.durood;
        const onlyD = !s.istegfar && s.durood;
        const none = !s.istegfar && !s.durood;
        return (
          <div key={w.id} className="flex flex-col items-center gap-1">
            <div
              className={cn(
                "h-3 w-3 rounded-full transition-all",
                both && "bg-gradient-both shadow-[0_0_10px_hsl(var(--durood))]",
                onlyI && "bg-istegfar shadow-[0_0_8px_hsl(var(--istegfar))]",
                onlyD && "bg-durood shadow-[0_0_8px_hsl(var(--durood))]",
                none && "bg-muted",
                active === w.id && "ring-2 ring-foreground/40 ring-offset-2 ring-offset-background scale-110"
              )}
            />
            <span className="text-[10px] text-muted-foreground font-bengali">{w.label}</span>
          </div>
        );
      })}
    </div>
  );
};
