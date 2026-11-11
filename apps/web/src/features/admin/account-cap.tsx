import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(
    props.maxAccounts === null ? "" : String(props.maxAccounts),
  );
  const save = useMutation({
    mutationFn: saveMaxAccounts,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
    onError: (error) =>
      toasts.add({
        title: "The cap didn't save",
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
        title: "Enter a whole number of 1 or more, or leave it empty",
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
        label="Account cap"
        hint={`${props.accounts} of ${cap} accounts, you included. Sign-ups stop at the cap; a lower cap removes no one. Empty is ${props.defaultMaxAccounts}.`}
      >
        <div className="flex items-center gap-2">
          <input
            aria-label="Account cap"
            inputMode="numeric"
            value={draft}
            placeholder={String(props.defaultMaxAccounts)}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="tabular h-10 w-20 rounded-lg bg-chalk px-3 text-right outline-none ring-1 ring-rule focus:ring-2 focus:ring-ink"
          />
          <Button disabled={save.isPending} onClick={submit}>
            Save
          </Button>
        </div>
      </Row>
    </div>
  );
}
