import { describe, expect, it } from "vitest";
import type { R2Config, R2Request } from "./r2.ts";
import { checkTokenSeparation } from "./token-check.ts";

const backups: R2Config = {
  endpoint: "https://r2.example",
  bucket: "wl-backups",
  accessKeyId: "backups",
  secretAccessKey: "backups-secret",
};
const replica: R2Config = {
  endpoint: "https://r2.example",
  bucket: "wl-litestream",
  accessKeyId: "read",
  secretAccessKey: "read-secret",
};

/** R2 answering each `token action bucket` from `answers`, 403 otherwise. */
function fakeR2(answers: Record<string, number> = {}) {
  const requests: string[] = [];
  const status = async (config: R2Config, request: R2Request) => {
    const name = `${config.accessKeyId} ${request.action} ${config.bucket}`;
    requests.push(name);
    return answers[name] ?? 403;
  };
  return { requests, status };
}

describe("token separation check", () => {
  it("passes when R2 refuses every probe", async () => {
    const r2 = fakeR2();
    await checkTokenSeparation(backups, replica, r2.status);
    expect(r2.requests).toEqual([
      "read put wl-litestream",
      "read list wl-backups",
      "backups list wl-litestream",
    ]);
  });

  it("removes the probe and fails when the read token can write", async () => {
    const r2 = fakeR2({ "read put wl-litestream": 200 });
    await expect(
      checkTokenSeparation(backups, replica, r2.status),
    ).rejects.toThrow(
      "the replica read token can write to wl-litestream; give it Object Read only",
    );
    expect(r2.requests).toContain("read delete wl-litestream");
  });

  it("names each token that reaches the other bucket", async () => {
    const r2 = fakeR2({
      "read list wl-backups": 200,
      "backups list wl-litestream": 200,
    });
    await expect(
      checkTokenSeparation(backups, replica, r2.status),
    ).rejects.toThrow(
      "the replica read token listing wl-backups got 200, not 403; the backups token listing wl-litestream got 200, not 403",
    );
  });

  it("fails on an answer that proves nothing", async () => {
    const r2 = fakeR2({ "backups list wl-litestream": 500 });
    await expect(
      checkTokenSeparation(backups, replica, r2.status),
    ).rejects.toThrow("the backups token listing wl-litestream got 500");
  });
});
