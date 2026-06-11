import { describe, expect, it } from "vitest";

import { formatElapsedSeconds } from "./time";

describe("formatElapsedSeconds", () => {
  it("formats minutes and seconds", () => {
    expect(formatElapsedSeconds(0)).toBe("0:00");
    expect(formatElapsedSeconds(9)).toBe("0:09");
    expect(formatElapsedSeconds(75)).toBe("1:15");
    expect(formatElapsedSeconds(600)).toBe("10:00");
  });

  it("includes hours past one hour", () => {
    expect(formatElapsedSeconds(3600)).toBe("1:00:00");
    expect(formatElapsedSeconds(3725)).toBe("1:02:05");
  });

  it("clamps invalid input to zero", () => {
    expect(formatElapsedSeconds(-3)).toBe("0:00");
    expect(formatElapsedSeconds(Number.NaN)).toBe("0:00");
  });
});
