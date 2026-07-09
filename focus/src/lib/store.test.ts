import { describe, expect, it } from "vitest";
import type { DayMap, DayRecord } from "./store";
import { computeStreak, dateKey, isFullDay } from "./store";

function fullDay(): DayRecord {
  return {
    prayed: { fajr: "ontime", dhuhr: "ontime", asr: "late", maghrib: "ontime", isha: "ontime" },
    focusMinutes: 120,
    sessions: 3,
    snoozes: 0,
  };
}

function partialDay(): DayRecord {
  return {
    prayed: { fajr: "ontime", dhuhr: "ontime" },
    focusMinutes: 60,
    sessions: 1,
    snoozes: 1,
  };
}

function daysAgo(base: Date, n: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() - n);
  return dateKey(d);
}

describe("isFullDay", () => {
  it("requires all five prayers marked (any status)", () => {
    expect(isFullDay(fullDay())).toBe(true);
    expect(isFullDay(partialDay())).toBe(false);
    expect(isFullDay(undefined)).toBe(false);
  });
});

describe("computeStreak", () => {
  const today = new Date(2026, 6, 9);

  it("counts consecutive full days ending today", () => {
    const days: DayMap = {
      [daysAgo(today, 0)]: fullDay(),
      [daysAgo(today, 1)]: fullDay(),
      [daysAgo(today, 2)]: fullDay(),
    };
    expect(computeStreak(days, today)).toBe(3);
  });

  it("does not break the streak while today is still incomplete", () => {
    const days: DayMap = {
      [daysAgo(today, 0)]: partialDay(),
      [daysAgo(today, 1)]: fullDay(),
      [daysAgo(today, 2)]: fullDay(),
    };
    expect(computeStreak(days, today)).toBe(2);
  });

  it("stops at a gap", () => {
    const days: DayMap = {
      [daysAgo(today, 0)]: fullDay(),
      [daysAgo(today, 2)]: fullDay(),
      [daysAgo(today, 3)]: fullDay(),
    };
    expect(computeStreak(days, today)).toBe(1);
  });

  it("is zero with no history", () => {
    expect(computeStreak({}, today)).toBe(0);
  });
});
