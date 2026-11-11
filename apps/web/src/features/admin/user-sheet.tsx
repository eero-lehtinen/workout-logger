import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../components/button.tsx";
import { Confirm, Sheet } from "../../components/sheet.tsx";
import { toasts } from "../../components/toasts.tsx";
import {
  type AdminUser,
  type AdminUsers,
  deleteUser,
  exemptUser,
  type QuotaOverrides,
  saveOverrides,
  setDisabled,
} from "../../lib/admin-api.ts";
import { formatBytes, formatDateTime } from "../../lib/format.ts";
import { Row } from "../settings/settings-rows.tsx";

const MB = 1024 * 1024;

type Field = keyof QuotaOverrides;

/** In MB for the byte limits, as counts for the others. */
const FIELDS: { key: Field; label: string; bytes: boolean }[] = [
  { key: "bytesPerDay", label: "Upload per day (MB)", bytes: true },
  { key: "maxBytes", label: "Storage (MB)", bytes: true },
  { key: "requestsPerMinute", label: "Requests per minute", bytes: false },
  { key: "snapshotsPerDay", label: "Full downloads per day", bytes: false },
];

/** One account's quotas, exemption, and disable switch. */
export function UserSheet(props: {
  user: AdminUser;
  defaults: AdminUsers["defaults"];
  onClose: () => void;
}) {
  const { user, defaults } = props;
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: (run: () => Promise<void>) => run(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
    onError: (error) =>
      toasts.add({
        title: "The change didn't save",
        description: error.message,
        type: "error",
      }),
  });
  const [drafts, setDrafts] = useState<Record<Field, string>>(
    () =>
      Object.fromEntries(
        FIELDS.map(({ key, bytes }) => {
          const value = user.overrides[key];
          return [
            key,
            value === null ? "" : String(bytes ? value / MB : value),
          ];
        }),
      ) as Record<Field, string>,
  );
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function parsed(): QuotaOverrides | null {
    const result = {} as QuotaOverrides;
    for (const { key, bytes } of FIELDS) {
      const text = drafts[key].trim();
      if (text === "") {
        result[key] = null;
        continue;
      }
      const number = Number(text);
      if (!Number.isFinite(number) || number < 0) return null;
      result[key] = Math.round(bytes ? number * MB : number);
    }
    return result;
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && props.onClose()}
      title={user.name}
    >
      <div className="flex flex-col py-1">
        <Row
          label={user.email}
          hint={`Created ${formatDateTime(user.createdAt)}. ${formatBytes(user.storedBytes)} stored.`}
        />
        <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-2">
          {FIELDS.map(({ key, label, bytes }) => (
            <label key={key} className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{label}</span>
              <input
                inputMode="decimal"
                value={drafts[key]}
                placeholder={`Default ${bytes ? defaults[key] / MB : defaults[key]}`}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [key]: e.target.value }))
                }
                className="tabular h-10 rounded-lg bg-chalk px-3 outline-none ring-1 ring-rule focus:ring-2 focus:ring-ink"
              />
            </label>
          ))}
        </div>
        <div className="flex justify-end px-4 pb-3">
          <Button
            variant="primary"
            disabled={action.isPending}
            onClick={() => {
              const overrides = parsed();
              if (!overrides) {
                toasts.add({
                  title: "Enter numbers of 0 or more, or leave empty",
                  type: "error",
                });
                return;
              }
              action.mutate(() => saveOverrides(user.id, overrides));
            }}
          >
            Save quotas
          </Button>
        </div>
        <Row
          stacked
          label="Unlimited uploads"
          hint={
            user.exemptUntil === null
              ? "Lifts the daily upload limit for 24 hours, e.g. before an import. Storage stays limited."
              : `The daily upload limit is lifted until ${formatDateTime(user.exemptUntil)}.`
          }
        >
          <Button
            disabled={action.isPending}
            onClick={() => action.mutate(() => exemptUser(user.id))}
          >
            Allow for 24 h
          </Button>
        </Row>
        <Row
          stacked
          label={user.disabled ? "Disabled" : "Disable"}
          hint={
            user.disabled
              ? "Can't sign in or sync. The data stays on the server."
              : "Signs the account out everywhere and refuses its sign-ins. The data stays."
          }
        >
          {user.disabled ? (
            <Button
              disabled={action.isPending}
              onClick={() => action.mutate(() => setDisabled(user.id, false))}
            >
              Enable
            </Button>
          ) : (
            <Button
              variant="danger"
              disabled={action.isPending}
              onClick={() => setConfirmDisable(true)}
            >
              Disable
            </Button>
          )}
        </Row>
        <Row
          stacked
          label="Delete"
          hint="Deletes the account and all its data from the server, as the user's own deletion does. Backups keep it until they expire."
        >
          <Button
            variant="danger"
            disabled={action.isPending}
            onClick={() => setConfirmDelete(true)}
          >
            Delete account
          </Button>
        </Row>
      </div>
      <Confirm
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${user.name}?`}
        description={`Everything the server holds for ${user.email} is deleted now. This can't be undone; their devices keep their own data.`}
        actions={[
          {
            label: "Delete account",
            variant: "danger",
            onClick: () => action.mutate(() => deleteUser(user.id)),
          },
        ]}
      />
      <Confirm
        open={confirmDisable}
        onOpenChange={setConfirmDisable}
        title={`Disable ${user.name}?`}
        description="Their devices are signed out and stop syncing. Their local data stays, and you can enable the account again."
        actions={[
          {
            label: "Disable",
            variant: "danger",
            onClick: () => action.mutate(() => setDisabled(user.id, true)),
          },
        ]}
      />
    </Sheet>
  );
}
