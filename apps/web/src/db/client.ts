import type {
  AccountMatch,
  CommandArgs,
  CommandName,
  CommandResult,
  HttpSyncConfig,
  QueryArgs,
  QueryName,
  QueryResult,
  SyncOutcome,
  WriteResult,
} from "@workout-logger/core";
import * as Comlink from "comlink";
import type { AccountMode, DbApi, ImportMode } from "./db.worker.ts";

/** The database as the UI sees it. Every call runs in the DB worker. */
export interface DbClient {
  query<N extends QueryName>(
    name: N,
    args: QueryArgs<N>,
  ): Promise<QueryResult<N>>;
  command<N extends CommandName>(
    name: N,
    args: CommandArgs<N>,
  ): Promise<WriteResult<CommandResult<N>>>;
  undo(tx?: number): Promise<boolean>;
  exportSnapshot(): Promise<Uint8Array>;
  importSnapshot(
    bytes: Uint8Array,
    mode: ImportMode,
  ): Promise<{
    written: number;
    deleted: number;
    undoTx: number | null;
    createdAt: number;
  }>;
  onChange(listener: (queries: QueryName[]) => void): Promise<void>;
  sync(config: HttpSyncConfig): Promise<SyncOutcome>;
  matchAccount(userId: string): Promise<AccountMatch>;
  /** See doptAccount in core; discard also re-seeds the catalog. */
  adoptAccount(userId: string, mode: AccountMode): Promise<void>;
  repairClock(): Promise<number>;
}

export interface DbWorker {
  client: DbClient;
  terminate(): void;
}

/** Starts a worker and opens the database in it. A failed open terminates it. */
export async function startDbWorker(): Promise<DbWorker> {
  const worker = new Worker(new URL("./db.worker.ts", import.meta.url), {
    type: "module",
  });
  const remote = Comlink.wrap<DbApi>(worker);
  try {
    await remote.open();
  } catch (error) {
    worker.terminate();
    throw error;
  }
  const client: DbClient = {
    query: (name, args) => remote.query(name, args) as never,
    command: (name, args) => remote.command(name, args) as never,
    undo: (tx) => remote.undo(tx),
    exportSnapshot: () => remote.exportSnapshot(),
    importSnapshot: (bytes, mode) =>
      remote.importSnapshot(Comlink.transfer(bytes, [bytes.buffer]), mode),
    onChange: (listener) => remote.subscribe(Comlink.proxy(listener)),
    sync: (config) => remote.sync(config),
    matchAccount: (userId) => remote.matchAccount(userId),
    adoptAccount: (userId, mode) => remote.adoptAccount(userId, mode),
    repairClock: () => remote.repairClock(),
  };
  return { client, terminate: () => worker.terminate() };
}
