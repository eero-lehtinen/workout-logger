import { formatHlc, type Hlc, parseHlc, receive, tick } from "../sync/hlc.ts";
import type { Trx } from "./rows.ts";

/**
 * The HLC clock inside one transaction. Its state is read at the start and
 * written back before commit, so it survives restarts and never goes
 * backwards.
 */
export class TxClock {
  #last: Hlc | null;
  #changed = false;
  readonly #node: string;
  readonly #now: () => number;

  private constructor(last: Hlc | null, node: string, now: () => number) {
    this.#last = last;
    this.#node = node;
    this.#now = now;
  }

  static async load(trx: Trx, node: string, now: () => number) {
    const row = await trx
      .selectFrom("_sync_state")
      .select("value")
      .where("key", "=", "last_hlc")
      .executeTakeFirst();
    return new TxClock(row ? parseHlc(row.value) : null, node, now);
  }

  /** An HLC for writing a row whose current version is `rowHlc`, if any. */
  stamp(rowHlc?: string): string {
    // The write guard: receiving the row's HLC yields one greater than it,
    // so a local edit always beats the version it edits.
    const next = rowHlc
      ? receive(this.#last, parseHlc(rowHlc), this.#now(), this.#node)
      : tick(this.#last, this.#now(), this.#node);
    this.#set(next);
    return formatHlc(next);
  }

  observe(remoteHlc: string) {
    this.#set(
      receive(this.#last, parseHlc(remoteHlc), this.#now(), this.#node),
    );
  }

  #set(next: Hlc) {
    this.#last = next;
    this.#changed = true;
  }

  async save(trx: Trx) {
    if (!this.#changed || !this.#last) return;
    const value = formatHlc(this.#last);
    await trx
      .insertInto("_sync_state")
      .values({ key: "last_hlc", value })
      .onConflict((oc) => oc.column("key").doUpdateSet({ value }))
      .execute();
    this.#changed = false;
  }
}
