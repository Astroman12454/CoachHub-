import { describe, it, expect } from "vitest";
import { isMinor, MINOR_AGE_THRESHOLD } from "./age";

const TODAY = new Date(Date.UTC(2026, 7, 18)); // 2026-08-18

describe("isMinor", () => {
  it("treats a missing birth date as not a minor", () => {
    expect(isMinor(null, TODAY)).toBe(false);
    expect(isMinor(undefined, TODAY)).toBe(false);
    expect(isMinor("", TODAY)).toBe(false);
  });

  it("treats a malformed birth date as not a minor rather than throwing", () => {
    expect(isMinor("not-a-date", TODAY)).toBe(false);
  });

  it(`is true for someone under ${MINOR_AGE_THRESHOLD}`, () => {
    expect(isMinor("2015-01-01", TODAY)).toBe(true); // 11
  });

  it(`is false for someone ${MINOR_AGE_THRESHOLD} or older`, () => {
    expect(isMinor("2000-01-01", TODAY)).toBe(false); // 26
  });

  it("handles the exact threshold birthday boundary correctly", () => {
    // Turns 14 today — no longer a minor as of today.
    const turnsThresholdToday = "2012-08-18";
    expect(isMinor(turnsThresholdToday, TODAY)).toBe(false);

    // Turns 14 tomorrow — still a minor today.
    const turnsThresholdTomorrow = "2012-08-19";
    expect(isMinor(turnsThresholdTomorrow, TODAY)).toBe(true);
  });
});
