import { describe, expect, it } from "vitest";
import { isRepeatStep, parseDuration, replaceOnInsert } from "./stepper.tsx";

describe("isRepeatStep", () => {
  const stepsIn = (from: number, to: number) =>
    Array.from({ length: to - from }, (_, i) => from + i).filter(isRepeatStep)
      .length;

  it("steps on the press and on the first repeat", () => {
    expect(isRepeatStep(0)).toBe(true);
    expect(isRepeatStep(1)).toBe(true);
  });

  it("speeds up the longer the hold lasts", () => {
    expect(stepsIn(1, 21)).toBe(7);
    expect(stepsIn(21, 41)).toBe(10);
    expect(stepsIn(41, 61)).toBe(20);
  });
});

describe("parseDuration", () => {
  it.each([
    ["90", 90],
    ["1:30", 90],
    ["1.30", 90],
    ["1,30", 90],
    [" 2:05 ", 125],
    ["1:00:00", 3600],
    ["1.00.00", 3600],
  ])("reads %j as %i seconds", (text, seconds) => {
    expect(parseDuration(text)).toBe(seconds);
  });

  it.each(["", "1:", ".30", "1:2:3:4", "1:3a", "-5"])("rejects %j", (text) => {
    expect(parseDuration(text)).toBeNull();
  });
});

describe("replaceOnInsert", () => {
  it.each([
    ["100", "1005", "5"],
    ["100", "5100", "5"],
    ["100", "1100", "1"],
    ["", "8", "8"],
  ])("typing into %j to get %j leaves only %j", (before, after, typed) => {
    expect(replaceOnInsert(before, after, typed)).toBe(typed);
  });

  it.each([
    ["deleting", "100", "10", null],
    ["replacing a selection", "10", "100", "100"],
    ["replacing part of a selection", "100", "105", "5"],
  ])("keeps the edit when %s", (_case, before, after, typed) => {
    expect(replaceOnInsert(before, after, typed)).toBe(after);
  });
});
