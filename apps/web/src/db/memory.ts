import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  adoptAccount,
  type CommandArgs,
  type CommandName,
  createKysely,
  matchAccount,
  openStore,
  queriesAffectedBy,
  repairClock,
  runCommand,
  runQuery,
  type Store,
  syncOverHttp,
  type UntypedKysely,
  writeSnapshot,
} from "@workout-logger/core";
import { wasmDriver } from "@workout-logger/core/wasm";
import { seedCatalog } from "@workout-logger/exercises";
import type { DbClient } from "./client.ts";

let sqlite: ReturnType<typeof sqlite3InitModule> | undefined;

export interface MemoryDb {
  client: DbClient;
  store: Store;
  /** Runs a command as if it happened at `at` (epoch ms), e.g. a past session. */
  run<N extends CommandName>(
    name: N,
    args: CommandArgs<N>,
    at?: number,
  ): ReturnType<typeof runCommand<N>>;
}

/**
 * The real store on an in-memory database in this thread, seeded with the
 * catalog. For stories and browser tests: no worker, no OPFS, no lock.
 */
export async function openMemoryDb(): Promise<MemoryDb> {
  sqlite ??= sqlite3InitModule();
  const sqlite3 = await sqlite;
  let fixedNow: number | undefined;
  const store = await openStore(
    wasmDriver(sqlite3, new sqlite3.oo1.DB(":memory:")),
    { now: () => fixedNow ?? Date.now() },
  );
  await seedCatalog(store);

  const client: DbClient = {
    query: (name, args) => runQuery(store, name, args),
    command: (name, args) => runCommand(store, name, args),
    undo: (tx) => store.undo(tx),
    async exportSnapshot() {
      const target = new sqlite3.oo1.DB(":memory:");
      const db = createKysely(
        wasmDriver(sqlite3, target),
      ) as unknown as UntypedKysely;
      await writeSnapshot(store, db);
      const bytes = sqlite3.capi.sqlite3_js_db_export(target);
      await db.destroy();
      return bytes;
    },
    importSnapshot() {
      return Promise.reject(new Error("not supported in memory"));
    },
    async onChange(listener) {
      store.subscribe((tables) => {
        const affected = queriesAffectedBy(tables);
        if (affected.length > 0) listener(affected);
      });
    },
    sync: (config) => syncOverHttp(store, config),
    matchAccount: (userId) => matchAccount(store, userId),
    async adoptAccount(userId, mode) {
      await adoptAccount(store, userId, mode);
      if (mode === "discard") await seedCatalog(store);
    },
    repairClock: () => repairClock(store),
  };

  return {
    client,
    store,
    async run(name, args, at) {
      fixedNow = at;
      try {
        return await runCommand(store, name, args);
      } finally {
        fixedNow = undefined;
      }
    },
  };
}
