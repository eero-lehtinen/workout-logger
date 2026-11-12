import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { buttonClass } from "../../components/button.tsx";
import { APK_URL, latestRelease } from "../../lib/app-update.ts";
import { isAndroidBrowser } from "../../lib/platform.ts";
import { Row } from "./settings-rows.tsx";

/**
 * Offers the Android app to a browser on an Android device, if the server
 * has a release. A plain link: the browser downloads the APK.
 */
export function AndroidAppRow() {
  const { t } = useTranslation();
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
      label={t("settings.data.androidApp")}
      hint={t("settings.data.androidAppHint", { version })}
    >
      <a href={APK_URL} className={buttonClass("primary")}>
        {t("settings.data.download")}
      </a>
    </Row>
  );
}
