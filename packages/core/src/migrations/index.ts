import { SCHEMA_VERSION } from "../schema/tables.ts";
import type { Migration } from "./types.ts";
import { v1 } from "./v1.ts";
import { v2 } from "./v2.ts";

/** Every domain schema step, in order. The last version is SCHEMA_VERSION. */
export const MIGRATIONS: readonly Migration[] = [v1, v2];

if (MIGRATIONS.at(-1)?.version !== SCHEMA_VERSION) {
  throw new Error("SCHEMA_VERSION must equal the last migration's version");
}
