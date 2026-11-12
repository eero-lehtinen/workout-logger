import { App } from "@capacitor/app";
import type { HeldReason, SyncFailure, SyncReport } from "@workout-logger/core";
import { useSyncExternalStore } from "react";
import { toasts } from "../components/toasts.tsx";
import type { DbClient } from "../db/client.ts";
import type { AccountMode } from "../db/db.worker.ts";
import { i18n } from "../i18n/index.ts";
import {
  getAccount,
  refreshAccount,
  sessionEnded,
  signOut,
  subscribeAccount,
} from "./account.ts";
import { readToken } from "./auth-token.ts";
import { saveSnapshot } from "./device-snapshots.ts";
import { isNative } from "./platform.ts";
import { SERVER_URL } from "./server.ts";

export interface SyncState {
  running: boolean;
  /** Why the last run stopped early, if it did. */
  failure: SyncFailure | null;
  /** Changes the server refused in the last run, by reason. */
  rejected: Partial<Record<HeldReason, number>>;
  /** The server has data from a newer app, or refuses this one. */
  updateRequired: boolean;
  /**
   * The signed-in account isn't the one this device's data belongs to. Sync
   * waits until the user chooses to merge or discard.
   */
  accountChoice: string | null;
}

// docs/sync.md#when-it-runs
const AFTER_WRITE_MS = 3000;
const INTERVAL_MS = 60_000;

const idle: SyncState = {
  running: false,
  failure: null,
  rejected: {},
  updateRequired: false,
  accountChoice: null,
};

let state: SyncState = idle;
const listeners = new Set<() => void>();

function update(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribe, () => state);
}

/** For stories. */
export function setSyncStateForStory(next: Partial<SyncState>) {
  state = { ...idle, ...next };
  for (const listener of listeners) listener();
}

let db: DbClient | null = null;
let soon: ReturnType<typeof setTimeout> | undefined;
let queued = false;
// The run in progress. A worker terminated mid-run (another tab took the
// database, or the page froze) never settles its call, so stopping drops the
// run instead of waiting for it.
let currentRun: symbol | null = null;

/**
 * Starts syncing `client` while the user is signed in: now, on resume, 3 s
 * after a local write, every minute while the page is visible, and on "sync
 * now". Returns a stop function, for when the database closes (e.g. another
 * tab takes it).
 */
export function startSync(client: DbClient): () => void {
  db = client;
  let active = true;
  void client.onChange((queries) => {
    // `syncStatus` reads the outbox, so a write queued something.
    if (active && !state.running && queries.includes("syncStatus")) {
      syncSoon();
    }
  });
  // A hidden page syncs when it becomes visible again, so polling it only
  // spends requests, e.g. for a forgotten tab.
  const interval = setInterval(() => {
    if (document.visibilityState === "visible") void syncNow();
  }, INTERVAL_MS);
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncNow();
  };
  const onOnline = () => void syncNow();
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  const resume = isNative
    ? App.addListener("resume", () => void syncNow())
    : null;
  const unsubscribe = subscribeAccount(() => {
    if (getAccount().status === "signed-in") void syncNow();
  });
  void syncNow();
  return () => {
    active = false;
    if (db === client) {
      db = null;
      currentRun = null;
      queued = false;
      update({ running: false });
    }
    clearInterval(interval);
    clearTimeout(soon);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
    void resume?.then((handle) => handle.remove());
    unsubscribe();
  };
}

function syncSoon() {
  clearTimeout(soon);
  soon = setTimeout(() => void syncNow(), AFTER_WRITE_MS);
}

