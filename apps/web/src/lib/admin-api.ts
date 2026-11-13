import { apiHeaders, SERVER_URL, serverAnswered } from "./server.ts";

/** `/api/admin/*`, the owner's view of every account (docs/accounts.md#admin-page). */

export interface QuotaOverrides {
  bytesPerDay: number | null;
  maxBytes: number | null;
  requestsPerMinute: number | null;
  snapshotsPerDay: number | null;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "owner" | "user";
  createdAt: number;
  disabled: boolean;
  lastSyncAt: number | null;
  bytesWrittenToday: number;
  storedBytes: number;
  /** Null is the default. */
  overrides: QuotaOverrides;
}

export interface AdminUsers {
  users: AdminUser[];
  defaults: {
    bytesPerDay: number;
    maxBytes: number;
    requestsPerMinute: number;
    snapshotsPerDay: number;
  };
  /** The account cap; null is `defaultMaxAccounts`. */
  maxAccounts: number | null;
  defaultMaxAccounts: number;
  bans: AdminBan[];
}

/** A banned account, deleted when it was banned. */
export interface AdminBan {
  userId: string;
  name: string;
  email: string;
  createdAt: number;
}

/** The DB copies in the `wl-backups` bucket, by key prefix. */
export interface BackupStorage {
  bytes: number;
  objects: number;
  groups: { prefix: string; bytes: number; objects: number }[];
}

/** Null when the server has no backup bucket. */
export async function fetchBackupStorage(): Promise<BackupStorage | null> {
  return (await (await call("/backup-storage")).json()) as BackupStorage | null;
}

/** Sets the account cap; null returns it to the default. */
export async function saveMaxAccounts(maxAccounts: number | null) {
  await call("/limits", {
    method: "PUT",
    body: JSON.stringify({ maxAccounts }),
  });
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${SERVER_URL}/api/admin${path}`, {
    ...init,
    headers: {
      ...(await apiHeaders()),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) throw serverAnswered(res.status);
  return res;
}

export async function fetchUsers(): Promise<AdminUsers> {
  return (await (await call("/users")).json()) as AdminUsers;
}

export async function saveOverrides(
  userId: string,
  overrides: QuotaOverrides,
): Promise<void> {
  await call(`/users/${encodeURIComponent(userId)}/quota`, {
    method: "PUT",
    body: JSON.stringify(overrides),
  });
}

/** The same as the user's own account deletion. */
export async function deleteUser(userId: string): Promise<void> {
  await call(`/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

/** Deletes the account and refuses its email and sign-in accounts from then on. */
export async function banUser(userId: string): Promise<void> {
  await call(`/users/${encodeURIComponent(userId)}/ban`, { method: "POST" });
}

export async function unbanUser(userId: string): Promise<void> {
  await call(`/bans/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

export async function setDisabled(
  userId: string,
  disabled: boolean,
): Promise<void> {
  await call(
    `/users/${encodeURIComponent(userId)}/${disabled ? "disable" : "enable"}`,
    { method: "POST" },
  );
}
