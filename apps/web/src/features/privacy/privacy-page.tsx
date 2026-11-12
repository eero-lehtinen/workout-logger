import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { SectionHeading } from "../../components/headings.tsx";
import { PageHeader, Screen } from "../../components/page.tsx";
import { BackupRetention } from "./backup-retention.tsx";

// The content of docs/accounts.md#privacy. Google's consent screen links
// here, so it must stay true to what the server does.

function Part(props: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 px-4 pt-5 first:pt-0 lg:px-0">
      <SectionHeading inset={false} className="pb-0">
        {props.title}
      </SectionHeading>
      {props.children}
    </section>
  );
}

export function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <Screen
      header={
        <PageHeader
          title={t("privacy.title")}
          back={{ to: "/settings", label: t("settings.title") }}
        />
      }
      scrollId="privacy"
      width="narrow"
    >
      <div className="flex flex-col text-[0.9375rem] leading-relaxed">
        <Part title={t("privacy.withoutAccount.title")}>
          <p>{t("privacy.withoutAccount.body")}</p>
        </Part>
        <Part title={t("privacy.withAccount.title")}>
          <p>{t("privacy.withAccount.stored")}</p>
          <p>{t("privacy.withAccount.processors")}</p>
        </Part>
        <Part title={t("privacy.yourData.title")}>
          <p>
            <Trans
              i18nKey="privacy.yourData.export"
              components={{
                settings: <Link to="/settings" className="underline" />,
              }}
            />
          </p>
          <p>{t("privacy.yourData.delete")}</p>
          <BackupRetention />
        </Part>
      </div>
    </Screen>
  );
}
