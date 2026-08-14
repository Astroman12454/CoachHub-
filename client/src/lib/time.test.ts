import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { addMinutesToClock, calculateAge, formatTimestamp } from "./time";

describe("addMinutesToClock", () => {
  it("adds minutes within the same hour", () => {
    expect(addMinutesToClock("14:05", 10)).toBe("2:15 PM");
  });

  it("rolls over into the next hour", () => {
    expect(addMinutesToClock("14:50", 20)).toBe("3:10 PM");
  });

  it("converts midday/midnight boundaries to 12-hour clock correctly", () => {
    expect(addMinutesToClock("11:30", 30)).toBe("12:00 PM");
    expect(addMinutesToClock("23:50", 20)).toBe("12:10 AM");
    expect(addMinutesToClock("00:00", 0)).toBe("12:00 AM");
  });

  it("wraps past midnight", () => {
    expect(addMinutesToClock("23:00", 90)).toBe("12:30 AM");
  });

  it("returns null for a malformed start time", () => {
    expect(addMinutesToClock("", 15)).toBeNull();
    expect(addMinutesToClock("not-a-time", 15)).toBeNull();
  });
});

describe("formatTimestamp", () => {
  it("returns an empty string for null", () => {
    expect(formatTimestamp(null)).toBe("");
  });

  it("formats an ISO timestamp as month, day, and time", () => {
    // Locale-dependent formatting (toLocaleDateString), so assert on shape
    // rather than an exact string — a specific "Aug 14" would break under a
    // non-US CI locale even though the function is working correctly.
    const formatted = formatTimestamp("2026-08-14T15:40:00.000Z");
    expect(formatted).toMatch(/\d{1,2}:\d{2}/);
    expect(formatted.length).toBeGreaterThan(0);
  });
});

describe("calculateAge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts a full year once the birthday has passed this year", () => {
    expect(calculateAge("2010-01-15")).toBe(16);
  });

  it("does not count this year until the birthday arrives", () => {
    expect(calculateAge("2010-12-25")).toBe(15);
  });

  it("counts the birthday itself as the new age", () => {
    expect(calculateAge("2010-08-09")).toBe(16);
  });

  it("returns null for a malformed date", () => {
    expect(calculateAge("")).toBeNull();
    expect(calculateAge("not-a-date")).toBeNull();
    expect(calculateAge("2010/01/15")).toBeNull();
  });
});
