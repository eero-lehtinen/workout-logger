import type { SettingChange } from "@workout-logger/core";
import { useRef, useState } from "react";
import { Button } from "../../components/button.tsx";
import { PageHeader } from "../../components/page.tsx";
import { Segmented } from "../../components/segmented.tsx";
import { Confirm } from "../../components/sheet.tsx";
import { parseDuration, parseNumber } from "../../components/stepper.tsx";
import { toasts } from "../../components/toasts.tsx";
import { useCommand, useDb, useDbQuery } from "../../db/react.tsx";
import { formatDuration } from "../../lib/format.ts";
import { usePersistence } from "../../lib/storage.ts";

export function SettingsPage() {
  const settings = useDbQuery("settings");
  const command = useCommand();
  const set = (change: SettingChange) => command("setSetting", change);
  const unit = settings.weight_unit;

  return (
    <div className="mx-auto max-w-2xl pb-10">
      <PageHeader title="Settings" />
      <Section title="Units and steps">
        <Row label="Weight unit" hint="Stored in kg either way.">
          <Segmented
            label="Weight unit"
            value={unit}
            options={[
              { value: "kg", label: "kg" },
              { value: "lb", label: "lb" },
            ]}
            onChange={(value) => set({ key: "weight_unit", value })}
          />
        </Row>
        <Row
          label={`Weight step (${unit})`}
          hint="The +/− step, unless an exercise sets its own."
        >
          <SettingInput
            label="Weight step"
            value={
              unit === "kg"
                ? settings.weight_increment_kg
                : settings.weight_increment_lb
            }
            format={String}
            parse={parseNumber}
            onSave={(value) =>
              set(
                unit === "kg"
                  ? { key: "weight_increment_kg", value }
                  : { key: "weight_increment_lb", value },
              )
            }
          />
        </Row>
      </Section>

      <Section title="Sessions">
        <Row
          label="Rest time"
          hint="m:ss, unless an exercise or slot sets its own."
        >
          <SettingInput
            label="Rest time"
            value={settings.rest_default_s}
            format={formatDuration}
            parse={parseDuration}
            onSave={(value) => set({ key: "rest_default_s", value })}
          />
        </Row>
        <Row
          label="Idle end (minutes)"
          hint="A session ends at its last set after this long without a new one."
        >
          <SettingInput
            label="Idle end in minutes"
            value={settings.idle_threshold_s / 60}
            format={String}
            parse={(text) => {
              const minutes = parseNumber(text);
              return minutes === null ? null : Math.round(minutes * 60);
            }}
            onSave={(value) => set({ key: "idle_threshold_s", value })}
          />
        </Row>
        <Row
          label="e1RM rep limit"
          hint="Sets with more reps get no e1RM and can't be PRs."
        >
          <SettingInput
            label="e1RM rep limit"
            value={settings.e1rm_rep_cap}
            format={String}
            parse={(text) => {
              const reps = parseNumber(text);
              return reps === null ? null : Math.round(reps);
            }}
            onSave={(value) => set({ key: "e1rm_rep_cap", value })}
          />
        </Row>
      </Section>

      <DataSection />
    </div>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="pt-4">
      <h2 className="px-4 pb-1 text-lg font-semibold lg:px-0">{props.title}</h2>
      <div className="divide-y divide-rule border-y border-rule lg:rounded-xl lg:border lg:bg-raised">
        {props.children}
      </div>
    </section>
  );
}

function Row(props: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{props.label}</p>
        {props.hint && <p className="text-sm text-ink-muted">{props.hint}</p>}
      </div>
      {props.children}
    </div>
  );
}

/** Saves on blur or Enter; invalid input reverts and says why. */
function SettingInput<T extends number>(props: {
  label: string;
  value: T;
  format: (value: T) => string;
  parse: (text: string) => number | null;
  onSave: (value: T) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  async function save() {
    if (draft === null) return;
    const value = props.parse(draft);
    setDraft(null);
    if (value === null) {
      toasts.add({ title: `${props.label}: enter a number`, type: "error" });
      return;
    }
    if (value !== props.value) await props.onSave(value as T);
  }
  return (
    <input
      aria-label={props.label}
      inputMode="decimal"
      value={draft ?? props.format(props.value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="tabular h-10 w-24 rounded-lg bg-chalk px-3 text-right font-semibold outline-none ring-1 ring-rule focus:ring-2 focus:ring-ink"
    />
  );
}

function DataSection() {
  const db = useDb();
  const { persisted, request } = usePersistence();
  const fileInput = useRef<HTMLInputElement>(null);
  const [importBytes, setImportBytes] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState(false);

  async function exportSnapshot() {
    setBusy(true);
    try {
      const bytes = await db.exportSnapshot();
      const date = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: "application/vnd.sqlite3" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `workout-logger-${date}.sqlite3`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) {
      toasts.add({
        title: "Export failed",
        description: String(error),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function runImport(mode: "merge" | "replace") {
    if (!importBytes) return;
    setBusy(true);
    try {
      const result = await db.importSnapshot(importBytes, mode);
      const { undoTx } = result;
      toasts.add({
        title: "Snapshot imported",
        description:
          mode === "merge"
            ? `${result.written} rows were newer than yours.`
            : `${result.written} rows written, ${result.deleted} removed.`,
        ...(undoTx !== null && {
          actionProps: {
            children: "Undo",
            onClick: () => void db.undo(undoTx),
          },
        }),
      });
    } catch (error) {
      toasts.add({
        title: "Import failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setBusy(false);
      setImportBytes(null);
    }
  }

  return (
    <Section title="Data">
      <Row
        label="Export snapshot"
        hint="Downloads all your data as one file. Keep it somewhere safe."
      >
        <Button disabled={busy} onClick={exportSnapshot}>
          Export
        </Button>
      </Row>
      <Row label="Import snapshot" hint="From a file exported here.">
        <Button disabled={busy} onClick={() => fileInput.current?.click()}>
          Import
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".sqlite3,.sqlite,.db,application/vnd.sqlite3"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) setImportBytes(new Uint8Array(await file.arrayBuffer()));
          }}
        />
      </Row>
      <Row
        label="Storage"
        hint={
          persisted === null
            ? "This browser doesn't report whether your data is protected from cleanup."
            : persisted
              ? "Protected: the browser won't clear your data to free space."
              : "Not protected: the browser may clear your data when space runs low. Export regularly."
        }
      >
        {persisted === false && <Button onClick={request}>Protect</Button>}
      </Row>
      <Confirm
        open={importBytes !== null}
        onOpenChange={(open) => !open && setImportBytes(null)}
        title="Import snapshot"
        description="Merge keeps whichever version of each row is newer. Replace makes your data match the file exactly; it can be undone right after."
        actions={[
          { label: "Merge", onClick: () => runImport("merge") },
          {
            label: "Replace everything",
            variant: "danger",
            onClick: () => runImport("replace"),
          },
        ]}
      />
    </Section>
  );
}
