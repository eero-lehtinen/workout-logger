import { describe, expect, it } from "vitest";
import { formatAgo, formatBytes, formatSessionLength } from "./format.ts";

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1024, "1 kB"],
    [180 * 1024, "180 kB"],
    [2.4 * 1024 * 1024, "2.4 MB"],
    [10 * 1024 * 1024, "10 MB"],
  ])("formats %i as %s", (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});

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

describe("formatAgo", () => {
  const now = 1_700_000_000_000;
  it.each([
    [0, "just now"],
    [59_000, "just now"],
    [5 * min, "5 minutes ago"],
    [61 * min, "1 hour ago"],
    [25 * 60 * min, "yesterday"],
    [3 * 24 * 60 * min, "3 days ago"],
  ])("%i ms ago is %s", (ago, text) => {
    expect(formatAgo(now - ago, now)).toBe(text);
  });
});
