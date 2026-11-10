import { describe, expect, it } from "vitest";
import { replaceOnInsert } from "./stepper.tsx";

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
