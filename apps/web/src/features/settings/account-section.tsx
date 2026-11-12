import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
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
import { ProviderLogo } from "./provider-logo.tsx";
import { Row, Section } from "./settings-rows.tsx";
import { SyncRows } from "./sync-rows.tsx";

/** Sign-in, sync status, and for the owner, the way to the admin page. */
export function AccountSection() {
  const { t } = useTranslation();
  const account = useAccount();
  const sync = useSyncState();

  if (account.status !== "signed-in") {
    return (
      <Section title={t("settings.account.title")}>
        <Row
          label={
            account.status === "signed-out" && account.expired
              ? t("settings.account.signedOut")
              : t("settings.account.sync")
          }
          hint={
            account.status === "signed-out" && account.expired ? (
              t("settings.account.expiredHint")
            ) : (
              <Trans
                i18nKey="settings.account.signInHint"
                components={{
                  privacy: <Link to="/privacy" className="underline" />,
                }}
              />
            )
          }
        >
          <SignInButtons />
        </Row>
      </Section>
    );
  }

  return (
    <Section title={t("settings.account.title")}>
      <Row
        label={account.user.name}
        hint={
          account.offline
            ? t("settings.account.emailOffline", { email: account.user.email })
            : account.user.email
        }
      >
        <SignOutButton />
      </Row>
      <SyncRows sync={sync} />
      {(sync.rejected.future_clock ?? 0) > 0 && (
        <Row
          stacked
          label={t("settings.account.clockAhead")}
          hint={t("settings.account.clockAheadHint")}
        >
          <Button onClick={() => void repairClock()}>
            {t("settings.account.repairClock")}
          </Button>
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
  const { t } = useTranslation();
  const providers = useSignInProviders();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {providers.map((provider) => (
        <Button
          key={provider}
          aria-label={t("settings.account.signInWith", {
            provider: PROVIDER_NAMES[provider],
          })}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await signIn(provider);
            } catch (error) {
              toasts.add({
                title: t("settings.account.signInFailed"),
                description:
                  error instanceof Error ? error.message : String(error),
                type: "error",
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          <ProviderLogo provider={provider} />
          {t("settings.account.signIn")}
        </Button>
      ))}
    </div>
  );
}

function SignOutButton() {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const { unsynced } = useDbQuery("syncStatus");
  return (
    <>
      <Button onClick={() => setConfirming(true)}>
        {t("settings.account.signOut")}
      </Button>
      <Confirm
        open={confirming}
        onOpenChange={setConfirming}
        title={t("settings.account.signOut")}
        description={
          unsynced > 0
            ? t("settings.account.signOutUnsynced", { count: unsynced })
            : t("settings.account.signOutSynced")
        }
        actions={[
          {
            label: t("settings.account.signOut"),
            onClick: () => void signOut(),
          },
        ]}
      />
    </>
  );
}

/** The owner's way to the admin page, with what on the server needs attention. */
function AdminRow() {
  const { t } = useTranslation();
  const status = useOwnerStatus();
  const warning = status && ownerWarning(status, t);
  return (
    <Row
      label={t("settings.account.admin")}
      hint={
        warning ? (
          <span className="text-danger">{warning}.</span>
        ) : (
          t("settings.account.adminHint")
        )
      }
    >
      <Link to="/admin" className={buttonClass("secondary")}>
        {t("settings.account.open")}
      </Link>
    </Row>
  );
}

/**
 * Asks what to do with another account's data on this device. Sync waits for
 * the answer, so it shows on every screen.
 */
export function AccountChoice() {
  const { t } = useTranslation();
  const { accountChoice } = useSyncState();
  const { unsynced } = useDbQuery("syncStatus");
  const lost =
    unsynced > 0
      ? ` ${t("settings.account.choice.unsynced", { count: unsynced })}`
      : "";
  return (
    <Confirm
      open={accountChoice !== null}
      // Sync stays paused until one of the choices is made.
      onOpenChange={() => {}}
      onCancel={() => void chooseAccount("sign-out")}
      title={t("settings.account.choice.title")}
      description={`${t("settings.account.choice.description")}${lost}`}
      actions={[
        {
          label: t("settings.account.choice.merge"),
          onClick: () => void chooseAccount("merge"),
        },
        {
          label: t("settings.account.choice.discard"),
          variant: "danger",
          onClick: () => void chooseAccount("discard"),
        },
      ]}
      cancelLabel={t("settings.account.choice.signOut")}
    />
  );
}
