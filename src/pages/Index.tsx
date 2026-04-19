import { useEffect, useMemo, useState } from 'react';
import { WAQTS, type WaqtId, getCurrentWaqt, waqtLabel } from '@/lib/waqt';
import { loadAll, saveAll, type ZikrId } from '@/lib/storage';
import { WaqtTabs } from '@/components/WaqtTabs';
import { WaqtDots } from '@/components/WaqtDots';
import { ProgressBars } from '@/components/ProgressBars';
import { ZikrCard } from '@/components/ZikrCard';
import { CompletionOverlay } from '@/components/CompletionOverlay';
import { StatsBar } from '@/components/StatsBar';

const TARGETS: Record<ZikrId, number> = { istegfar: 1000, durood: 100 };

const ZIKR = {
  istegfar: {
    nameBn: 'ইস্তেগফার',
    arabic: 'أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ',
    translit: 'আস্তাগফিরুল্লাহা ওয়া আতূবু ইলাইহি',
  },
  durood: {
    nameBn: 'দরূদ',
    arabic: 'اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبِيِّنَا مُحَمَّد',
    translit: 'আল্লাহুম্মা সাল্লি ওয়া সাল্লিম ‘আলা নাবিয়্যিনা মুহাম্মাদ',
  },
} as const;

const Index = () => {
  const currentWaqt = useMemo(() => getCurrentWaqt(), []);
  const [active, setActive] = useState<WaqtId>(currentWaqt);
  const [state, setState] = useState(() => loadAll());
  const [completion, setCompletion] = useState<{ variant: ZikrId; laps: number } | null>(null);

  useEffect(() => { saveAll(state); }, [state]);

  const tap = (zikr: ZikrId) => {
    setState(prev => {
      const cur = prev[active][zikr];
      const next = { ...cur, count: cur.count + 1 };
      let completed = false;
      if (next.count >= TARGETS[zikr]) {
        next.count = 0;
        next.laps += 1;
        completed = true;
      }
      const updated = {
        ...prev,
        [active]: { ...prev[active], [zikr]: next },
      };
      if (completed) {
        setTimeout(() => setCompletion({ variant: zikr, laps: next.laps }), 0);
      }
      return updated;
    });
  };

  const reset = (zikr: ZikrId) => {
    setState(prev => ({
      ...prev,
      [active]: { ...prev[active], [zikr]: { ...prev[active][zikr], count: 0 } },
    }));
  };

  const ist = state[active].istegfar;
  const dur = state[active].durood;

  const dotStates = useMemo(() => {
    const out = {} as Record<WaqtId, { istegfar: boolean; durood: boolean }>;
    for (const w of WAQTS) {
      out[w.id] = {
        istegfar: state[w.id].istegfar.laps > 0 || state[w.id].istegfar.count >= TARGETS.istegfar,
        durood:   state[w.id].durood.laps   > 0 || state[w.id].durood.count   >= TARGETS.durood,
      };
    }
    return out;
  }, [state]);

  const todayI = WAQTS.reduce((s, w) => s + state[w.id].istegfar.laps * TARGETS.istegfar + state[w.id].istegfar.count, 0);
  const todayD = WAQTS.reduce((s, w) => s + state[w.id].durood.laps   * TARGETS.durood   + state[w.id].durood.count,   0);
  const waqtI = ist.laps * TARGETS.istegfar + ist.count;
  const waqtD = dur.laps * TARGETS.durood   + dur.count;

  return (
    <main className="min-h-screen w-full max-w-md mx-auto px-4 pt-5 pb-6 flex flex-col gap-4">
      {/* Header */}
      <header className="text-center">
        <h1 className="font-bengali font-bold text-2xl tracking-wide">
          <span className="bg-gradient-both bg-clip-text text-transparent">যিকর</span>
        </h1>
        <p className="text-[11px] text-muted-foreground font-bengali mt-0.5">
          ইস্তেগফার ও দরূদ — বর্তমান ওয়াক্ত: <span className="text-foreground">{waqtLabel(currentWaqt)}</span>
        </p>
      </header>

      <WaqtTabs active={active} current={currentWaqt} onChange={setActive} />

      <ProgressBars
        istegfar={{ count: ist.count, target: TARGETS.istegfar }}
        durood={{ count: dur.count, target: TARGETS.durood }}
      />

      <ZikrCard
        variant="istegfar"
        nameBn={ZIKR.istegfar.nameBn}
        arabic={ZIKR.istegfar.arabic}
        translit={ZIKR.istegfar.translit}
        target={TARGETS.istegfar}
        count={ist.count}
        laps={ist.laps}
        onTap={() => tap('istegfar')}
        onReset={() => reset('istegfar')}
      />

      <ZikrCard
        variant="durood"
        nameBn={ZIKR.durood.nameBn}
        arabic={ZIKR.durood.arabic}
        translit={ZIKR.durood.translit}
        target={TARGETS.durood}
        count={dur.count}
        laps={dur.laps}
        onTap={() => tap('durood')}
        onReset={() => reset('durood')}
      />

      <WaqtDots states={dotStates} active={active} />

      <StatsBar
        todayIstegfar={todayI}
        waqtIstegfar={waqtI}
        todayDurood={todayD}
        waqtDurood={waqtD}
      />

      {completion && (
        <CompletionOverlay
          variant={completion.variant}
          waqtLabel={waqtLabel(active)}
          laps={completion.laps}
          onClose={() => setCompletion(null)}
        />
      )}
    </main>
  );
};

export default Index;
