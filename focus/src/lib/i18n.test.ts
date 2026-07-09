import { describe, expect, it } from "vitest";
import { formatCountdown, localizeDigits, t } from "./i18n";

describe("localizeDigits", () => {
  it("converts digits to Bengali numerals for bn", () => {
    expect(localizeDigits("3/5", "bn")).toBe("৩/৫");
    expect(localizeDigits("120", "bn")).toBe("১২০");
  });
  it("leaves English untouched", () => {
    expect(localizeDigits("3/5", "en")).toBe("3/5");
  });
});

describe("formatCountdown", () => {
  it("formats hours when present", () => {
    expect(formatCountdown(2 * 3600_000 + 5 * 60_000 + 3000, "en")).toBe("2:05:03");
  });
  it("formats minutes:seconds under an hour", () => {
    expect(formatCountdown(9 * 60_000 + 7000, "en")).toBe("9:07");
  });
  it("clamps negatives to zero", () => {
    expect(formatCountdown(-5000, "en")).toBe("0:00");
  });
  it("uses Bengali digits in bn", () => {
    expect(formatCountdown(60_000, "bn")).toBe("১:০০");
  });
});

describe("t", () => {
  it("returns both languages", () => {
    expect(t("jumuah", "bn")).toBe("জুমা");
    expect(t("jumuah", "en")).toBe("Jumu'ah");
  });
});
