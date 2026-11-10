import sqlite3InitModule, { type SAHPoolUtil } from "@sqlite.org/sqlite-wasm";
import {
  type CommandArgs,
  type CommandName,
  createKysely,
  mergeSnapshot,
  openStore,
  QUERIES,
  type QueryArgs,
  type QueryName,
  readSnapshot,
  replaceWithSnapshot,
  runCommand,
  runQuery,
  type Store,
  type UntypedKysely,
  writeSnapshot,
} from "@workout-logger/core";
import { wasmDriver } from "@workout-logger/core/wasm";
import { seedCatalog } from "@workout-logger/exercises";
import * as Comlink from "comlink";

// The pool directory and the database name never change: changing either
// orphans every user's database (docs/architecture.md#vfs-configuration).
const POOL_DIRECTORY = ".opfs-sahpool";
const DB_FILE = "/workout-logger.sqlite3";
const PRE_MIGRATION_FILE = "/pre-migration.sqlite3";
const IMPORT_FILE = "/import.sqlite3";
// Main database, the pre-migration copy, an import file, and their journals.
const POOL_CAPACITY = 8;

export type ImportMode = "merge" | "replace";

let sqlite3: Awaited<ReturnType<typeof sqlite3InitModule>> | undefined;
let pool: SAHPoolUtil | undefined;
let store: Store | undefined;

function opened(): Store {
  if (!store) throw new Error("database is not open");
  return store;
}

const api = {
  /** Opens, migrates, and seeds the database. Rejects if another context holds it. */
  async open(): Promise<{ deviceId: string }> {
    sqlite3 = await sqlite3InitModule();
    pool = await sqlite3.installOpfsSAHPoolVfs({
      directory: POOL_DIRECTORY,
      // Without this, a failed init deletes the pool directory and the
      // database with it.
      preserveOnInitFailure: true,
    });
    await pool.reserveMinimumCapacity(POOL_CAPACITY);
    const vfs = pool;
    const db = new vfs.OpfsSAHPoolDb(DB_FILE);
    store = await openStore(wasmDriver(sqlite3, db), {
      beforeMigrate: async () => {
        await vfs.importDb(PRE_MIGRATION_FILE, vfs.exportFile(DB_FILE));
      },
    });
    await seedCatalog(store);
    return { deviceId: store.deviceId };
  },

  /** Calls `listener` with the queries to refetch after each commit. */
  subscribe(listener: (queries: QueryName[]) => void) {
    opened().subscribe((tables) => {
      const affected = (Object.keys(QUERIES) as QueryName[]).filter((name) =>
        QUERIES[name].tables.some((t) => tables.has(t)),
      );
      if (affected.length > 0) listener(affected);
    });
  },

  query<N extends QueryName>(name: N, args: QueryArgs<N>) {
    return runQuery(opened(), name, args);
  },

  command<N extends CommandName>(name: N, args: CommandArgs<N>) {
    return runCommand(opened(), name, args);
  },

  undo(tx?: number) {
    return opened().undo(tx);
  },

  async exportSnapshot(): Promise<Uint8Array> {
    if (!sqlite3) throw new Error("database is not open");
    const memory = new sqlite3.oo1.DB(":memory:");
    const target = createKysely<never>(
      wasmDriver(sqlite3, memory),
    ) as unknown as UntypedKysely;
    try {
      await writeSnapshot(opened(), target);
      const bytes = sqlite3.capi.sqlite3_js_db_export(memory);
      return Comlink.transfer(bytes, [bytes.buffer]);
    } finally {
      await target.destroy();
    }
  },

  async importSnapshot(bytes: Uint8Array, mode: ImportMode) {
    if (!sqlite3 || !pool) throw new Error("database is not open");
    await pool.importDb(IMPORT_FILE, bytes);
    const file = new pool.OpfsSAHPoolDb(IMPORT_FILE);
    const source = createKysely<never>(
      wasmDriver(sqlite3, file),
    ) as unknown as UntypedKysely;
    try {
      const { meta, rows } = await readSnapshot(source);
      const result =
        mode === "merge"
          ? await mergeSnapshot(opened(), rows)
          : await replaceWithSnapshot(opened(), rows);
      return { ...result, createdAt: meta.createdAt };
    } finally {
      await source.destroy();
      pool.unlink(IMPORT_FILE);
    }
  },
};

export type DbApi = typeof api;

Comlink.expose(api);
