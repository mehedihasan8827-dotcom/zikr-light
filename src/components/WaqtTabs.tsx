import { WAQTS, type WaqtId } from '@/lib/waqt';
import { cn } from '@/lib/utils';

interface Props {
  active: WaqtId;
  current: WaqtId;
  onChange: (w: WaqtId) => void;
}

export const WaqtTabs = ({ active, current, onChange }: Props) => {
  return (
    <div className="flex gap-1">
      {WAQTS.map(w => {
        const isActive = active === w.id;
        const isCurrent = current === w.id;
        return (
          <button
            key={w.id}
            onClick={() => onChange(w.id)}
            className={cn(
              "flex-1 py-2.5 px-1 text-sm font-bengali transition-colors relative",
              isActive ? "text-foreground" : "text-muted-foreground/70 hover:text-foreground/80"
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              {w.label}
              {isCurrent && (
                <span className="h-1 w-1 rounded-full bg-foreground/50" />
              )}
            </span>
            {isActive && (
              <span className="absolute left-1/2 -translate-x-1/2 bottom-0 h-px w-8 bg-foreground/40" />
            )}
          </button>
        );
      })}
    </div>
  );
};
