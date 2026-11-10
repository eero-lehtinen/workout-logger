import { Kysely, SqliteDialect } from "kysely";

/**
 * A synchronous SQLite connection.
 *
 * The shape is the subset of better-sqlite3 that Kysely's SQLite dialect uses,
 * so the stock dialect runs on every implementation. A statement is prepared,
 * then exactly one of `all`, `run`, or `iterate` is called on it once.
 */
export interface Driver {
  prepare(sql: string): Statement;
  close(): void;
}

export interface Statement {
  /** True if the statement returns result columns. */
  readonly reader: boolean;
  all(params: readonly unknown[]): unknown[];
  run(params: readonly unknown[]): {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  };
  iterate(params: readonly unknown[]): IterableIterator<unknown>;
}

export function createKysely<DB>(driver: Driver): Kysely<DB> {
  return new Kysely<DB>({ dialect: new SqliteDialect({ database: driver }) });
}
