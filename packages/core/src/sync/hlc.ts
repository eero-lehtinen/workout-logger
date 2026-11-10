/**
 * Hybrid logical clock. The rules are exact; see docs/sync.md#hlc. The string
 * form `<wall ms, 15 digits>-<counter, 5 digits>-<node>` sorts as text in HLC
 * order.
 */
export interface Hlc {
  wall: number;
  counter: number;
  node: string;
}

export const MAX_COUNTER = 99_999;

/** The server rejects a pushed change whose wall is further ahead of its clock. */
export const FUTURE_CLOCK_LIMIT_MS = 60 * 60 * 1000;

/** The server's check for every pushed HLC. */
export const HLC_PATTERN = /^\d{15}-\d{5}-[0-9a-z]{1,16}$/;

/** Fixed node ids for deterministic writes. Device ids never take these forms. */
export const PSEUDO_NODES = {
  seed: "seed",
  healthConnect: "hc",
  fitnotes: "fitnotes",
  restore: "restore",
  fix: "fix",
} as const;

export type PseudoNode = (typeof PSEUDO_NODES)[keyof typeof PSEUDO_NODES];

export function isValidHlc(value: string): boolean {
  return HLC_PATTERN.test(value);
}

export function formatHlc({ wall, counter, node }: Hlc): string {
  return `${String(wall).padStart(15, "0")}-${String(counter).padStart(5, "0")}-${node}`;
}

export function parseHlc(value: string): Hlc {
  if (!isValidHlc(value)) throw new Error(`invalid HLC: ${value}`);
  return {
    wall: Number(value.slice(0, 15)),
    counter: Number(value.slice(16, 21)),
    node: value.slice(22),
  };
}

/** The next HLC for a local write. */
export function tick(last: Hlc | null, now: number, node: string): Hlc {
  if (!last || now > last.wall) return { wall: now, counter: 0, node };
  return normalize(last.wall, last.counter + 1, node);
}

/** The next HLC after observing `remote`. Always greater than both inputs. */
export function receive(
  last: Hlc | null,
  remote: Hlc,
  now: number,
  node: string,
): Hlc {
  const lastWall = last?.wall ?? Number.NEGATIVE_INFINITY;
  const wall = Math.max(lastWall, remote.wall, now);
  let counter: number;
  if (last && wall === lastWall && wall === remote.wall) {
    counter = Math.max(last.counter, remote.counter) + 1;
  } else if (last && wall === lastWall) {
    counter = last.counter + 1;
  } else if (wall === remote.wall) {
    counter = remote.counter + 1;
  } else {
    counter = 0;
  }
  return normalize(wall, counter, node);
}

function normalize(wall: number, counter: number, node: string): Hlc {
  return counter > MAX_COUNTER
    ? { wall: wall + 1, counter: 0, node }
    : { wall, counter, node };
}

/** A deterministic HLC: the same source always yields the same value. */
export function deterministicHlc(
  wall: number,
  node: PseudoNode,
  counter = 0,
): string {
  return formatHlc({ wall, counter, node });
}
