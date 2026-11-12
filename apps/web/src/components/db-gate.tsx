import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GateView } from "../db/react.tsx";
import { applyLiveUpdate, markAppReady } from "../lib/live-update.ts";
import { isNative } from "../lib/platform.ts";
import { Button } from "./button.tsx";

/** Shown until this tab owns an open database. */
export const DbGate: GateView = ({ state, error, takeOver, retry }) => {
  const { t } = useTranslation();
  // Opening takes ~50-200 ms; a message that flashes by reads as a glitch.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 400);
    return () => clearTimeout(id);
  }, []);

  const tooNew = error instanceof Error && error.name === "SchemaTooNewError";
  useEffect(() => {
    // A rollback would only reach an even older build.
    if (tooNew) markAppReady();
  }, [tooNew]);

  if (state === "starting") {
    return (
      <Centered>
        {slow && <p className="text-ink-muted">{t("shell.gate.opening")}</p>}
      </Centered>
    );
  }
  if (state === "elsewhere") {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">
          {t("shell.gate.elsewhereTitle")}
        </h1>
        <p className="max-w-xs text-ink-muted">
          {t("shell.gate.elsewhereText")}
        </p>
        <Button variant="primary" onClick={takeOver}>
          {t("shell.gate.useHere")}
        </Button>
      </Centered>
    );
  }
  if (state === "blocked") {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">
          {t("shell.gate.blockedTitle")}
        </h1>
        <p className="max-w-xs text-ink-muted">{t("shell.gate.blockedText")}</p>
        <Button variant="primary" onClick={retry}>
          {t("common.tryAgain")}
        </Button>
      </Centered>
    );
  }
  return (
    <Centered>
      <h1 className="text-xl font-semibold">
        {tooNew ? t("shell.gate.tooNewTitle") : t("shell.gate.failedTitle")}
      </h1>
      {tooNew ? (
        <p className="max-w-sm text-ink-muted">
          {isNative
            ? t("shell.gate.tooNewUpdate")
            : t("shell.gate.tooNewReload")}
        </p>
      ) : (
        <div className="flex max-w-sm flex-col gap-2">
          <p className="text-ink-muted">{t("shell.gate.failedText")}</p>
          {/* For a bug report; a user can't act on it. */}
          <p className="text-xs break-words text-ink-muted">
            {error instanceof Error ? error.message : String(error)}
          </p>
        </div>
      )}
      {tooNew ? (
        <Button
          variant="primary"
          // No database is open here, so switching builds interrupts nothing.
          onClick={() =>
            isNative ? void applyLiveUpdate() : location.reload()
          }
        >
          {isNative ? t("common.update") : t("common.reload")}
        </Button>
      ) : (
        <Button variant="primary" onClick={retry}>
          {t("common.tryAgain")}
        </Button>
      )}
    </Centered>
  );
};

function Centered(props: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      {props.children}
    </main>
  );
}
