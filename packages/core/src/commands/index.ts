import type { CommandDef } from "./define.ts";
import * as exercises from "./exercises.ts";
import * as routines from "./routines.ts";
import * as sessions from "./sessions.ts";
import * as settings from "./settings.ts";

/** Every command the UI can run, by name. */
export const COMMANDS = {
  startSession: sessions.startSession,
  endSession: sessions.endSession,
  resumeSession: sessions.resumeSession,
  deleteSession: sessions.deleteSession,
  updateSessionNotes: sessions.updateSessionNotes,
  updateSessionExerciseNotes: sessions.updateSessionExerciseNotes,
  addSessionExercise: sessions.addSessionExercise,
  substituteExercise: sessions.substituteExercise,
  removeSessionExercise: sessions.removeSessionExercise,
  moveSessionExercise: sessions.moveSessionExercise,
  logSet: sessions.logSet,
  updateSet: sessions.updateSet,
  deleteSet: sessions.deleteSet,
  createRoutine: routines.createRoutine,
  createRoutineWithDays: routines.createRoutineWithDays,
  updateRoutine: routines.updateRoutine,
  duplicateRoutine: routines.duplicateRoutine,
  deleteRoutine: routines.deleteRoutine,
  moveRoutine: routines.moveRoutine,
  addDay: routines.addDay,
  duplicateDay: routines.duplicateDay,
  renameDay: routines.renameDay,
  deleteDay: routines.deleteDay,
  moveDay: routines.moveDay,
  addSlot: routines.addSlot,
  setSlotExercise: routines.setSlotExercise,
  updateSlot: routines.updateSlot,
  deleteSlot: routines.deleteSlot,
  moveSlot: routines.moveSlot,
  addAlternative: routines.addAlternative,
  deleteAlternative: routines.deleteAlternative,
  createExercise: exercises.createExercise,
  updateExercise: exercises.updateExercise,
  setSetting: settings.setSetting,
} satisfies Record<string, CommandDef<never, unknown>>;

export type Commands = typeof COMMANDS;
export type CommandName = keyof Commands;
export type CommandArgs<N extends CommandName> = Parameters<Commands[N]>[1];
export type CommandResult<N extends CommandName> = Awaited<
  ReturnType<Commands[N]>
>;

export type { CommandContext, CommandDef } from "./define.ts";
export {
  type ExerciseFields,
  InvalidMuscleTargetsError,
  type MuscleTargets,
} from "./exercises.ts";
export type { RoutineContent } from "./routines.ts";
export type { SettingChange } from "./settings.ts";
