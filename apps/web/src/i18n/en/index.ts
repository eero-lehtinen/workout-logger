import { admin } from "./admin.ts";
import { common } from "./common.ts";
import { exercises } from "./exercises.ts";
import { format } from "./format.ts";
import { history } from "./history.ts";
import { muscles } from "./muscles.ts";
import { privacy } from "./privacy.ts";
import { routines } from "./routines.ts";
import { session } from "./session.ts";
import { settings } from "./settings.ts";
import { shell } from "./shell.ts";
import { ui } from "./ui.ts";

/** The source language: every other language has exactly these keys. */
export const en = {
  admin,
  common,
  exercises,
  format,
  history,
  muscles,
  privacy,
  routines,
  session,
  settings,
  shell,
  ui,
} as const;
