import { readSettings, type Settings } from "../settings.ts";
import { defineQuery } from "./define.ts";

export const settings = defineQuery(
  ["setting"],
  (db): Promise<Settings> => readSettings(db),
);