/** Runs a sync unless one is running; then one more follows it. */
export async function syncNow(): Promise<void> {
  if (state.running) {
    queued = true;
    return;
  }
  const client = db;
  const account = getAccount();
  if (!client || account.status !== "signed-in") return;
  clearTimeout(soon);
  const run = Symbol();
  currentRun = run;
  update({ running: true });
  try {
    const match = await client.matchAccount(account.user.id);
    if (match === "other") {
      update({ accountChoice: account.user.id });
      return;
    }
    if (match === "first") {
      // A cached account may be stale; binding the data to it would later
      // ask the user to merge or discard their own data. Confirming it
      // notifies the account listener, which runs sync again.
      if (account.offline) return;
      await client.adoptAccount(account.user.id, "keep");
    }
    const token = await readToken();
    const outcome = await client.sync({
      baseUrl: SERVER_URL,
      token,
      clientVersion: isNative ? (await App.getInfo()).version : null,
      userId: account.user.id,
    });
    if (currentRun !== run) return;
    if (outcome.ok) {
      finished(outcome.report);
      if (await leftUnsent(client, outcome.report)) queued = true;
    } else if (outcome.failure === "interrupted") {
      queued = true;
    } else {
      update({
        failure: outcome.failure,
        updateRequired: outcome.failure === "update_required",
      });
      // Unless a new sign-in stored another token during the run.
      if (outcome.failure === "unauthorized" && (await readToken()) === token) {
        await sessionEnded();
      }
      // Signed in as someone else elsewhere: the next run asks what to do.
      if (outcome.failure === "account_changed") void refreshAccount();
    }
  } catch {
    if (currentRun === run) update({ failure: "server" });
  } finally {
    if (currentRun === run) {
      currentRun = null;
      update({ running: false });
      if (queued) {
        queued = false;
        syncSoon();
      }
    }
  }
}

/**
 * Whether the outbox holds more than the run left behind as refused: writes
 * made during the run, which the after-write trigger skips because sync's
 * own writes look the same, or rows edited while their push was in flight.
 * A quota stop leaves entries it never tried; they wait for the next poll.
 */
async function leftUnsent(
  client: DbClient,
  report: SyncReport,
): Promise<boolean> {
  if (report.status !== "ok" || report.rejected.quota) return false;
  const held = Object.values(report.rejected).reduce(
    (sum, n) => sum + (n ?? 0),
    0,
  );
  const { unsynced } = await client.query("syncStatus", undefined);
  return unsynced > held;
}

function finished(report: SyncReport) {
  update({
    failure: null,
    rejected: report.rejected,
    updateRequired: report.status === "update_required",
    accountChoice: null,
  });
}

/**
 * Settles `accountChoice`: merge this device's data into the signed-in
 * account, discard it for that account's data, or sign out instead.
 */
export async function chooseAccount(
  choice: Exclude<AccountMode, "keep"> | "sign-out",
): Promise<void> {
  const userId = state.accountChoice;
  if (!userId) return;
  update({ accountChoice: null });
  if (choice === "sign-out") {
    await signOut();
    return;
  }
  const account = getAccount();
  // The account changed again while the question was open: ask afresh.
  if (account.status !== "signed-in" || account.user.id !== userId || !db) {
    void syncNow();
    return;
  }
  if (choice === "discard" && !(await saveBeforeDiscard(db))) {
    update({ accountChoice: userId });
    return;
  }
  await db.adoptAccount(userId, choice);
  await syncNow();
}

/**
 * Discard is the one hard delete of synced rows on a device, so it first
 * saves a snapshot the user can import back. No snapshot, no discard.
 */
async function saveBeforeDiscard(client: DbClient): Promise<boolean> {
  try {
    const where = await saveSnapshot(await client.exportSnapshot());
    toasts.add({
      title: i18n.t("ui.sync.savedFirstTitle"),
      description: where,
    });
    return true;
  } catch (error) {
    toasts.add({
      title: i18n.t("ui.sync.notDiscardedTitle"),
      description: i18n.t("ui.sync.snapshotFailed", {
        reason: error instanceof Error ? error.message : String(error),
      }),
      type: "error",
    });
    return false;
  }
}

/** After "repair clock": re-stamps the refused changes and pushes them. */
export async function repairClock(): Promise<void> {
  if (!db) return;
  await db.repairClock();
  update({ rejected: {} });
  await syncNow();
}
