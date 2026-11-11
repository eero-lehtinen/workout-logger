import type { Store } from "../store/store.ts";
import { SyncInterrupted } from "./client.ts";
import type {
  PullResponse,
  PushResponse,
  SnapshotResponse,
} from "./protocol.ts";
import { type SyncReport, type SyncTransport, syncOnce } from "./run.ts";

export interface HttpSyncConfig {
  /** Empty for the web app, which the server serves. */
  baseUrl: string;
  /** The Android app's bearer token; the web app sends its session cookie. */
  token: string | null;
  /** The Android app's version, for the server's minimum version check. */
  clientVersion: string | null;
  /**
   * The account this device's data belongs to. The server refuses the run if
   * the session is another account's, e.g. after a sign-in in another tab.
   */
  userId: string;
}

export const EXPECTED_USER_HEADER = "X-Expected-User";

/** Why a sync run stopped early. Plain data, so it crosses a worker boundary. */
export type SyncFailure =
  /** The session ended or was revoked: sign in again. The outbox is kept. */
  | "unauthorized"
  /** The server requires a newer app (HTTP 426). */
  | "update_required"
  /** The session belongs to another account than expected: check it again. */
  | "account_changed"
  /** Too many requests (HTTP 429); the next run tries again. */
  | "rate_limited"
  /** Today's snapshot downloads are used up (HTTP 429 `quota`). */
  | "quota"
  /** The owner disabled the account (HTTP 403); sync waits until enabled. */
  | "account_disabled"
  /**
   * Another run, or an account choice, changed the sync state first. Nothing
   * was written; run again.
   */
  | "interrupted"
  /** The server couldn't be reached. */
  | "offline"
  | "server";

export type SyncOutcome =
  | { ok: true; report: SyncReport }
  | { ok: false; failure: SyncFailure; message: string };

class HttpError extends Error {
  readonly status: number;
  /** The `error` of a JSON body, e.g. `quota` on a 429. */
  readonly code: string | null;
  constructor(status: number, code: string | null) {
    super(`The server answered ${status}${code ? ` (${code})` : ""}`);
    this.status = status;
    this.code = code;
  }
}

async function errorCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}

export function httpTransport(
  config: HttpSyncConfig,
  fetchFn: typeof fetch = fetch,
): SyncTransport {
  const headers: Record<string, string> = {
    [EXPECTED_USER_HEADER]: config.userId,
  };
  if (config.token) headers.Authorization = `Bearer ${config.token}`;
  if (config.clientVersion) headers["X-Client-Version"] = config.clientVersion;
  const base = `${config.baseUrl}/api/sync/v1`;

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetchFn(`${base}${path}`, {
      ...init,
      headers: { ...headers, ...init.headers },
    });
    if (!res.ok) throw new HttpError(res.status, await errorCode(res));
    return (await res.json()) as T;
  }

  return {
    push: (request) =>
      call<PushResponse>("/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      }),
    pull: (after, limit) =>
      call<PullResponse>(`/pull?after=${after}&limit=${limit}`),
    snapshot: () => call<SnapshotResponse>("/snapshot"),
  };
}

/** One sync run over HTTP, with failures as values. */
export async function syncOverHttp(
  store: Store,
  config: HttpSyncConfig,
  fetchFn: typeof fetch = fetch,
): Promise<SyncOutcome> {
  try {
    const report = await syncOnce(store, httpTransport(config, fetchFn), {
      clientVersion: config.clientVersion ?? "web",
      userId: config.userId,
    });
    return { ok: true, report };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof SyncInterrupted) {
      return { ok: false, failure: "interrupted", message };
    }
    if (error instanceof HttpError) {
      if (error.status === 401) {
        return { ok: false, failure: "unauthorized", message };
      }
      if (error.status === 403 && error.code === "account_disabled") {
        return { ok: false, failure: "account_disabled", message };
      }
      if (error.status === 409) {
        return { ok: false, failure: "account_changed", message };
      }
      if (error.status === 426) {
        return { ok: false, failure: "update_required", message };
      }
      if (error.status === 429) {
        const failure = error.code === "quota" ? "quota" : "rate_limited";
        return { ok: false, failure, message };
      }
      return { ok: false, failure: "server", message };
    }
    // fetch rejects with a TypeError when the network fails.
    if (error instanceof TypeError) {
      return { ok: false, failure: "offline", message };
    }
    return { ok: false, failure: "server", message };
  }
}
