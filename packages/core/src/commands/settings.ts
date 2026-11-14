import type { IsoDate } from "../domain/calendar.ts";
import { addReset, removeReset } from "../domain/record-eras.ts";
import {
  readSettings,
  type SettingKey,
  type Settings,
  writeSetting,
} from "../settings.ts";
import { defineCommand } from "./define.ts";

export type SettingChange = {
  [K in SettingKey]: { key: K; value: Settings[K] };
}[SettingKey];

export const setSetting = defineCommand(
  async (w, args: SettingChange): Promise<void> => {
    await writeSetting(w, args.key, args.value as never);
  },
);

/** Reads the list in the transaction, so two quick changes don't lose one. */
export const addRecordReset = defineCommand(
  async (w, args: { date: IsoDate }): Promise<void> => {
    const { record_resets } = await readSettings(w.db);
    await writeSetting(w, "record_resets", addReset(record_resets, args.date));
  },
);

export const removeRecordReset = defineCommand(
  async (w, args: { date: IsoDate }): Promise<void> => {
    const { record_resets } = await readSettings(w.db);
    await writeSetting(
      w,
      "record_resets",
      removeReset(record_resets, args.date),
    );
  },
);
