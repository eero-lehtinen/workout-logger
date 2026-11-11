import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { listClass, rowClass } from "../../components/list.ts";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { useAccount } from "../../lib/account.ts";
import { type AdminUser, fetchUsers } from "../../lib/admin-api.ts";
import { formatAgo, formatBytes } from "../../lib/format.ts";
import {
  DATABASE_WARNING_BYTES,
  useOwnerStatus,
} from "../../lib/server-status.ts";
import { useNow } from "../../lib/use-now.ts";
import { AccountCap } from "./account-cap.tsx";
import { UserSheet } from "./user-sheet.tsx";

export const ADMIN_USERS_KEY = ["admin", "users"];

/** The owner's list of accounts with their usage (docs/accounts.md#admin-page). */
export function AdminPage() {
  const account = useAccount();
  const isOwner =
    account.status === "signed-in" && account.user.role === "owner";
  const users = useQuery({
    queryKey: ADMIN_USERS_KEY,
    queryFn: fetchUsers,
    enabled: isOwner,
    staleTime: 0,
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const status = useOwnerStatus();
  const now = useNow(60_000);
  const open = users.data?.users.find((user) => user.id === openId) ?? null;

  return (
    <Screen
      header={
        <PageHeader
          title="Users"
          subtitle={
            status
              ? `Server database ${formatBytes(status.databaseBytes)}`
              : undefined
          }
          back={{ to: "/settings", label: "Settings" }}
        />
      }
      scrollId="admin"
      width="narrow"
    >
      {!isOwner ? (
        <Empty>Only the owner can see this page.</Empty>
      ) : users.isError ? (
        <Empty>Couldn't load the users: {users.error.message}</Empty>
      ) : !users.data ? (
        <Empty>Loading…</Empty>
      ) : (
        <>
          {status && status.databaseBytes > DATABASE_WARNING_BYTES && (
            <p className="mx-4 mb-2 rounded-xl bg-raised px-4 py-3 text-sm lg:mx-0">
              The server database is over 700 MB, about 4 GB of backups in R2.
              Lower quotas or the account cap, or remove accounts.
            </p>
          )}
          <AccountCap
            accounts={users.data.users.length}
            maxAccounts={users.data.maxAccounts}
            defaultMaxAccounts={users.data.defaultMaxAccounts}
          />
          <h2 className="px-4 pt-5 pb-1 text-lg font-semibold lg:px-0">
            Accounts
          </h2>
          <ul className={listClass}>
            {users.data.users.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  disabled={user.role === "owner"}
                  onClick={() => setOpenId(user.id)}
                  className={clsx(
                    rowClass,
                    "flex w-full flex-col items-start py-3 text-left",
                  )}
                >
                  <span className="font-medium">
                    {user.name}
                    {user.role === "owner" && (
                      <span className="text-ink-muted"> · owner</span>
                    )}
                    {user.disabled && (
                      <span className="text-danger"> · disabled</span>
                    )}
                  </span>
                  <span className="text-sm text-ink-muted">{user.email}</span>
                  <span className="text-sm text-ink-muted">
                    {usageLine(user, users.data.defaults, now)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {open && users.data && (
        <UserSheet
          user={open}
          defaults={users.data.defaults}
          onClose={() => setOpenId(null)}
        />
      )}
    </Screen>
  );
}

function usageLine(
  user: AdminUser,
  defaults: { bytesPerDay: number; maxBytes: number },
  now: number,
): string {
  const owner = user.role === "owner";
  const max = owner ? null : (user.overrides.maxBytes ?? defaults.maxBytes);
  const perDay =
    owner || user.exemptUntil !== null
      ? null
      : (user.overrides.bytesPerDay ?? defaults.bytesPerDay);
  const of = (used: number, limit: number | null) =>
    limit === null
      ? formatBytes(used)
      : `${formatBytes(used)} of ${formatBytes(limit)}`;
  const synced =
    user.lastSyncAt === null
      ? "never synced"
      : `synced ${formatAgo(user.lastSyncAt, now)}`;
  return `${of(user.storedBytes, max)} stored · ${of(user.bytesWrittenToday, perDay)} today · ${synced}`;
}
