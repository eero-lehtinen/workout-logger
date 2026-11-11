import type { ServerKysely } from "./db/database.ts";
import { DEFAULT_QUOTA } from "./quota.ts";

/**
 * The limits read on every request, copied into memory: each user's request
 * limit override. Whatever writes them calls `refresh` (docs/accounts.md,
 * server tables). There is one server instance, so one copy.
 */
export class LimitCache {
  readonly #db: ServerKysely;
  #requestsPerMinute = new Map<string, number>();

  private constructor(db: ServerKysely) {
    this.#db = db;
  }

  static async load(db: ServerKysely): Promise<LimitCache> {
    const cache = new LimitCache(db);
    await cache.refresh();
    return cache;
  }

  async refresh(): Promise<void> {
    const overrides = await this.#db
      .selectFrom("quota")
      .select(["user_id", "requests_per_minute"])
      .where("requests_per_minute", "is not", null)
      .execute();
    this.#requestsPerMinute = new Map(
      overrides.map((row) => [row.user_id, row.requests_per_minute ?? 0]),
    );
  }

  /** The user's override, or the default. */
  requestsPerMinute(userId: string): number {
    return (
      this.#requestsPerMinute.get(userId) ?? DEFAULT_QUOTA.requestsPerMinute
    );
  }
}
