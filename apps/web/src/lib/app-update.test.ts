import { describe, expect, it } from "vitest";
import { isUpdate } from "./app-update.ts";

describe("isUpdate", () => {
  it.each([
    ["1.2.3", "1.2.4", true],
    ["1.2.3", "1.10.0", true],
    ["1.2.3", "2.0.0", true],
    ["1.2.3", "1.2.3", false],
    ["1.10.0", "1.9.9", false],
  ])("from %s to %s: %s", (installed, latest, expected) => {
    expect(isUpdate(installed, latest)).toBe(expected);
  });

  it("never offers an update to a local build", () => {
    expect(isUpdate("0.0.0", "1.0.0")).toBe(false);
    expect(isUpdate("0.0.0-debug", "1.0.0")).toBe(false);
  });

  it("ignores a version it can't read", () => {
    expect(isUpdate("1.0.0", "latest")).toBe(false);
  });
});
