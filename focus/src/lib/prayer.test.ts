import { describe, expect, it } from "vitest";
import type { CalcSettings } from "./prayer";
import {
  PRAYER_KEYS,
  getCurrentPrayer,
  getDayPrayers,
  getNextPrayer,
  getWindowEnd,
  prayerLabelKey,
} from "./prayer";

const dhaka: CalcSettings = {
  lat: 23.8103,
  lng: 90.4125,
  method: "Karachi",
  madhab: "hanafi",
};

// 2026-07-10 is a Friday, 2026-07-09 a Thursday (local time construction).
const friday = new Date(2026, 6, 10, 12, 0);
const thursday = new Date(2026, 6, 9, 12, 0);

describe("getDayPrayers", () => {
  it("returns the five prayers in chronological order", () => {
    const prayers = getDayPrayers(thursday, dhaka);
    expect(prayers.map((p) => p.key)).toEqual(PRAYER_KEYS);
    for (let i = 1; i < prayers.length; i++) {
      expect(prayers[i].time.getTime()).toBeGreaterThan(prayers[i - 1].time.getTime());
    }
  });
});

describe("prayerLabelKey (Jumu'ah)", () => {
  it("labels dhuhr as jumuah on Friday", () => {
    expect(prayerLabelKey("dhuhr", friday)).toBe("jumuah");
  });
  it("keeps dhuhr on other days", () => {
    expect(prayerLabelKey("dhuhr", thursday)).toBe("dhuhr");
  });
  it("never relabels other prayers", () => {
    expect(prayerLabelKey("asr", friday)).toBe("asr");
    expect(prayerLabelKey("fajr", friday)).toBe("fajr");
  });
});

describe("getNextPrayer", () => {
  it("returns the following prayer within the same day", () => {
    const prayers = getDayPrayers(thursday, dhaka);
    const justAfterDhuhr = new Date(prayers[1].time.getTime() + 60_000);
    const next = getNextPrayer(justAfterDhuhr, dhaka);
    expect(next.key).toBe("asr");
    expect(next.isTomorrow).toBe(false);
  });

  it("rolls over to tomorrow's fajr after isha", () => {
    const prayers = getDayPrayers(thursday, dhaka);
    const afterIsha = new Date(prayers[4].time.getTime() + 30 * 60_000);
    const next = getNextPrayer(afterIsha, dhaka);
    expect(next.key).toBe("fajr");
    expect(next.isTomorrow).toBe(true);
    expect(next.time.getTime()).toBeGreaterThan(afterIsha.getTime());
  });
});

describe("getCurrentPrayer", () => {
  it("is null before fajr (outside yesterday's isha window)", () => {
    const fajr = getDayPrayers(thursday, dhaka)[0];
    const yesterdayIsha = getDayPrayers(new Date(2026, 6, 8, 12, 0), dhaka)[4];
    const betweenMidnightAndFajr = new Date(
      (fajr.time.getTime() + yesterdayIsha.time.getTime()) / 2,
    );
    // Midpoint between yesterday isha and today fajr is still inside isha's window
    expect(getCurrentPrayer(betweenMidnightAndFajr, dhaka)?.key).toBe("isha");
    // One minute before fajr is also still isha's window
    const justBeforeFajr = new Date(fajr.time.getTime() - 60_000);
    expect(getCurrentPrayer(justBeforeFajr, dhaka)?.key).toBe("isha");
  });

  it("returns the prayer whose window contains now", () => {
    const prayers = getDayPrayers(thursday, dhaka);
    const midAsr = new Date(
      (prayers[2].time.getTime() + prayers[3].time.getTime()) / 2,
    );
    expect(getCurrentPrayer(midAsr, dhaka)?.key).toBe("asr");
  });
});

describe("getWindowEnd", () => {
  it("ends a prayer's window at the next prayer", () => {
    const prayers = getDayPrayers(thursday, dhaka);
    const end = getWindowEnd(prayers[1], dhaka); // dhuhr
    expect(end.getTime()).toBe(prayers[2].time.getTime()); // asr
  });

  it("ends isha's window at tomorrow's fajr", () => {
    const prayers = getDayPrayers(thursday, dhaka);
    const end = getWindowEnd(prayers[4], dhaka);
    const tomorrowFajr = getDayPrayers(friday, dhaka)[0];
    expect(end.getTime()).toBe(tomorrowFajr.time.getTime());
  });
});
