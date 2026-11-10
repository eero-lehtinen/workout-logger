import { type SettingKey, type Settings, writeSetting } from "../settings.ts";
import { defineCommand } from "./define.ts";

export type SettingChange = {
  [K in SettingKey]: { key: K; value: Settings[K] };
}[SettingKey];

export const setSetting = defineCommand(
  async (w, args: SettingChange): Promise<void> => {
    await writeSetting(w, args.key, args.value as never);
  },
);
