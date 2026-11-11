import { describe, expect, it } from "vitest";
import { readConfig } from "./config.ts";

const GOOGLE = { GOOGLE_CLIENT_ID: "g-id", GOOGLE_CLIENT_SECRET: "g-secret" };
const GITHUB = { GITHUB_CLIENT_ID: "h-id", GITHUB_CLIENT_SECRET: "h-secret" };
const PRODUCTION = { NODE_ENV: "production", AUTH_SECRET: "secret" };

describe("SIGN_IN_PROVIDERS", () => {
  it.each([
    ["unset", {}],
    ["empty, as compose passes it unset", { SIGN_IN_PROVIDERS: "" }],
  ])("defaults to Google when %s", (_, env) => {
    const config = readConfig({ ...env, ...GOOGLE, ...GITHUB });
    expect(config.signIn).toEqual({
      google: { clientId: "g-id", clientSecret: "g-secret" },
    });
  });

  it("enables each listed provider", () => {
    const config = readConfig({
      SIGN_IN_PROVIDERS: "google, github",
      ...GOOGLE,
      ...GITHUB,
    });
    expect(Object.keys(config.signIn)).toEqual(["google", "github"]);
  });

  it("refuses a listed provider without credentials in production", () => {
    expect(() =>
      readConfig({
        ...PRODUCTION,
        SIGN_IN_PROVIDERS: "google,github",
        ...GOOGLE,
      }),
    ).toThrow("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required");
  });

  it("turns it off with a warning elsewhere", () => {
    const config = readConfig({});
    expect(config.signIn).toEqual({});
    expect(config.signInMissing).toEqual(["google"]);
  });

  it("refuses an unknown provider", () => {
    expect(() => readConfig({ SIGN_IN_PROVIDERS: "apple" })).toThrow(
      'unknown provider "apple"',
    );
  });
});
