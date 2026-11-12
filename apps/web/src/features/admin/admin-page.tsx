import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SectionHeading } from "../../components/headings.tsx";
import { listClass, rowClass } from "../../components/list.ts";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { i18n } from "../../i18n/index.ts";
import { useAccount } from "../../lib/account.ts";
import {
  type AdminUser,
  fetchBackupStorage,
  fetchUsers,
} from "../../lib/admin-api.ts";
import { formatAgo, formatBytes } from "../../lib/format.ts";
import { matchesSearch } from "../../lib/search.ts";
import { refreshOwnerStatus, useOwnerStatus } from "../../lib/server-status.ts";
import { useNow } from "../../lib/use-now.ts";
import { AccountCap } from "./account-cap.tsx";
import { ServerSection } from "./server-section.tsx";
import { UserSheet } from "./user-sheet.tsx";

export const ADMIN_USERS_KEY = ["admin", "users"];

/**
 * The owner's view of the server and of every account
 * (docs/accounts.md#admin-page).
 */
export function AdminPage() {
  const { t } = useTranslation();
  const account = useAccount();
  const isOwner =
    account.status === "signed-in" && account.user.role === "owner";
  const users = useQuery({
    queryKey: ADMIN_USERS_KEY,
    queryFn: fetchUsers,
    enabled: isOwner,
    staleTime: 0,
  });
  const storage = useQuery({
    queryKey: ["admin", "backup-storage"],
    queryFn: fetchBackupStorage,
    enabled: isOwner,
    staleTime: 0,
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const status = useOwnerStatus();
  const now = useNow(60_000);
  const open = users.data?.users.find((user) => user.id === openId) ?? null;
  const shown =
    users.data?.users.filter((user) =>
      matchesSearch(`${user.name} ${user.email}`, query),
    ) ?? [];

  useEffect(() => {
    void refreshOwnerStatus();
  }, []);

  return (
    <Screen
      header={
        <PageHeader
          title={t("admin.title")}
          back={{ to: "/settings", label: t("settings.title") }}
        />
      }
      scrollId="admin"
      width="narrow"
    >
      {!isOwner ? (
        <Empty>{t("admin.ownerOnly")}</Empty>
      ) : (
        <>
          <ServerSection status={status} storage={storage} now={now} />
          <SectionHeading className="pt-6 pb-1">
            {t("admin.accounts.title")}
          </SectionHeading>
          {users.isError ? (
            <Empty>
              {t("admin.accounts.loadFailed", { error: users.error.message })}
            </Empty>
          ) : !users.data ? (
            <Empty>{t("admin.loading")}</Empty>
          ) : (
            <>
              <AccountCap
                accounts={users.data.users.length}
                maxAccounts={users.data.maxAccounts}
                defaultMaxAccounts={users.data.defaultMaxAccounts}
              />
              <div className="relative mx-2 mt-3 mb-2 lg:mx-0">
                <Search
                  size={18}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("admin.accounts.searchPlaceholder")}
                  aria-label={t("admin.accounts.searchLabel")}
                  className="h-11 w-full rounded-xl bg-raised pr-3 pl-10 outline-none ring-1 ring-rule focus:ring-2 focus:ring-ink"
                />
              </div>
              {shown.length === 0 && (
                <Empty>{t("admin.accounts.noMatch")}</Empty>
              )}
              <ul className={listClass}>
                {shown.map((user) => (
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
                          <span className="text-ink-muted">
                            {" · "}
                            {t("admin.accounts.owner")}
                          </span>
                        )}
                        {user.disabled && (
                          <span className="text-danger">
                            {" · "}
                            {t("admin.accounts.disabled")}
                          </span>
                        )}
                      </span>
                      <span className="text-sm text-ink-muted">
                        {user.email}
                      </span>
                      <span className="text-sm text-ink-muted">
                        {usageLine(user, users.data.defaults, now)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
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
      : i18n.t("admin.accounts.usageOf", {
          used: formatBytes(used),
          limit: formatBytes(limit),
        });
  const synced =
    user.lastSyncAt === null
      ? i18n.t("admin.accounts.neverSynced")
      : i18n.t("admin.accounts.synced", {
          ago: formatAgo(user.lastSyncAt, now),
        });
  return i18n.t("admin.accounts.usage", {
    stored: of(user.storedBytes, max),
    today: of(user.bytesWrittenToday, perDay),
    synced,
  });
}
