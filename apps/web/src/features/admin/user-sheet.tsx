import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/button.tsx";
import { Confirm, Sheet } from "../../components/sheet.tsx";
import { toasts } from "../../components/toasts.tsx";
import {
  type AdminUser,
  type AdminUsers,
  banUser,
  deleteUser,
  type QuotaOverrides,
  saveOverrides,
  setDisabled,
} from "../../lib/admin-api.ts";
import { formatBytes, formatDateTime } from "../../lib/format.ts";
import { Row } from "../settings/settings-rows.tsx";

const MB = 1024 * 1024;

type Field = keyof QuotaOverrides;

/** In MB for the byte limits, as counts for the others. */
const FIELDS: { key: Field; bytes: boolean }[] = [
  { key: "bytesPerDay", bytes: true },
  { key: "maxBytes", bytes: true },
  { key: "requestsPerMinute", bytes: false },
  { key: "snapshotsPerDay", bytes: false },
];

/** One account's quotas, disable switch, deletion, and ban. */
export function UserSheet(props: {
  user: AdminUser;
  defaults: AdminUsers["defaults"];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { user, defaults } = props;
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: (run: () => Promise<void>) => run(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
    onError: (error) =>
      toasts.add({
        title: t("admin.user.saveFailed"),
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
  const [confirmBan, setConfirmBan] = useState(false);

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
          hint={t("admin.user.created", {
            created: formatDateTime(user.createdAt),
            stored: formatBytes(user.storedBytes),
          })}
        />
        <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-2">
          {FIELDS.map(({ key, bytes }) => (
            <label key={key} className="flex flex-col gap-1 text-sm">
              <span className="font-medium">
                {t(`admin.user.fields.${key}`)}
              </span>
              <input
                inputMode="decimal"
                value={drafts[key]}
                placeholder={t("admin.user.default", {
                  value: bytes ? defaults[key] / MB : defaults[key],
                })}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [key]: e.target.value }))
                }
                className="tabular h-10 rounded-xl bg-chalk px-3 outline-none ring-1 ring-rule focus:ring-2 focus:ring-ink"
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
                  title: t("admin.user.invalidQuotas"),
                  type: "error",
                });
                return;
              }
              action.mutate(() => saveOverrides(user.id, overrides));
            }}
          >
            {t("admin.user.saveQuotas")}
          </Button>
        </div>
        <Row
          stacked
          label={
            user.disabled
              ? t("admin.user.disabledLabel")
              : t("admin.user.disable")
          }
          hint={
            user.disabled
              ? t("admin.user.disabledHint")
              : t("admin.user.disableHint")
          }
        >
          {user.disabled ? (
            <Button
              disabled={action.isPending}
              onClick={() => action.mutate(() => setDisabled(user.id, false))}
            >
              {t("admin.user.enable")}
            </Button>
          ) : (
            <Button
              variant="danger"
              disabled={action.isPending}
              onClick={() => setConfirmDisable(true)}
            >
              {t("admin.user.disable")}
            </Button>
          )}
        </Row>
        <Row
          stacked
          label={t("admin.user.delete")}
          hint={t("admin.user.deleteHint")}
        >
          <Button
            variant="danger"
            disabled={action.isPending}
            onClick={() => setConfirmDelete(true)}
          >
            {t("admin.user.deleteAccount")}
          </Button>
        </Row>
        <Row stacked label={t("admin.user.ban")} hint={t("admin.user.banHint")}>
          <Button
            variant="danger"
            disabled={action.isPending}
            onClick={() => setConfirmBan(true)}
          >
            {t("admin.user.banAccount")}
          </Button>
        </Row>
      </div>
      <Confirm
        open={confirmBan}
        onOpenChange={setConfirmBan}
        title={t("admin.user.confirmBanTitle", { name: user.name })}
        description={t("admin.user.confirmBanBody", { email: user.email })}
        actions={[
          {
            label: t("admin.user.banAccount"),
            variant: "danger",
            onClick: () => action.mutate(() => banUser(user.id)),
          },
        ]}
      />
      <Confirm
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("admin.user.confirmDeleteTitle", { name: user.name })}
        description={t("admin.user.confirmDeleteBody", { email: user.email })}
        actions={[
          {
            label: t("admin.user.deleteAccount"),
            variant: "danger",
            onClick: () => action.mutate(() => deleteUser(user.id)),
          },
        ]}
      />
      <Confirm
        open={confirmDisable}
        onOpenChange={setConfirmDisable}
        title={t("admin.user.confirmDisableTitle", { name: user.name })}
        description={t("admin.user.confirmDisableBody")}
        actions={[
          {
            label: t("admin.user.disable"),
            variant: "danger",
            onClick: () => action.mutate(() => setDisabled(user.id, true)),
          },
        ]}
      />
    </Sheet>
  );
}
