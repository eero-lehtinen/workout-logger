import type { StoredObject } from "./r2.ts";

export interface StorageGroup {
  /** The key's first path segment: `daily`, `monthly`, `pre-migration`. */
  prefix: string;
  bytes: number;
  objects: number;
}

/** What the DB copies take in the backup bucket (docs/backups.md#visibility). */
export interface BackupStorage {
  bytes: number;
  objects: number;
  groups: StorageGroup[];
}

export function summarizeStorage(objects: StoredObject[]): BackupStorage {
  const groups = new Map<string, StorageGroup>();
  let bytes = 0;
  for (const object of objects) {
    const slash = object.key.indexOf("/");
    const prefix = slash === -1 ? "" : object.key.slice(0, slash);
    const group = groups.get(prefix) ?? { prefix, bytes: 0, objects: 0 };
    group.bytes += object.size;
    group.objects += 1;
    groups.set(prefix, group);
    bytes += object.size;
  }
  return {
    bytes,
    objects: objects.length,
    groups: [...groups.values()].sort((a, b) =>
      a.prefix.localeCompare(b.prefix),
    ),
  };
}
