import { useEffect, useState } from "react";
import { buttonClass } from "../../components/button.tsx";
import { APK_URL, latestRelease } from "../../lib/app-update.ts";
import { isAndroidBrowser } from "../../lib/platform.ts";
import { Row } from "./settings-rows.tsx";

/**
 * Offers the Android app to a browser on an Android device, if the server
 * has a release. A plain link: the browser downloads the APK.
 */
export function AndroidAppRow() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    if (!isAndroidBrowser()) return;
    let active = true;
    latestRelease().then(
      (latest) => active && setVersion(latest),
      // Offline, or a server without releases: no row.
      () => {},
    );
    return () => {
      active = false;
    };
  }, []);
  if (!version) return null;
  return (
    <Row
      label="Android app"
      hint={`Version ${version}. Its rest timer also alerts in the background. It keeps its own data: move yours over with a snapshot.`}
    >
      <a href={APK_URL} className={buttonClass("primary")}>
        Download
      </a>
    </Row>
  );
}
