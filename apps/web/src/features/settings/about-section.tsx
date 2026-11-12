import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { reportDownloadFailure } from "../../components/app-update-prompt.tsx";
import { Button, buttonClass } from "../../components/button.tsx";
import { toasts } from "../../components/toasts.tsx";
import { i18n } from "../../i18n/index.ts";
import {
  appVersion,
  checkForUpdate,
  downloadUpdate,
} from "../../lib/app-update.ts";
import { dateFormat } from "../../lib/format.ts";
import { checkForLiveUpdate } from "../../lib/live-update.ts";
import { isNative } from "../../lib/platform.ts";
import { Row, Section } from "./settings-rows.tsx";

/**
 * The running web build and the privacy page; on Android also the installed
 * version and an update check.
 */
export function AboutSection() {
  const { t } = useTranslation();
  return (
    <Section title={t("settings.about.title")}>
      {isNative && <AppVersionRow />}
      <Row label={t("settings.about.webBuild")} hint={webBuild()} />
      <Row
        label={t("settings.about.privacy")}
        hint={t("settings.about.privacyHint")}
      >
        <Link
          to="/privacy"
          aria-label={t("settings.about.openPrivacy")}
          className={buttonClass("secondary")}
        >
          {t("settings.about.open")}
        </Link>
      </Row>
    </Section>
  );
}

function webBuild(): string {
  const commit = import.meta.env.BUILD_COMMIT
    ? import.meta.env.BUILD_COMMIT.slice(0, 7)
    : i18n.t("settings.about.unknownCommit");
  const time = Date.parse(import.meta.env.BUILD_TIME);
  return Number.isNaN(time)
    ? i18n.t("settings.about.webBuildCommit", { commit })
    : i18n.t("settings.about.webBuildCommitTime", {
        commit,
        time: dateFormat({ dateStyle: "medium", timeStyle: "short" }).format(
          time,
        ),
      });
}

function AppVersionRow() {
  const { t } = useTranslation();
  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    appVersion().then(setVersion, () => {});
  }, []);

  async function check() {
    setChecking(true);
    try {
      const [update, waiting] = await Promise.all([
        checkForUpdate(),
        // A failed download must not hide an APK that was found.
        checkForLiveUpdate().catch(() => false),
      ]);
      if (update) {
        toasts.add({
          title: t("settings.about.updateAvailable", {
            version: update.version,
          }),
          actionProps: {
            children: t("settings.about.download"),
            onClick: () => void downloadUpdate().catch(reportDownloadFailure),
          },
        });
      } else if (waiting) {
        toasts.add({
          title: t("settings.about.updateDownloaded"),
          description: t("settings.about.updateDownloadedHint"),
        });
      } else {
        toasts.add({ title: t("settings.about.upToDate") });
      }
    } catch (error) {
      toasts.add({
        title: t("settings.about.checkFailed"),
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setChecking(false);
    }
  }

  return (
    <Row
      stacked
      label={t("settings.about.version")}
      hint={t("settings.about.versionHint", { version: version ?? "…" })}
    >
      <Button disabled={checking} onClick={check}>
        {t("settings.about.checkForUpdates")}
      </Button>
    </Row>
  );
}
