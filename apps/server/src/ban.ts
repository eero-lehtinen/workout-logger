import { deleteAccountRows } from "./account-deletion.ts";
import type { ServerKysely } from "./db/database.ts";

// Bans (docs/accounts.md#bans): a banned account is deleted, and sign-up
// refuses its email and its provider accounts from then on.

export const emailBanKey = (email: string) => `email:${email.toLowerCase()}`;

export const accountBanKey = (providerId: string, accountId: string) =>
  `account:${providerId}:${accountId}`;

export interface Ban {
  /** The deleted account's id. */
  userId: string;
  name: string;
  email: string;
  createdAt: number;
}

/**
 * Records the account's email and provider accounts as banned and deletes
 * the account, in one transaction.
 */
export async function banAccount(
  db: ServerKysely,
  userId: string,
  now: number,
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const user = await trx
      .selectFrom("user")
      .select(["name", "email"])
      .where("id", "=", userId)
      .executeTakeFirst();
    if (!user) return;
    const accounts = await trx
      .selectFrom("account")
      .select(["providerId", "accountId"])
      .where("userId", "=", userId)
      .execute();
    const keys = new Set([
      emailBanKey(user.email),
      ...accounts.map((a) => accountBanKey(a.providerId, a.accountId)),
    ]);
    await trx
      .insertInto("ban")
      .values({
        user_id: userId,
        name: user.name,
        email: user.email,
        created_at: now,
      })
      .execute();
    await trx
      .insertInto("ban_key")
      .values([...keys].map((key) => ({ user_id: userId, key })))
      .execute();
    await deleteAccountRows(trx, userId);
  });
}

/** False when there is no such ban. */
export async function unban(db: ServerKysely, userId: string) {
  return db.transaction().execute(async (trx) => {
    await trx.deleteFrom("ban_key").where("user_id", "=", userId).execute();
    const { numDeletedRows } = await trx
      .deleteFrom("ban")
      .where("user_id", "=", userId)
      .executeTakeFirst();
    return numDeletedRows > 0n;
  });
}

export async function listBans(db: ServerKysely): Promise<Ban[]> {
  const rows = await db
    .selectFrom("ban")
    .selectAll()
    .orderBy("created_at")
    .execute();
  return rows.map((row) => ({
    userId: row.user_id,
    name: row.name,
    email: row.email,
    createdAt: row.created_at,
  }));
}

export async function banKeys(db: ServerKysely): Promise<Set<string>> {
  const rows = await db.selectFrom("ban_key").select("key").execute();
  return new Set(rows.map((row) => row.key));
}
