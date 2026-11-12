import { ALERT_VOLUME_MIN, type SettingChange } from "@workout-logger/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader, Screen } from "../../components/page.tsx";
import { Segmented } from "../../components/segmented.tsx";
import { Slider } from "../../components/slider.tsx";
import { parseDuration, parseNumber } from "../../components/stepper.tsx";
import { Switch } from "../../components/switch.tsx";
import { toasts } from "../../components/toasts.tsx";
import { useCommand, useDbQuery } from "../../db/react.tsx";
import { useLanguage } from "../../i18n/index.ts";
import { formatDuration, numberFormat } from "../../lib/format.ts";
import { keepAwakeSupported } from "../../lib/keep-awake.ts";
import { isNative } from "../../lib/platform.ts";
import { alertGain } from "../../lib/rest-alarm.ts";
import { restTimer } from "../../lib/rest-timer.ts";
import { useTheme } from "../../lib/theme.ts";
import { AboutSection } from "./about-section.tsx";
import { AccountSection } from "./account-section.tsx";
import { DataSection } from "./data-section.tsx";
import { Row, Section } from "./settings-rows.tsx";

export function SettingsPage() {
  const { t } = useTranslation();
  const settings = useDbQuery("settings");
  const command = useCommand();
  const set = (change: SettingChange) => command("setSetting", change);
  const unit = settings.weight_unit;
  const [theme, setTheme] = useTheme();
  const [language, setLanguage] = useLanguage();

  return (
    <Screen
      header={<PageHeader title={t("settings.title")} />}
      scrollId="settings"
      width="narrow"
    >
      <AccountSection />
      <Section title={t("settings.units.title")}>
        <Row label={t("settings.units.weightUnit")}>
          <Segmented
            label={t("settings.units.weightUnit")}
            value={unit}
            options={[
              { value: "kg", label: "kg" },
              { value: "lb", label: "lb" },
            ]}
            onChange={(value) => set({ key: "weight_unit", value })}
          />
        </Row>
        <Row
          label={t("settings.units.weightStepWithUnit", { unit })}
          hint={t("settings.units.weightStepHint")}
        >
          <SettingInput
            label={t("settings.units.weightStep")}
            value={
              unit === "kg"
                ? settings.weight_increment_kg
                : settings.weight_increment_lb
            }
            format={formatDecimal}
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

      <Section title={t("settings.timers.title")}>
        <Row
          label={t("settings.timers.restTimer")}
          hint={t("settings.timers.restTimerHint")}
        >
          <Switch
            label={t("settings.timers.restTimer")}
            checked={settings.rest_timer_enabled}
            onChange={(value) => {
              if (!value) restTimer.skip();
              void set({ key: "rest_timer_enabled", value });
            }}
          />
        </Row>
        {settings.rest_timer_enabled && (
          <Row
            label={t("settings.timers.restTime")}
            hint={t("settings.timers.restTimeHint")}
          >
            <SettingInput
              label={t("settings.timers.restTime")}
              value={settings.rest_default_s}
              format={formatDuration}
              parse={parseDuration}
              onSave={(value) => set({ key: "rest_default_s", value })}
            />
          </Row>
        )}
        {settings.rest_timer_enabled && (
          <Row
            stacked
            fill
            label={t("settings.timers.alertVolume")}
            hint={
              isNative
                ? t("settings.timers.alertVolumeHintNative")
                : t("settings.timers.alertVolumeHintWeb")
            }
          >
            <Slider
              label={t("settings.timers.alertVolume")}
              value={settings.rest_alert_volume}
              min={ALERT_VOLUME_MIN}
              max={100}
              step={5}
              format={(value) =>
                numberFormat({ style: "percent" }).format(value / 100)
              }
              onCommit={(value) => {
                restTimer.previewAlert(alertGain(value));
                void set({ key: "rest_alert_volume", value });
              }}
            />
          </Row>
        )}
        <Row
          label={t("settings.timers.sessionTimer")}
          hint={t("settings.timers.sessionTimerHint")}
        >
          <Switch
            label={t("settings.timers.sessionTimer")}
            checked={settings.session_timer_shown}
            onChange={(value) =>
              void set({ key: "session_timer_shown", value })
            }
          />
        </Row>
        <Row
          label={t("settings.timers.idleEnd")}
          hint={t("settings.timers.idleEndHint")}
        >
          <SettingInput
            label={t("settings.timers.idleEndLabel")}
            value={settings.idle_threshold_s / 60}
            format={formatDecimal}
            parse={(text) => {
              const minutes = parseNumber(text);
              return minutes === null ? null : Math.round(minutes * 60);
            }}
            onSave={(value) => set({ key: "idle_threshold_s", value })}
          />
        </Row>
      </Section>

      <Section title={t("settings.sessions.title")}>
        {keepAwakeSupported && (
          <Row
            label={t("settings.sessions.keepScreenOn")}
            hint={t("settings.sessions.keepScreenOnHint")}
          >
            <Switch
              label={t("settings.sessions.keepScreenOn")}
              checked={settings.keep_screen_awake}
              onChange={(value) =>
                void set({ key: "keep_screen_awake", value })
              }
            />
          </Row>
        )}
        <Row
          label={t("settings.sessions.repLimit")}
          hint={t("settings.sessions.repLimitHint")}
        >
          <SettingInput
            label={t("settings.sessions.repLimit")}
            value={settings.e1rm_rep_cap}
            format={String}
            parse={(text) => {
              const reps = parseNumber(text);
              return reps === null ? null : Math.round(reps);
            }}
            onSave={(value) => set({ key: "e1rm_rep_cap", value })}
          />
        </Row>
        <Row
          label={t("settings.sessions.weekStart")}
          hint={t("settings.sessions.weekStartHint")}
        >
          <Segmented
            label={t("settings.sessions.weekStart")}
            value={settings.week_start}
            options={[
              { value: "monday", label: t("settings.sessions.monday") },
              { value: "sunday", label: t("settings.sessions.sunday") },
            ]}
            onChange={(value) => set({ key: "week_start", value })}
          />
        </Row>
      </Section>

      <Section title={t("settings.appearance.title")}>
        <Row
          stacked
          label={t("settings.appearance.theme")}
          hint={t("settings.appearance.themeHint")}
        >
          <Segmented
            label={t("settings.appearance.theme")}
            value={theme}
            options={[
              { value: "system", label: t("settings.appearance.themeSystem") },
              { value: "light", label: t("settings.appearance.themeLight") },
              { value: "dark", label: t("settings.appearance.themeDark") },
            ]}
            onChange={setTheme}
          />
        </Row>
        <Row
          stacked
          label={t("settings.appearance.language")}
          hint={t("settings.appearance.languageHint")}
        >
          <Segmented
            label={t("settings.appearance.language")}
            value={language}
            options={[
              {
                value: "system",
                label: t("settings.appearance.languageSystem"),
              },
              // Each language by its own name, so it can be found in either.
              { value: "en", label: "English" },
              { value: "fi", label: "Suomi" },
            ]}
            onChange={setLanguage}
          />
        </Row>
      </Section>

      <DataSection />
      <AboutSection />
    </Screen>
  );
}

function formatDecimal(value: number): string {
  return numberFormat({ maximumFractionDigits: 3, useGrouping: false }).format(
    value,
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
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  async function save() {
    if (draft === null) return;
    const value = props.parse(draft);
    setDraft(null);
    if (value === null) {
      toasts.add({
        title: t("common.enterNumber", { field: props.label }),
        type: "error",
      });
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
      className="tabular h-10 w-24 rounded-xl bg-chalk px-3 text-right font-semibold outline-none ring-1 ring-rule focus:ring-2 focus:ring-ink"
    />
  );
}
