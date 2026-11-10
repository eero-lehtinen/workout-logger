import { useDbQuery } from "../../db/react.tsx";
import { useKeepAwake } from "../../lib/keep-awake.ts";
import { useRunningSession } from "./running.ts";

/** Keeps the screen on while a session is running, if the setting is on. */
export function KeepScreenAwake() {
  const settings = useDbQuery("settings");
  const running = useRunningSession();
  useKeepAwake(settings.keep_screen_awake && running !== null);
  return null;
}
