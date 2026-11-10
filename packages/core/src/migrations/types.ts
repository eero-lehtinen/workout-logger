import type { Kysely } from "kysely";

/**
 * Migrations see the schema as it was at their version, not the current
 * types, so they use an untyped Kysely.
 */
export type UntypedKysely = Kysely<Record<string, Record<string, unknown>>>;

/** Column values of a synced row, without `id`, `hlc`, and `deleted`. */
export type RowData = Record<string, unknown>;

export interface UpgradedRow {
  table: string;
  id: string;
  data: RowData;
}

/**
 * Maps one row written at `version - 1` to its rows at `version`. Pure,
 * deterministic, and total: it never throws. Usually it returns the same table
 * and id; a rename returns another table, a split several rows with
 * deterministic ids. The result rows keep the source row's HLC and deleted
 * flag.
 */
export type RowUpgrade = (row: { id: string; data: RowData }) => UpgradedRow[];

/** One domain schema step. See docs/migrations.md. */
export interface Migration {
  readonly version: number;
  /** DDL that runs before stored rows are upgraded. */
  up(db: UntypedKysely): Promise<void>;
  /** Row upgrades for synced tables, keyed by the table at `version - 1`. */
  readonly upgrade?: Readonly<Record<string, RowUpgrade>>;
  /** DDL that runs after stored rows are upgraded, e.g. dropping a renamed table. */
  cleanup?(db: UntypedKysely): Promise<void>;
}
