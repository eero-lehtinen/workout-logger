import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/button.tsx";
import { SectionHeading } from "../../components/headings.tsx";
import { toasts } from "../../components/toasts.tsx";
import { type AdminBan, unbanUser } from "../../lib/admin-api.ts";
import { formatDateTime } from "../../lib/format.ts";
import { Row } from "../settings/settings-rows.tsx";

/** Banned accounts, each with its unban button; nothing when there are none. */
export function BannedAccounts(props: { bans: AdminBan[] }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const unban = useMutation({
    mutationFn: unbanUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
    onError: (error) =>
      toasts.add({
        title: t("admin.bans.unbanFailed"),
        description: error.message,
        type: "error",
      }),
  });
  if (props.bans.length === 0) return null;

  return (
    <section>
      <SectionHeading className="pt-6 pb-1">
        {t("admin.bans.title")}
      </SectionHeading>
      <div className="mx-2 flex flex-col rounded-2xl bg-raised py-1 lg:mx-0">
        {props.bans.map((ban) => (
          <Row
            key={ban.userId}
            label={ban.name}
            hint={t("admin.bans.hint", {
              email: ban.email,
              banned: formatDateTime(ban.createdAt),
            })}
          >
            <Button
              disabled={unban.isPending}
              onClick={() => unban.mutate(ban.userId)}
            >
              {t("admin.bans.unban")}
            </Button>
          </Row>
        ))}
      </div>
      <p className="px-4 pt-2 text-sm text-ink-muted lg:px-0">
        {t("admin.bans.note")}
      </p>
    </section>
  );
}
