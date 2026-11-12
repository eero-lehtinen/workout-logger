import { describe, expect, it } from "vitest";
import { parseDuration, replaceOnInsert } from "./stepper.tsx";

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
