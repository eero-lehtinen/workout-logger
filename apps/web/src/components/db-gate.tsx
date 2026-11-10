import { useEffect, useState } from "react";
import type { GateView } from "../db/react.tsx";
import { Button } from "./button.tsx";

/** Shown until this tab owns an open database. */
export const DbGate: GateView = ({ state, error, takeOver, retry }) => {
  // Opening takes ~50-200 ms; a message that flashes by reads as a glitch.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 400);
    return () => clearTimeout(id);
  }, []);

  if (state === "starting") {
    return (
      <Centered>
        {slow && <p className="text-ink-muted">Opening your log…</p>}
      </Centered>
    );
  }
  if (state === "elsewhere") {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Open in another tab</h1>
        <p className="max-w-xs text-ink-muted">
          Your log can be open in one tab at a time. Using it here closes it in
          the other tab.
        </p>
        <Button variant="primary" onClick={takeOver}>
          Use here
        </Button>
      </Centered>
    );
  }
  if (state === "blocked") {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Still open in another window</h1>
        <p className="max-w-xs text-ink-muted">
          The browser has paused the other window, so it can't let go of your
          log yet. Switch to it or close it; this opens on its own after that.
        </p>
        <Button variant="primary" onClick={retry}>
          Try again
        </Button>
      </Centered>
    );
  }
  const tooNew = error instanceof Error && error.name === "SchemaTooNewError";
  return (
    <Centered>
      <h1 className="text-xl font-semibold">
        {tooNew ? "Update the app" : "Your log didn't open"}
      </h1>
      <p className="max-w-sm text-ink-muted">
        {tooNew
          ? "Your data was saved by a newer version. Reload to get it."
          : `Your data is untouched. ${error instanceof Error ? error.message : String(error)}`}
      </p>
      {tooNew ? (
        <Button variant="primary" onClick={() => location.reload()}>
          Reload
        </Button>
      ) : (
        <Button variant="primary" onClick={retry}>
          Try again
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
