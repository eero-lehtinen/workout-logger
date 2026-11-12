import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { reportDownloadFailure } from "../../components/app-update-prompt.tsx";
import { Button, buttonClass } from "../../components/button.tsx";
import { toasts } from "../../components/toasts.tsx";
import {
  appVersion,
  checkForUpdate,
  downloadUpdate,
} from "../../lib/app-update.ts";
import { checkForLiveUpdate } from "../../lib/live-update.ts";
import { isNative } from "../../lib/platform.ts";
import { Row, Section } from "./settings-rows.tsx";

/**
 * The running web build and the privacy page; on Android also the installed
 * version and an update check.
 */
export function AboutSection() {
  return (
    <Section title="About">
      {isNative && <AppVersionRow />}
      <Row label="Web app build" hint={webBuild()} />
      <Row label="Privacy" hint="What the server stores and for how long.">
        <Link
          to="/privacy"
          aria-label="Open privacy page"
          className={buttonClass("secondary")}
        >
          Open
        </Link>
      </Row>
    </Section>
  );
}

const buildTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function webBuild(): string {
  const commit = import.meta.env.BUILD_COMMIT;
  const time = Date.parse(import.meta.env.BUILD_TIME);
  return [
    commit ? commit.slice(0, 7) : "Unknown commit",
    Number.isNaN(time) ? null : `built ${buildTimeFormat.format(time)}`,
  ]
    .filter(Boolean)
    .join(", ");
}

function AppVersionRow() {
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
          title: `Version ${update.version} is available`,
          actionProps: {
            children: "Download",
            onClick: () => void downloadUpdate().catch(reportDownloadFailure),
          },
        });
      } else if (waiting) {
        toasts.add({
          title: "An update is downloaded",
          description: "It takes over once the app is in the background.",
        });
      } else {
        toasts.add({ title: "The app is up to date" });
      }
    } catch (error) {
      toasts.add({
        title: "Couldn't check for updates",
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
      label="Version"
      hint={`${version ?? "…"}. Updates are also checked when the app starts.`}
    >
      <Button disabled={checking} onClick={check}>
        Check for updates
      </Button>
    </Row>
  );
}
