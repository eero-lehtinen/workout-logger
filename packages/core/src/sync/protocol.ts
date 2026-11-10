/** Wire types of `/api/sync/v1`. See docs/sync.md. */

/** The full state of one row after a write. */
export interface Change {
  table: string;
  id: string;
  hlc: string;
  deleted: boolean;
  /** Schema version of `data`. */
  v: number;
  /** Domain columns of the row, without id, hlc, and deleted. */
  data: Record<string, unknown>;
}

/** The server refuses a larger push body (413). */
export const MAX_PUSH_BYTES = 1024 * 1024;

export interface PushRequest {
  device_id: string;
  client_version: string;
  changes: Change[];
}

export type RejectReason =
  /** Malformed change: bad HLC, table, id, v, or data. */
  | "invalid"
  | "future_clock"
  /** Same row and HLC with different content: a node id or determinism bug. */
  | "conflict"
  | "quota"
  | "schema_outdated";

export type PushResult =
  | { status: "ok" }
  | { status: "rejected"; reason: RejectReason };

export interface PushResponse {
  /**
   * The server epoch the changes were stored under. A device that pushes
   * before it ever pulls learns the epoch here, so it can detect a later
   * restore that lost those changes.
   */
  epoch: string;
  /** One result per change, in request order. */
  results: PushResult[];
}

export interface PulledChange extends Change {
  seq: number;
}

export interface PullResponse {
  epoch: string;
  /** Ordered by `seq`. */
  changes: PulledChange[];
  /** The `seq` to pass as `after` next time. */
  cursor: number;
  more: boolean;
}

export interface SnapshotResponse {
  epoch: string;
  /** Head rows, including tombstones. */
  changes: Change[];
  /** The max `seq`, read in the same transaction as the rows. */
  cursor: number;
}
