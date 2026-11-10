import { v5, v7 } from "uuid";

/** Id for a new entity. */
export function newId(): string {
  return v7();
}

/**
 * UUIDv5 namespaces for deterministic ids. Never change these: every existing
 * seeded or imported row's id derives from them.
 */
export const ID_NAMESPACES = {
  builtin: "bf857f72-f41f-4acb-82a9-4f60b0a9f2f1",
  fitnotes: "dede2391-d841-42cc-9cf5-e0cbb99672ba",
  healthConnect: "a31fdda9-a671-455f-9390-0a6dc82d064e",
} as const;

export type IdNamespace = keyof typeof ID_NAMESPACES;

/** Same namespace and key, same id, on every device. */
export function deterministicId(namespace: IdNamespace, key: string): string {
  return v5(key, ID_NAMESPACES[namespace]);
}

/**
 * A random HLC node id for this install: 12 hex characters, so it can't equal
 * a pseudo-node name.
 */
export function newDeviceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
