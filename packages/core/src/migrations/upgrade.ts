import { MIGRATIONS } from "./index.ts";
import type { Migration, UpgradedRow } from "./types.ts";

/**
 * Passes a row written at `fromVersion` through every later step. Used for
 * incoming sync rows, snapshot imports, and restores; client migrations apply
 * the same functions to stored rows.
 */
export function upgradeRow(
  row: UpgradedRow,
  fromVersion: number,
  migrations: readonly Migration[] = MIGRATIONS,
): UpgradedRow[] {
  let rows = [row];
  for (const migration of migrations) {
    const upgrades = migration.upgrade;
    if (migration.version <= fromVersion || !upgrades) continue;
    rows = rows.flatMap((r) => {
      const upgrade = upgrades[r.table];
      return upgrade ? upgrade({ id: r.id, data: r.data }) : [r];
    });
  }
  return rows;
}

export function latestVersion(migrations: readonly Migration[]): number {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(`migration ${i} has version ${m.version}, want ${i + 1}`);
    }
  });
  return migrations.length;
}
