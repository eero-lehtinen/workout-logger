import type { Kysely } from "kysely";
import { createKysely, type Driver } from "../db/driver.ts";
import { type MigrateOptions, migrate } from "../migrations/runner.ts";
import type { UntypedKysely } from "../migrations/types.ts";
import type { Database, TableName } from "../schema/tables.ts";
import { newDeviceId } from "../sync/ids.ts";
import type { Trx } from "./rows.ts";
import { undoLast } from "./undo.ts";
import { type WriteOptions, type Writer, writeTransaction } from "./write.ts";

export interface StoreOptions extends MigrateOptions {
  /** Wall clock in epoch ms. Tests inject skewed clocks. */
  now?: () => number;
}

/** Called after a commit with the tables the transaction changed. */
export type ChangeListener = (tables: ReadonlySet<TableName>) => void;

/** The local database: migrated, with the write API and change events. */
export class Store {
  /** For reads. Writes to synced tables go through `write`. */
  readonly db: Kysely<Database>;
  /** This install's HLC node id. */
  readonly deviceId: string;
  readonly now: () => number;
  readonly #listeners = new Set<ChangeListener>();

  constructor(db: Kysely<Database>, deviceId: string, now: () => number) {
    this.db = db;
    this.deviceId = deviceId;
    this.now = now;
  }

  /** Runs `fn` in a write transaction. See {@link Writer}. */
  write<T>(fn: (w: Writer) => Promise<T>, options?: WriteOptions): Promise<T> {
    return writeTransaction(this, fn, options);
  }

  /** Reverts the most recent undoable write transaction. False if there is none. */
  undo(): Promise<boolean> {
    return undoLast(this);
  }

  subscribe(listener: ChangeListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Runs `fn` in a transaction, then notifies listeners of the tables it added
   * to `touched`. For core modules; feature code uses `write`.
   */
  async transaction<T>(
    fn: (trx: Trx, touched: Set<TableName>) => Promise<T>,
  ): Promise<T> {
    const touched = new Set<TableName>();
    const result = await this.db
      .transaction()
      .execute((trx) => fn(trx, touched));
    if (touched.size > 0) this.#emit(touched);
    return result;
  }

  #emit(tables: ReadonlySet<TableName>) {
    for (const listener of this.#listeners) {
      try {
        listener(tables);
      } catch (error) {
        // The transaction has committed; a failing listener must not turn
        // that into a rejected write.
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  close(): Promise<void> {
    return this.db.destroy();
  }
}

export async function openStore(
  driver: Driver,
  options: StoreOptions = {},
): Promise<Store> {
  const db = createKysely<Database>(driver);
  await migrate(db as unknown as UntypedKysely, options);
  const deviceId = await ensureDeviceId(db);
  return new Store(db, deviceId, options.now ?? Date.now);
}

async function ensureDeviceId(db: Kysely<Database>): Promise<string> {
  await db
    .insertInto("_sync_state")
    .values({ key: "device_id", value: newDeviceId() })
    .onConflict((oc) => oc.doNothing())
    .execute();
  const row = await db
    .selectFrom("_sync_state")
    .select("value")
    .where("key", "=", "device_id")
    .executeTakeFirstOrThrow();
  return row.value;
}
