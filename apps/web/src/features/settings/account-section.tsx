import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button, buttonClass } from "../../components/button.tsx";
import { Confirm } from "../../components/sheet.tsx";
import { toasts } from "../../components/toasts.tsx";
import { useDbQuery } from "../../db/react.tsx";
import { signIn, signOut, useAccount } from "../../lib/account.ts";
import { ownerWarning, useOwnerStatus } from "../../lib/server-status.ts";
import {
  PROVIDER_NAMES,
  useSignInProviders,
} from "../../lib/sign-in-providers.ts";
import { chooseAccount, repairClock, useSyncState } from "../../lib/sync.ts";
import { DeleteAccountRow } from "./delete-account.tsx";
import { Row, Section } from "./settings-rows.tsx";
import { SyncRows } from "./sync-rows.tsx";

/** Sign-in, sync status, and for the owner, the way to the admin page. */
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
            account.status === "signed-out" && account.expired ? (
              "Your session ended. Sign in again to keep syncing; nothing logged here is lost."
            ) : (
              <>
                Sign in to sync with your other devices and keep a copy on the
                server. Signing in the first time creates your account. The
                server stores your data unencrypted, and its owner can read it.{" "}
                <Link to="/privacy" className="underline">
                  Privacy
                </Link>
                . Without an account, your data stays on this device.
              </>
            )
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
      <SyncRows sync={sync} />
      {(sync.rejected.future_clock ?? 0) > 0 && (
        <Row
          stacked
          label="Clock ahead"
          hint="This device's clock was ahead when you logged some changes, so the server refused them. Set the clock right, then repair."
        >
          <Button onClick={() => void repairClock()}>Repair clock</Button>
        </Row>
      )}
      {account.user.role === "owner" ? (
        <AdminRow />
      ) : (
        !account.offline && <DeleteAccountRow user={account.user} />
      )}
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

/** The owner's way to the admin page, with what on the server needs attention. */
function AdminRow() {
  const status = useOwnerStatus();
  const warning = status && ownerWarning(status);
  return (
    <Row
      label="Admin"
      hint={
        warning ? (
          <span className="text-danger">{warning}.</span>
        ) : (
          "Server storage and backups, accounts, and quotas."
        )
      }
    >
      <Link to="/admin" className={buttonClass("secondary")}>
        Open
      </Link>
    </Row>
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
