import type { SettingChange } from "@workout-logger/core";
import { useState } from "react";
import { PageHeader, Screen } from "../../components/page.tsx";
import { Segmented } from "../../components/segmented.tsx";
import { parseDuration, parseNumber } from "../../components/stepper.tsx";
import { Switch } from "../../components/switch.tsx";
import { toasts } from "../../components/toasts.tsx";
import { useCommand, useDbQuery } from "../../db/react.tsx";
import { formatDuration } from "../../lib/format.ts";
import { restTimer } from "../../lib/rest-timer.ts";
import { DataSection } from "./data-section.tsx";
import { Row, Section } from "./settings-rows.tsx";

export function SettingsPage() {
  const settings = useDbQuery("settings");
  const command = useCommand();
  const set = (change: SettingChange) => command("setSetting", change);
  const unit = settings.weight_unit;

  return (
    <Screen
      header={<PageHeader title="Settings" />}
      scrollId="settings"
      width="narrow"
    >
      <div className="pb-10">
        <Section title="Units and steps">
          <Row
            label="Weight unit"
            hint="Switching doesn't change your logged weights."
          >
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

        <Section title="Timers">
          <Row label="Rest timer" hint="Counts down after each logged set.">
            <Switch
              label="Rest timer"
              checked={settings.rest_timer_enabled}
              onChange={(value) => {
                if (!value) restTimer.skip();
                void set({ key: "rest_timer_enabled", value });
              }}
            />
          </Row>
          {settings.rest_timer_enabled && (
            <Row label="Rest time" hint="m:ss. Exercises can set their own.">
              <SettingInput
                label="Rest time"
                value={settings.rest_default_s}
                format={formatDuration}
                parse={parseDuration}
                onSave={(value) => set({ key: "rest_default_s", value })}
              />
            </Row>
          )}
          <Row
            label="Session timer"
            hint="Shows how long the running session has lasted."
          >
            <Switch
              label="Session timer"
              checked={settings.session_timer_shown}
              onChange={(value) =>
                void set({ key: "session_timer_shown", value })
              }
            />
          </Row>
        </Section>

        <Section title="Sessions">
          <Row
            label="Idle end (minutes)"
            hint="With no new set for this long, a session ends at its last set."
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
    </Screen>
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
