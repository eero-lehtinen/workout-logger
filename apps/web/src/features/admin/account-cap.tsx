import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/button.tsx";
import { toasts } from "../../components/toasts.tsx";
import { saveMaxAccounts } from "../../lib/admin-api.ts";
import { Row } from "../settings/settings-rows.tsx";

/** The account cap, next to the number of accounts. Empty is the default. */
export function AccountCap(props: {
  accounts: number;
  maxAccounts: number | null;
  defaultMaxAccounts: number;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(
    props.maxAccounts === null ? "" : String(props.maxAccounts),
  );
  const save = useMutation({
    mutationFn: saveMaxAccounts,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
    onError: (error) =>
      toasts.add({
        title: t("admin.cap.saveFailed"),
        description: error.message,
        type: "error",
      }),
  });
  const cap = props.maxAccounts ?? props.defaultMaxAccounts;

  function submit() {
    const text = draft.trim();
    const value = text === "" ? null : Number(text);
    if (value !== null && !(Number.isSafeInteger(value) && value >= 1)) {
      toasts.add({
        title: t("admin.cap.invalid"),
        type: "error",
      });
      return;
    }
    save.mutate(value);
  }

  return (
    <div className="mx-2 rounded-2xl bg-raised py-1 lg:mx-0">
      <Row
        stacked
        label={t("admin.cap.label")}
        hint={t("admin.cap.hint", {
          accounts: props.accounts,
          count: cap,
          defaultMax: props.defaultMaxAccounts,
        })}
      >
        <div className="flex items-center gap-2">
          <input
            aria-label={t("admin.cap.label")}
            inputMode="numeric"
            value={draft}
            placeholder={String(props.defaultMaxAccounts)}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="tabular h-10 w-20 rounded-xl bg-chalk px-3 text-right outline-none ring-1 ring-rule focus:ring-2 focus:ring-ink"
          />
          <Button disabled={save.isPending} onClick={submit}>
            {t("common.save")}
          </Button>
        </div>
      </Row>
    </div>
  );
}
