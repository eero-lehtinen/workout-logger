import { sql } from "kysely";
import type { ServerKysely } from "./db/database.ts";

/**
 * Everything the server holds about one person, for an access request the
 * app's own export can't answer (docs/privacy.md#requests). Session tokens
 * and the provider's OAuth tokens are credentials: the file would let its
 * reader sign in as the person, so they are left out and named in `omitted`.
 */
export async function exportAccount(db: ServerKysely, who: string) {
  const email = who.toLowerCase();
  const { rows: users } = await sql<Record<string, unknown>>`
    SELECT id, name, email, emailVerified, image, role, disabled, createdAt, updatedAt
    FROM user WHERE id = ${who} OR email = ${email}`.execute(db);
  const user = users[0] ?? null;
  // Without an account, a ban's record of a deleted one. Never both by
  // email: `set-email` can give an account the email of someone else's ban.
  const bans = await db
    .selectFrom("ban")
    .selectAll()
    .where((eb) =>
      user
        ? eb("user_id", "=", user.id as string)
        : eb.or([eb("user_id", "=", who), eb("email", "=", email)]),
    )
    .execute();
  if (bans.length > 1) {
    throw new Error(
      `several bans match ${who}: use an id (${bans.map((b) => b.user_id).join(", ")})`,
    );
  }
  const ban = bans[0];
  const userId = (user?.id as string | undefined) ?? ban?.user_id;
  if (!userId) throw new Error(`no account or ban for ${who}`);

  const { rows: providerAccounts } = await sql<Record<string, unknown>>`
    SELECT providerId, accountId, scope, accessTokenExpiresAt,
      refreshTokenExpiresAt, createdAt, updatedAt
    FROM account WHERE userId = ${userId}`.execute(db);
  const { rows: sessions } = await sql<Record<string, unknown>>`
    SELECT ipAddress, userAgent, createdAt, updatedAt, expiresAt
    FROM session WHERE userId = ${userId}`.execute(db);
  const byUser = (table: "usage" | "quota" | "user_sync" | "ban_key") =>
    sql<Record<string, unknown>>`
      SELECT * FROM ${sql.table(table)} WHERE user_id = ${userId}`
      .execute(db)
      .then((result) => result.rows);
  const head = await db
    .selectFrom("head")
    .select([
      "table_name",
      "id",
      "hlc",
      "deleted",
      "v",
      "data",
      "device_id",
      "received_at",
    ])
    .where("user_id", "=", userId)
    .orderBy("table_name")
    .orderBy("id")
    .execute();

  return {
    exportedAt: new Date().toISOString(),
    omitted: [
      "session.token",
      "account.accessToken",
      "account.refreshToken",
      "account.idToken",
    ],
    user,
    providerAccounts,
    sessions,
    usage: await byUser("usage"),
    quota: await byUser("quota"),
    sync: await byUser("user_sync"),
    ban: ban ?? null,
    banKeys: await byUser("ban_key"),
    rows: head.map((row) => ({ ...row, data: JSON.parse(row.data) })),
  };
}
