import { describe, expect, it } from "vitest";
import { formatSessionLength } from "./format.ts";

const min = 60_000;

describe("formatSessionLength", () => {
  it("rounds down to whole minutes", () => {
    expect(formatSessionLength(0)).toBe("0m");
    expect(formatSessionLength(59_999)).toBe("0m");
    expect(formatSessionLength(42 * min + 30_000)).toBe("42m");
  });

  it("adds hours from 60 minutes", () => {
    expect(formatSessionLength(65 * min)).toBe("1h 5m");
    expect(formatSessionLength(120 * min)).toBe("2h 0m");
  });
});
