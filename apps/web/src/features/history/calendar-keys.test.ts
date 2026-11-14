import { describe, expect, it } from "vitest";
import { dayForKey } from "./calendar-keys.ts";

describe("dayForKey", () => {
  // A Wednesday.
  const day = "2026-06-17";
  const key = (k: string, shift = false) => dayForKey(day, k, shift, "monday");

  it("moves by day and week across month ends", () => {
    expect(key("ArrowLeft")).toBe("2026-06-16");
    expect(key("ArrowRight")).toBe("2026-06-18");
    expect(key("ArrowUp")).toBe("2026-06-10");
    expect(key("ArrowDown")).toBe("2026-06-24");
    expect(dayForKey("2026-06-28", "ArrowDown", false, "monday")).toBe(
      "2026-07-05",
    );
  });

  it("moves by month and year, clamping the day", () => {
    expect(key("PageUp")).toBe("2026-05-17");
    expect(key("PageDown", true)).toBe("2027-06-17");
    expect(dayForKey("2026-03-31", "PageUp", false, "monday")).toBe(
      "2026-02-28",
    );
  });

  it("goes to the ends of the week by the week start", () => {
    expect(key("Home")).toBe("2026-06-15");
    expect(key("End")).toBe("2026-06-21");
    expect(dayForKey(day, "Home", false, "sunday")).toBe("2026-06-14");
    expect(dayForKey(day, "End", false, "sunday")).toBe("2026-06-20");
  });

  it("ignores other keys", () => {
    expect(key("Enter")).toBeNull();
  });
});
