import { Settings2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toBengaliNumber } from '@/lib/bengali';
import { type AppSettings, type BgTone, TARGET_PRESETS } from '@/lib/settings';

interface Props {
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
}

const TONES: { id: BgTone; labelBn: string }[] = [
  { id: 'darker',  labelBn: 'গাঢ়' },
  { id: 'default', labelBn: 'মাঝারি' },
  { id: 'lighter', labelBn: 'হালকা' },
];

export function SettingsSheet({ settings, onChange }: Props) {
  return (
    <Sheet>
      <SheetTrigger
        aria-label="সেটিংস"
        className="absolute right-4 top-6 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/40 transition-colors"
      >
        <Settings2 className="h-4 w-4" />
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-3xl border-border/40 max-w-md mx-auto max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-center">
          <SheetTitle className="font-bengali font-medium">সেটিংস</SheetTitle>
          <SheetDescription className="font-bengali text-xs">
            লক্ষ্যমাত্রা, কম্পন ও ব্যাকগ্রাউন্ড সাজান
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex flex-col gap-7 pb-2">
          {/* Targets */}
          <div className="flex flex-col gap-4">
            <Label className="font-bengali text-sm text-foreground/80">প্রতি ওয়াক্তে লক্ষ্যমাত্রা</Label>
            <TargetRow
              labelBn="ইস্তেগফার"
              value={settings.targetIstegfar}
              accent="text-istegfar"
              onChange={(v) => onChange({ ...settings, targetIstegfar: v })}
            />
            <TargetRow
              labelBn="দরূদ"
              value={settings.targetDurood}
              accent="text-durood"
              onChange={(v) => onChange({ ...settings, targetDurood: v })}
            />
          </div>

          {/* Haptics */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <Label className="font-bengali text-sm text-foreground/80">কম্পন (haptic)</Label>
              <span className="text-[11px] text-muted-foreground/70 font-bengali">প্রতিটি tap-এ মৃদু কম্পন</span>
            </div>
            <Switch
              checked={settings.haptics}
              onCheckedChange={(v) => onChange({ ...settings, haptics: v })}
            />
          </div>

          {/* Pattern opacity */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label className="font-bengali text-sm text-foreground/80">তারা প্যাটার্ন</Label>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {Math.round(settings.patternOpacity * 100)}%
              </span>
            </div>
            <Slider
              value={[Math.round(settings.patternOpacity * 100)]}
              min={0}
              max={10}
              step={1}
              onValueChange={(v) => onChange({ ...settings, patternOpacity: (v[0] ?? 0) / 100 })}
            />
          </div>

          {/* Background tone */}
          <div className="flex flex-col gap-3">
            <Label className="font-bengali text-sm text-foreground/80">ব্যাকগ্রাউন্ড</Label>
            <div className="grid grid-cols-3 gap-2">
              {TONES.map((t) => {
                const active = settings.bgTone === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => onChange({ ...settings, bgTone: t.id })}
                    className={[
                      'rounded-xl border px-3 py-3 text-xs font-bengali transition-colors',
                      active
                        ? 'border-foreground/40 bg-muted/60 text-foreground'
                        : 'border-border/40 text-muted-foreground hover:text-foreground/80',
                    ].join(' ')}
                  >
                    {t.labelBn}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TargetRow({
  labelBn, value, accent, onChange,
}: { labelBn: string; value: number; accent: string; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className={`font-bengali text-xs ${accent}`}>{labelBn}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums font-bengali">
          {toBengaliNumber(value)}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {TARGET_PRESETS.map((p) => {
          const active = p === value;
          return (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={[
                'rounded-lg py-1.5 text-[11px] font-bengali tabular-nums transition-colors',
                active
                  ? 'bg-muted/70 text-foreground border border-foreground/30'
                  : 'bg-muted/30 text-muted-foreground/85 border border-transparent hover:text-foreground/85',
              ].join(' ')}
            >
              {toBengaliNumber(p)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
