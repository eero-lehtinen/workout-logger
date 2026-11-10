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
// A paused tab holds them until it runs again, which may take minutes.
const BLOCKED_RETRY_MS = 2000;

export type DbState =
  | { status: "starting" }
  | { status: "ready"; client: DbClient }
  | { status: "elsewhere" }
  /** We hold the lock, but a paused tab's worker still holds the files. */
  | { status: "blocked" }
  | { status: "error"; error: unknown };

/** Holds the lock and the worker; observable for React. */
export class DbOwner {
  #state: DbState = { status: "starting" };
  #listeners = new Set<() => void>();
  #worker: DbWorker | undefined;
  #waiting: AbortController | undefined;
  /** Aborted when the lock we hold is stolen or given up. */
  #held: AbortController | undefined;
  #release: (() => void) | undefined;
  #wake: (() => void) | undefined;
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
    document.addEventListener("freeze", () => this.#freeze());
    document.addEventListener("resume", () =>
      this.#request({ ifAvailable: true }),
    );
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.#wake?.();
    });
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
    if (this.#wake) {
      this.#wake();
      return;
    }
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
        const held = new AbortController();
        this.#held = held;
        if (!(await this.#open(held.signal))) return;
        // Hold the lock until it is stolen or the page freezes.
        await new Promise<void>((resolve) => {
          this.#release = resolve;
        });
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

  async #open(held: AbortSignal): Promise<boolean> {
    let lastError: unknown;
    for (let attempt = 1; !held.aborted; attempt++) {
      try {
        const worker = await startDbWorker();
        if (held.aborted) {
          worker.terminate();
          return false;
        }
        this.#worker = worker;
        this.#set({ status: "ready", client: worker.client });
        return true;
      } catch (error) {
        lastError = error;
        if (error instanceof Error && error.name === "SchemaTooNewError") break;
        if (attempt < OPEN_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        if (
          !(error instanceof Error) ||
          error.name !== "NoModificationAllowedError"
        )
          break;
        // A frozen tab can't see that its lock was stolen, so its worker
        // keeps the files until it runs again. Keep the lock meanwhile, so
        // that tab doesn't take the database back when it wakes.
        this.#set({ status: "blocked" });
        await this.#nextChance();
      }
    }
    if (!held.aborted) this.#set({ status: "error", error: lastError });
    return false;
  }

  #nextChance(): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.#wake = undefined;
        resolve();
      };
      const timer = setTimeout(done, BLOCKED_RETRY_MS);
      this.#wake = done;
    });
  }

  /** Another tab stole the lock: release the database and wait. */
  #lost() {
    this.#close();
    this.#set({ status: "elsewhere" });
    this.#waitForRelease();
  }

  /**
   * A frozen page runs no code, so it couldn't let go if another tab took
   * over. Let go now; `resume` opens again or waits.
   */
  #freeze() {
    this.#waiting?.abort();
    this.#waiting = undefined;
    this.#close();
    this.#release?.();
    this.#release = undefined;
    this.#set({ status: "starting" });
  }

  #close() {
    this.#held?.abort();
    this.#held = undefined;
    this.#wake?.();
    this.#worker?.terminate();
    this.#worker = undefined;
  }

  #set(state: DbState) {
    this.#state = state;
    for (const listener of this.#listeners) listener();
  }
}
