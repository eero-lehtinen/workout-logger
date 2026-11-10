import type { Writer } from "../store/write.ts";

export interface CommandContext {
  /** Wall clock in epoch ms. */
  now: number;
  /** IANA zone of the device. */
  tz: string;
}

/** A domain write for the UI. The caller runs it as one write transaction. */
export type CommandDef<Args, Result> = (
  w: Writer,
  args: Args,
  ctx: CommandContext,
) => Promise<Result>;

export function defineCommand<Args, Result>(
  run: CommandDef<Args, Result>,
): CommandDef<Args, Result> {
  return run;
}
