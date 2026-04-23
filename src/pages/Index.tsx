import { useEffect, useMemo, useState } from 'react';
import { WAQTS, type WaqtId, getCurrentWaqt, waqtLabel } from '@/lib/waqt';
import { loadAll, saveAll, type ZikrId } from '@/lib/storage';
import { loadHistory, setToday } from '@/lib/history';
import { WaqtTabs } from '@/components/WaqtTabs';
import { WaqtDots } from '@/components/WaqtDots';
import { ZikrCard } from '@/components/ZikrCard';
import { CompletionOverlay } from '@/components/CompletionOverlay';
import { StatsBar } from '@/components/StatsBar';
import { StreakHistory } from '@/components/StreakHistory';
import { WeeklySummary } from '@/components/WeeklySummary';
import { SettingsSheet } from '@/components/SettingsSheet';
import { useSettings } from '@/lib/settings';

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
  const [currentWaqt, setCurrentWaqt] = useState<WaqtId>(() => getCurrentWaqt());
  const [active, setActive] = useState<WaqtId>(currentWaqt);
  const [state, setState] = useState(() => loadAll());
  const [history, setHistory] = useState(() => loadHistory());
  const [completion, setCompletion] = useState<{ variant: ZikrId; laps: number } | null>(null);
  const [settings, setSettings] = useSettings();
  const TARGETS: Record<ZikrId, number> = {
    istegfar: settings.targetIstegfar,
    durood: settings.targetDurood,
  };

  useEffect(() => { saveAll(state); }, [state]);

  // Live update current waqt every minute, and detect midnight rollover.
  useEffect(() => {
    const tick = () => {
      const w = getCurrentWaqt();
      setCurrentWaqt(prev => (prev === w ? prev : w));
      // Midnight rollover: loadAll() will archive previous day & return blank.
      const fresh = loadAll();
      setState(prev => {
        const prevDay = JSON.stringify(prev);
        const freshDay = JSON.stringify(fresh);
        return prevDay === freshDay ? prev : fresh;
      });
      setHistory(loadHistory());
    };
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

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

  useEffect(() => {
    setToday({ istegfar: todayI, durood: todayD });
    setHistory(loadHistory());
  }, [todayI, todayD]);

  return (
    <main className="min-h-screen w-full max-w-md mx-auto px-5 pt-7 pb-8 flex flex-col gap-6">
      {/* Header */}
      <header className="text-center relative">
        <h1 className="font-bengali text-2xl tracking-wide text-foreground/90 font-medium">
          যিকর
        </h1>
        <p className="text-[11px] text-muted-foreground/80 font-bengali mt-1">
          বর্তমান ওয়াক্ত · <span className="text-foreground/80">{waqtLabel(currentWaqt)}</span>
        </p>
        <SettingsSheet settings={settings} onChange={setSettings} />
      </header>

      <WaqtTabs active={active} current={currentWaqt} onChange={setActive} />

      <div className="flex flex-col gap-5">
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
      </div>

      <WaqtDots states={dotStates} active={active} />

      <StatsBar
        todayIstegfar={todayI}
        todayDurood={todayD}
        targetIstegfar={TARGETS.istegfar * WAQTS.length}
        targetDurood={TARGETS.durood * WAQTS.length}
      />

      <WeeklySummary
        todayIstegfar={todayI}
        todayDurood={todayD}
        targetIstegfar={TARGETS.istegfar}
        targetDurood={TARGETS.durood}
      />

      <StreakHistory
        history={history}
        todayIstegfar={todayI}
        todayDurood={todayD}
        targetIstegfar={TARGETS.istegfar}
        targetDurood={TARGETS.durood}
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
