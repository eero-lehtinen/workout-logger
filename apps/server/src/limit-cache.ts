import type { ServerKysely } from "./db/database.ts";
import { DEFAULT_QUOTA } from "./quota.ts";

/** The account cap while `limits.max_accounts` is NULL. */
export const DEFAULT_MAX_ACCOUNTS = 100;

/**
 * The limits read on every request or sign-up, copied into memory: each
 * user's request limit override and the account cap. Whatever writes them
 * calls `refresh` (docs/accounts.md, server tables). There is one server
 * instance, so one copy.
 */
export class LimitCache {
  readonly #db: ServerKysely;
  #requestsPerMinute = new Map<string, number>();
  #maxAccounts: number | null = null;

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
    const limits = await this.#db
      .selectFrom("limits")
      .select("max_accounts")
      .where("id", "=", 1)
      .executeTakeFirst();
    this.#maxAccounts = limits?.max_accounts ?? null;
  }

  /** The owner's cap, or null for the default. */
  get maxAccountsSetting(): number | null {
    return this.#maxAccounts;
  }

  maxAccounts(): number {
    return this.#maxAccounts ?? DEFAULT_MAX_ACCOUNTS;
  }

  /** The user's override, or the default. */
  requestsPerMinute(userId: string): number {
    return (
      this.#requestsPerMinute.get(userId) ?? DEFAULT_QUOTA.requestsPerMinute
    );
  }
}
