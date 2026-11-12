import { describe, expect, it } from "vitest";
import { forgetRoute, rememberRoute, takeRoute } from "./switch-route.ts";

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

const blocked = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("switch route", () => {
  it("returns the remembered route once", () => {
    const storage = memoryStorage();
    rememberRoute(storage, "/history?period=month#top");
    expect(takeRoute(storage)).toBe("/history?period=month#top");
    expect(takeRoute(storage)).toBeNull();
  });

  it("returns nothing after forgetting", () => {
    const storage = memoryStorage();
    rememberRoute(storage, "/settings");
    forgetRoute(storage);
    expect(takeRoute(storage)).toBeNull();
  });

  it.each(["//example.com/settings", "https://example.com/", "settings", ""])(
    "ignores %j, which isn't a path on this origin",
    (route) => {
      const storage = memoryStorage();
      rememberRoute(storage, route);
      expect(takeRoute(storage)).toBeNull();
    },
  );

  it("tolerates blocked storage", () => {
    expect(() => rememberRoute(blocked, "/settings")).not.toThrow();
    expect(() => forgetRoute(blocked)).not.toThrow();
    expect(takeRoute(blocked)).toBeNull();
  });
});
