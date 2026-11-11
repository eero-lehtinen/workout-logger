import { useState } from "react";
import { Button } from "../../components/button.tsx";
import { Confirm } from "../../components/sheet.tsx";
import { toasts } from "../../components/toasts.tsx";
import { useDbQuery } from "../../db/react.tsx";
import { signIn, signOut, useAccount } from "../../lib/account.ts";
import { formatAgo } from "../../lib/format.ts";
import { type BackupLayer, useOwnerStatus } from "../../lib/server-status.ts";
import {
  PROVIDER_NAMES,
  useSignInProviders,
} from "../../lib/sign-in-providers.ts";
import {
  chooseAccount,
  repairClock,
  type SyncState,
  syncNow,
  useSyncState,
} from "../../lib/sync.ts";
import { useNow } from "../../lib/use-now.ts";
import { Row, Section } from "./settings-rows.tsx";

/** Sign-in, sync status, and for the owner, the server's backups. */
export function AccountSection() {
  const account = useAccount();
  const sync = useSyncState();

  if (account.status !== "signed-in") {
    return (
      <Section title="Account and sync">
        <Row
          stacked
          label={
            account.status === "signed-out" && account.expired
              ? "Signed out"
              : "Sync"
          }
          hint={
            account.status === "signed-out" && account.expired
              ? "Your session ended. Sign in again to keep syncing; nothing logged here is lost."
              : "Sign in to sync with your other devices and keep a copy on the server. Without an account, your data stays on this device."
          }
        >
          <SignInButtons />
        </Row>
      </Section>
    );
  }

  return (
    <Section title="Account and sync">
      <Row
        label={account.user.name}
        hint={`${account.user.email}${account.offline ? " · offline" : ""}`}
      >
        <SignOutButton />
      </Row>
      <SyncRow sync={sync} />
      {(sync.rejected.future_clock ?? 0) > 0 && (
        <Row
          stacked
          label="Clock ahead"
          hint="This device's clock was ahead when you logged some changes, so the server refused them. Set the clock right, then repair."
        >
          <Button onClick={() => void repairClock()}>Repair clock</Button>
        </Row>
      )}
      {account.user.role === "owner" && <ServerBackupsRow />}
    </Section>
  );
}

function SignInButtons() {
  const providers = useSignInProviders();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {providers.map((provider) => (
        <Button
          key={provider}
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await signIn(provider);
            } catch (error) {
              toasts.add({
                title: "Couldn't start sign-in",
                description:
                  error instanceof Error ? error.message : String(error),
                type: "error",
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          Sign in with {PROVIDER_NAMES[provider]}
        </Button>
      ))}
    </div>
  );
}

function SignOutButton() {
  const [confirming, setConfirming] = useState(false);
  const { unsynced } = useDbQuery("syncStatus");
  return (
    <>
      <Button onClick={() => setConfirming(true)}>Sign out</Button>
      <Confirm
        open={confirming}
        onOpenChange={setConfirming}
        title="Sign out"
        description={
          unsynced > 0
            ? `Your data stays on this device, but ${unsynced} unsynced changes won't reach your other devices until you sign in again.`
            : "Your data stays on this device. It stops syncing until you sign in again."
        }
        actions={[{ label: "Sign out", onClick: () => void signOut() }]}
      />
    </>
  );
}

function SyncRow(props: { sync: SyncState }) {
  const { unsynced, lastSyncAt } = useDbQuery("syncStatus");
  const now = useNow(30_000);
  const { sync } = props;
  const last =
    lastSyncAt === null
      ? "Not synced yet."
      : `Synced ${formatAgo(lastSyncAt, now)}.`;
  const pending =
    unsynced === 0
      ? ""
      : ` ${unsynced} ${unsynced === 1 ? "change" : "changes"} not synced yet.`;
  return (
    <Row label="Sync" hint={`${problem(sync) ?? last}${pending}`}>
      <Button disabled={sync.running} onClick={() => void syncNow()}>
        {sync.running ? "Syncing…" : "Sync now"}
      </Button>
    </Row>
  );
}

function problem(sync: SyncState): string | null {
  if (sync.updateRequired) return "Update the app to keep syncing.";
  if (sync.failure === "offline")
    return "Offline; syncs when the server can be reached.";
  if (sync.failure === "server")
    return "The last sync failed; it is retried every minute.";
  if (sync.failure === "rate_limited")
    return "Too many requests to the server; sync tries again in a minute.";
  if (sync.rejected.quota) return "Sync paused: the daily limit is reached.";
  if (
    sync.rejected.conflict ||
    sync.rejected.invalid ||
    sync.rejected.too_large
  ) {
    return "The server refused some changes. They stay on this device.";
  }
  return null;
}

function ServerBackupsRow() {
  const status = useOwnerStatus();
  const now = useNow(60_000);
  if (!status) return null;
  const { litestream, dailyCopy } = status.backups;
  const layer = (name: string, value: BackupLayer) => {
    if (!value.configured) return `${name}: off`;
    const at =
      value.lastOkAt === null ? "never" : formatAgo(value.lastOkAt, now);
    return `${name}: ${at}${value.stale ? " (stale)" : ""}`;
  };
  const free =
    status.freeDiskBytes === null
      ? ""
      : ` Free disk ${(status.freeDiskBytes / 1e9).toFixed(1)} GB.`;
  return (
    <Row
      label={status.backupsOk ? "Server backups" : "Server backups are stale"}
      hint={`${layer("Replica", litestream)}. ${layer("Daily copy", dailyCopy)}.${free}`}
    />
  );
}

/**
 * Asks what to do with another account's data on this device. Sync waits for
 * the answer, so it shows on every screen.
 */
export function AccountChoice() {
  const { accountChoice } = useSyncState();
  const { unsynced } = useDbQuery("syncStatus");
  const lost =
    unsynced > 0
      ? ` ${unsynced} ${unsynced === 1 ? "change" : "changes"} made here never reached the server; after a discard they are only in that file.`
      : "";
  return (
    <Confirm
      open={accountChoice !== null}
      // Sync stays paused until one of the choices is made.
      onOpenChange={() => {}}
      onCancel={() => void chooseAccount("sign-out")}
      title="This device has another account's data"
      description={`Merge adds it to the account you signed in with. Discard saves it to a snapshot file, removes it from this device, and loads this account's data instead; the other account keeps what it synced.${lost}`}
      actions={[
        { label: "Merge", onClick: () => void chooseAccount("merge") },
        {
          label: "Discard this device's data",
          variant: "danger",
          onClick: () => void chooseAccount("discard"),
        },
      ]}
      cancelLabel="Sign out"
    />
  );
}
