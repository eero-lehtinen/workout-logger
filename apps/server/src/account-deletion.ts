import type { ServerKysely } from "./db/database.ts";

/**
 * Hard-deletes an account and everything the server holds for it, in one
 * transaction (docs/accounts.md#privacy). Better Auth's `deleteUser` isn't
 * used: without a password it wants a session younger than a day, and
 * Android sessions last 60 days.
 */
export async function deleteAccount(
  db: ServerKysely,
  userId: string,
): Promise<void> {
  await db.transaction().execute((trx) => deleteAccountRows(trx, userId));
}

/**
 * `deleteAccount` within the caller's transaction. The `user` row goes last;
 * its foreign keys delete the sessions and provider accounts.
 */
export async function deleteAccountRows(
  trx: ServerKysely,
  userId: string,
): Promise<void> {
  for (const table of ["head", "user_sync", "usage", "quota"] as const) {
    await trx.deleteFrom(table).where("user_id", "=", userId).execute();
  }
  await trx.deleteFrom("user").where("id", "=", userId).execute();
}
