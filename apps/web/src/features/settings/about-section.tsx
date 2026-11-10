import { useEffect, useState } from "react";
import { reportDownloadFailure } from "../../components/app-update-prompt.tsx";
import { Button } from "../../components/button.tsx";
import { toasts } from "../../components/toasts.tsx";
import {
  appVersion,
  checkForUpdate,
  downloadUpdate,
} from "../../lib/app-update.ts";
import { Row, Section } from "./settings-rows.tsx";

/** Android only: the installed version and a manual update check. */
export function AboutSection() {
  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    appVersion().then(setVersion, () => {});
  }, []);

  async function check() {
    setChecking(true);
    try {
      const update = await checkForUpdate();
      if (update) {
        toasts.add({
          title: `Version ${update.version} is available`,
          actionProps: {
            children: "Download",
            onClick: () => void downloadUpdate().catch(reportDownloadFailure),
          },
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
    <Section title="About">
      <Row
        stacked
        label="Version"
        hint={`${version ?? "…"}. Updates are also checked when the app starts.`}
      >
        <Button disabled={checking} onClick={check}>
          Check for updates
        </Button>
      </Row>
    </Section>
  );
}
