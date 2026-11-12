import { beforeEach, describe, expect, it } from "vitest";
import { pinLanguage } from "../i18n/index.ts";
import {
  formatAgo,
  formatBytes,
  formatSessionLength,
  formatWeight,
} from "./format.ts";

beforeEach(() => pinLanguage("en"));

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1024, "1 kB"],
    [180 * 1024, "180 kB"],
    [2.4 * 1024 * 1024, "2.4 MB"],
    [10 * 1024 * 1024, "10 MB"],
    [1023 * 1024 * 1024, "1,023 MB"],
    [2.5 * 1024 * 1024 * 1024, "2.5 GB"],
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

describe("in Finnish", () => {
  beforeEach(() => pinLanguage("fi"));

  it("uses the decimal comma and Finnish units", () => {
    expect(formatWeight(102.5, "kg")).toBe("102,5");
    expect(formatBytes(2.4 * 1024 * 1024)).toBe("2,4 Mt");
    expect(formatBytes(850)).toBe("850 t");
    expect(formatAgo(0, 0)).toBe("juuri nyt");
    expect(formatSessionLength(65 * min)).toBe("1t 5min");
  });
});
