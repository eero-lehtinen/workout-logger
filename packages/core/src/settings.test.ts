import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { SETTINGS } from "./settings.ts";

describe("rest_alert_volume", () => {
  const schema = SETTINGS.rest_alert_volume.schema;

  it("reads a percent", () => {
    expect(v.parse(schema, 80)).toBe(80);
  });

  it("reads the levels older apps wrote", () => {
    expect(v.parse(schema, "low")).toBe(30);
    expect(v.parse(schema, "medium")).toBe(55);
    expect(v.parse(schema, "high")).toBe(100);
  });

  it("rejects values outside the slider", () => {
    expect(v.safeParse(schema, 0).success).toBe(false);
    expect(v.safeParse(schema, 101).success).toBe(false);
    expect(v.safeParse(schema, 50.5).success).toBe(false);
  });
});
