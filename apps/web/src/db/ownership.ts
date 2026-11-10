import { type DbClient, type DbWorker, startDbWorker } from "./client.ts";

/**
 * Only one context can open the SAH-pool database. The tab holding this Web
 * Lock owns it; see docs/architecture.md#tab-ownership.
 */
const LOCK_NAME = "workout-logger-db";

// After a steal, the previous tab's worker may still hold the file handles
// for a moment.
const OPEN_ATTEMPTS = 10;
const RETRY_DELAY_MS = 150;

export type DbState =
  | { status: "starting" }
  | { status: "ready"; client: DbClient }
  | { status: "elsewhere" }
  | { status: "error"; error: unknown };

/** Holds the lock and the worker; observable for React. */
export class DbOwner {
  #state: DbState = { status: "starting" };
  #listeners = new Set<() => void>();
  #worker: DbWorker | undefined;
  #waiting: AbortController | undefined;
  #started = false;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getState = () => this.#state;

  /** Idempotent: React may run the starting effect twice. */
  start() {
    if (this.#started) return;
    this.#started = true;
    this.#request({ ifAvailable: true });
  }

  /** Takes the database from the tab that holds it. */
  takeOver() {
    this.#waiting?.abort();
    this.#set({ status: "starting" });
    this.#request({ steal: true });
  }

  /** Retries after an open failure, with a fresh worker. */
  retry() {
    this.#set({ status: "starting" });
    this.#request({ ifAvailable: true });
  }

  #request(options: LockOptions) {
    navigator.locks
      .request(LOCK_NAME, options, async (lock) => {
        if (!lock) {
          this.#set({ status: "elsewhere" });
          this.#waitForRelease();
          return;
        }
        // Aborting this request's own signal now would make a later steal
        // look like a cancellation.
        if (this.#waiting?.signal !== options.signal) this.#waiting?.abort();
        this.#waiting = undefined;
        const opened = await this.#open();
        // Hold the lock for the life of the tab, unless it is stolen.
        if (opened) await new Promise(() => {});
      })
      .catch((error: unknown) => {
        // Our own cancellation of a waiting request.
        if (options.signal?.aborted) return;
        // Another tab stole the lock.
        if (error instanceof DOMException && error.name === "AbortError") {
          this.#lost();
          return;
        }
        this.#set({ status: "error", error });
      });
  }

  /** Takes over automatically once the owning tab closes. */
  #waitForRelease() {
    this.#waiting?.abort();
    const waiting = new AbortController();
    this.#waiting = waiting;
    this.#request({ signal: waiting.signal });
  }

  async #open(): Promise<boolean> {
    let lastError: unknown;
    for (let attempt = 0; attempt < OPEN_ATTEMPTS; attempt++) {
      try {
        this.#worker = await startDbWorker();
        this.#set({ status: "ready", client: this.#worker.client });
        return true;
      } catch (error) {
        lastError = error;
        // A newer schema won't open on retry.
        if (error instanceof Error && error.name === "SchemaTooNewError") break;
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
    this.#set({ status: "error", error: lastError });
    return false;
  }

  /** Another tab stole the lock: release the database and wait. */
  #lost() {
    this.#worker?.terminate();
    this.#worker = undefined;
    this.#set({ status: "elsewhere" });
    this.#waitForRelease();
  }

  #set(state: DbState) {
    this.#state = state;
    for (const listener of this.#listeners) listener();
  }
}
