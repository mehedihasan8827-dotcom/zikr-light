import { WAQTS, type WaqtId } from '@/lib/waqt';
import { cn } from '@/lib/utils';

interface DotState { istegfar: boolean; durood: boolean; }

interface Props {
  states: Record<WaqtId, DotState>;
  active: WaqtId;
}

export const WaqtDots = ({ states, active }: Props) => {
  return (
    <div className="flex items-center justify-center gap-4 py-1">
      {WAQTS.map(w => {
        const s = states[w.id];
        const both = s.istegfar && s.durood;
        const onlyI = s.istegfar && !s.durood;
        const onlyD = !s.istegfar && s.durood;
        const none = !s.istegfar && !s.durood;
        return (
          <div key={w.id} className="flex flex-col items-center gap-1.5">
            <div
              className={cn(
                "h-2 w-2 rounded-full transition-all",
                both && "bg-gradient-both",
                onlyI && "bg-istegfar/80",
                onlyD && "bg-durood/80",
                none && "bg-muted",
                active === w.id && "ring-1 ring-foreground/30 ring-offset-2 ring-offset-background"
              )}
            />
            <span className="text-[10px] text-muted-foreground/70 font-bengali">{w.label}</span>
          </div>
        );
      })}
    </div>
  );
};
