import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { SectionHeading } from "../../components/headings.tsx";
import { PageHeader, Screen } from "../../components/page.tsx";
import { dateFormat } from "../../lib/format.ts";
import { BackupRetention } from "./backup-retention.tsx";
import { CONTROLLER, NOTICE_UPDATED } from "./controller.ts";

// The notice GDPR article 13 asks for. It must stay true to what the server
// does and to docs/privacy.md, and Google's consent screen links here.

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

function Items(props: { children: ReactNode }) {
  return <ul className="list-disc pl-5">{props.children}</ul>;
}

const external = (href: string) => (
  // biome-ignore lint/a11y/useAnchorContent: Trans fills in the text.
  <a href={href} target="_blank" rel="noreferrer" className="underline" />
);

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
        <Part title={t("privacy.controller.title")}>
          <p>
            {CONTROLLER.name
              ? t("privacy.controller.body", { name: CONTROLLER.name })
              : t("privacy.controller.noName")}
          </p>
          <p>
            {CONTROLLER.email ? (
              <Trans
                i18nKey="privacy.controller.contact"
                values={{ email: CONTROLLER.email }}
                components={{
                  mail: (
                    // biome-ignore lint/a11y/useAnchorContent: Trans fills in the address.
                    <a
                      href={`mailto:${CONTROLLER.email}`}
                      className="underline"
                    />
                  ),
                }}
              />
            ) : (
              t("privacy.controller.noContact")
            )}
          </p>
        </Part>
        <Part title={t("privacy.withoutAccount.title")}>
          <p>{t("privacy.withoutAccount.body")}</p>
        </Part>
        <Part title={t("privacy.withAccount.title")}>
          <p>{t("privacy.withAccount.intro")}</p>
          <Items>
            <li>{t("privacy.withAccount.account")}</li>
            <li>{t("privacy.withAccount.data")}</li>
            <li>{t("privacy.withAccount.signIns")}</li>
            <li>{t("privacy.withAccount.usage")}</li>
          </Items>
          <p>{t("privacy.withAccount.encryption")}</p>
        </Part>
        <Part title={t("privacy.purpose.title")}>
          <p>{t("privacy.purpose.account")}</p>
          <p>{t("privacy.purpose.consent")}</p>
          <p>{t("privacy.purpose.withdraw")}</p>
          <p>{t("privacy.purpose.misuse")}</p>
        </Part>
        <Part title={t("privacy.processors.title")}>
          <p>{t("privacy.processors.body")}</p>
          <p>
            <Trans
              i18nKey="privacy.processors.transfers"
              components={{
                dpa: external(
                  "https://www.cloudflare.com/cloudflare-customer-dpa/",
                ),
              }}
            />
          </p>
        </Part>
        <Part title={t("privacy.retention.title")}>
          <Items>
            <li>{t("privacy.retention.account")}</li>
            <li>{t("privacy.retention.signIns")}</li>
            <li>{t("privacy.retention.usage")}</li>
          </Items>
          <p>{t("privacy.retention.backups")}</p>
          <BackupRetention />
        </Part>
        <Part title={t("privacy.rights.title")}>
          <Items>
            <li>
              <Trans
                i18nKey="privacy.rights.export"
                components={{
                  settings: <Link to="/settings" className="underline" />,
                }}
              />
            </li>
            <li>{t("privacy.rights.correct")}</li>
            <li>{t("privacy.rights.delete")}</li>
          </Items>
          <p>{t("privacy.rights.request")}</p>
          <p>
            <Trans
              i18nKey="privacy.rights.complain"
              components={{ site: external("https://tietosuoja.fi") }}
            />
          </p>
        </Part>
        <Part title={t("privacy.cookies.title")}>
          <p>{t("privacy.cookies.body")}</p>
        </Part>
        <p className="px-4 pt-5 text-sm text-ink-muted lg:px-0">
          {t("privacy.updated", {
            date: dateFormat({ dateStyle: "long" }).format(
              new Date(`${NOTICE_UPDATED}T12:00:00`),
            ),
          })}
        </p>
      </div>
    </Screen>
  );
}
