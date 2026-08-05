import { describe, it, expect } from "vitest";
import { addMinutesToClock } from "./time";

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
