import { describe, expect, it, vi } from "vitest";
import { openTestServer, openTestStore } from "../testing.ts";
import { adoptAccount } from "./account.ts";
import { syncOverHttp } from "./http.ts";
import { pull, push, snapshot } from "./server/sync.ts";

const T0 = 1_700_000_000_000;

describe("syncOverHttp", () => {
  it.each([
    [401, null, "unauthorized"],
    [409, null, "account_changed"],
    [426, null, "update_required"],
    [429, "rate_limited", "rate_limited"],
    [429, "quota", "quota"],
    [500, null, "server"],
  ])("reports HTTP %i %s as %s", async (status, code, failure) => {
    const store = await openTestStore({ now: () => T0 });
    const fetch = vi.fn(async () =>
      code
        ? Response.json({ error: code }, { status })
        : new Response(null, { status }),
    );
    const outcome = await syncOverHttp(
      store,
      { baseUrl: "", token: null, clientVersion: null, userId: "u1" },
      fetch,
    );
    expect(outcome).toMatchObject({ ok: false, failure });
  });

  it("reports a network failure as offline", async () => {
    const store = await openTestStore({ now: () => T0 });
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const outcome = await syncOverHttp(
      store,
      { baseUrl: "", token: null, clientVersion: null, userId: "u1" },
      fetch,
    );
    expect(outcome).toMatchObject({ ok: false, failure: "offline" });
  });

  it("sends the Android app's token and version", async () => {
    const { db: server } = await openTestServer();
    const store = await openTestStore({ now: () => T0 });
    await adoptAccount(store, "u1", "keep");
    const seen: Headers[] = [];
    const fetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        seen.push(headers);
        const { pathname, searchParams } = new URL(String(url), "http://x");
        const body = pathname.endsWith("/push")
          ? await push(server, "u1", JSON.parse(String(init?.body)), {
              now: T0,
            })
          : pathname.endsWith("/pull")
            ? await pull(server, "u1", Number(searchParams.get("after")))
            : await snapshot(server, "u1");
        return Response.json(body);
      },
    );
    const outcome = await syncOverHttp(
      store,
      {
        baseUrl: "https://example.com",
        token: "t0k3n",
        clientVersion: "1.2.3",
        userId: "u1",
      },
      fetch,
    );
    expect(outcome).toMatchObject({ ok: true, report: { status: "ok" } });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/example\.com\/api\/sync\/v1\//),
      expect.anything(),
    );
    for (const headers of seen) {
      expect(headers.get("authorization")).toBe("Bearer t0k3n");
      expect(headers.get("x-client-version")).toBe("1.2.3");
      expect(headers.get("x-expected-user")).toBe("u1");
    }
  });
});
