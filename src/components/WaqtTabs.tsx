import { WAQTS, type WaqtId } from '@/lib/waqt';
import { cn } from '@/lib/utils';

interface Props {
  active: WaqtId;
  current: WaqtId;
  onChange: (w: WaqtId) => void;
}

export const WaqtTabs = ({ active, current, onChange }: Props) => {
  return (
    <div className="flex gap-1 p-1 rounded-2xl bg-card/60 backdrop-blur border border-border/50">
      {WAQTS.map(w => {
        const isActive = active === w.id;
        const isCurrent = current === w.id;
        return (
          <button
            key={w.id}
            onClick={() => onChange(w.id)}
            className={cn(
              "flex-1 py-2 px-1 rounded-xl text-sm font-bengali transition-all relative",
              isActive
                ? "bg-foreground/10 text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground/80"
            )}
          >
            {w.label}
            {isCurrent && (
              <span className="absolute top-1 right-1.5 h-1.5 w-1.5 rounded-full bg-istegfar shadow-[0_0_8px_hsl(var(--istegfar))]" />
            )}
          </button>
        );
      })}
    </div>
  );
};
