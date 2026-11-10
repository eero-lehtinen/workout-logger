export {
  generateKeyBetween as positionBetween,
  generateNKeysBetween as positionsBetween,
} from "fractional-indexing";

export interface Ordered {
  position: string;
  id: string;
}

/**
 * The order of every ordered list, matching `ORDER BY position, id`.
 * Concurrent inserts can produce equal positions; the id breaks the tie.
 * Plain code-unit comparison, as SQLite's default collation does.
 */
export function compareOrder(a: Ordered, b: Ordered): number {
  return compare(a.position, b.position) || compare(a.id, b.id);
}

function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}
