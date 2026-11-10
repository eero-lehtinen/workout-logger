import type { Kysely } from "kysely";
import type { Database, SyncedTableName } from "../schema/tables.ts";

/**
 * A read query for the UI. `tables` lists every table it reads: the UI
 * refetches it after a commit that touched any of them.
 */
export interface QueryDef<Args, Result> {
  tables: readonly SyncedTableName[];
  run: (db: Kysely<Database>, args: Args) => Promise<Result>;
}

export function defineQuery<Args, Result>(
  tables: readonly SyncedTableName[],
  run: (db: Kysely<Database>, args: Args) => Promise<Result>,
): QueryDef<Args, Result> {
  return { tables, run };
}
