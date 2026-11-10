import type { Kysely } from "kysely";
import * as v from "valibot";
import { DEFAULT_E1RM_REP_CAP } from "./domain/e1rm.ts";
import { DEFAULT_IDLE_THRESHOLD_MS } from "./domain/session-end.ts";
import { DEFAULT_WEIGHT_INCREMENT } from "./domain/units.ts";
import type { Database } from "./schema/tables.ts";
import type { Writer } from "./store/write.ts";

const number = (min: number, max: number) =>
  v.pipe(v.number(), v.minValue(min), v.maxValue(max));
const integer = (min: number, max: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));

/**
 * User settings, one `setting` row per key with the value as JSON. A missing
 * or invalid value (e.g. written by a newer app) reads as the default.
 */
export const SETTINGS = {
  weight_unit: { schema: v.picklist(["kg", "lb"]), default: "kg" },
  /** The +/- step for exercises without their own increment, per display unit. */
  weight_increment_kg: {
    schema: number(0.01, 100),
    default: DEFAULT_WEIGHT_INCREMENT.kg,
  },
  weight_increment_lb: {
    schema: number(0.01, 200),
    default: DEFAULT_WEIGHT_INCREMENT.lb,
  },
  rest_default_s: { schema: integer(0, 3600), default: 120 },
  rest_timer_enabled: { schema: v.boolean(), default: true },
  /** How loud the end-of-rest alert is, relative to the device's own volume. */
  rest_alert_volume: {
    schema: v.picklist(["low", "medium", "high"]),
    default: "high",
  },
  /** Display only: sessions keep their start and end times either way. */
  session_timer_shown: { schema: v.boolean(), default: true },
  /** Keeps the screen on while a session is running. */
  keep_screen_awake: { schema: v.boolean(), default: false },
  idle_threshold_s: {
    schema: integer(60, 24 * 3600),
    default: DEFAULT_IDLE_THRESHOLD_MS / 1000,
  },
  e1rm_rep_cap: { schema: integer(1, 30), default: DEFAULT_E1RM_REP_CAP },
  /** The calendar's first column and where weekly stats split. */
  week_start: {
    schema: v.picklist(["monday", "sunday"]),
    default: "monday",
  },
} as const satisfies Record<
  string,
  { schema: v.GenericSchema; default: unknown }
>;

export type SettingKey = keyof typeof SETTINGS;

export type Settings = {
  -readonly [K in SettingKey]: v.InferOutput<(typeof SETTINGS)[K]["schema"]>;
};

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function defaultSettings(): Settings {
  const settings: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) settings[key] = SETTINGS[key].default;
  return settings as Settings;
}

export async function readSettings(db: Kysely<Database>): Promise<Settings> {
  const rows = await db
    .selectFrom("setting")
    .select(["id", "value_json"])
    .where("id", "in", SETTING_KEYS)
    .where("deleted", "=", 0)
    .execute();
  const settings: Record<string, unknown> = defaultSettings();
  for (const { id, value_json } of rows) {
    const schema: v.GenericSchema = SETTINGS[id as SettingKey].schema;
    const parsed = v.safeParse(schema, parseJson(value_json));
    if (parsed.success) settings[id] = parsed.output;
  }
  return settings as Settings;
}

function parseJson(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

export async function writeSetting<K extends SettingKey>(
  w: Writer,
  key: K,
  value: Settings[K],
) {
  const schema: v.GenericSchema = SETTINGS[key].schema;
  const valid = v.parse(schema, value);
  await w.put("setting", key, { value_json: JSON.stringify(valid) });
}
