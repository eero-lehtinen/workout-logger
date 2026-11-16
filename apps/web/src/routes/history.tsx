import { createFileRoute } from "@tanstack/react-router";
import type { WeekStart } from "@workout-logger/core";
import * as v from "valibot";
import {
  HistoryPage,
  monthRange,
  shownMonth,
} from "../features/history/history-page.tsx";
import { todayIso } from "../lib/format.ts";

const search = v.object({
  /** The shown month, `YYYY-MM`; the current month if missing. */
  month: v.optional(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}$/))),
  /** The selected day, `YYYY-MM-DD`. */
  day: v.optional(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/))),
});

export const Route = createFileRoute("/history")({
  validateSearch: search,
  loaderDeps: ({ search }) => ({ month: shownMonth(search) }),
  loader: async ({ context, deps: { month } }) => {
    const [settings] = await context.preload(["settings"]);
    const weekStart = settings.week_start as WeekStart;
    const range = monthRange(month, weekStart, todayIso());
    await context.preload(["trainingStats"], ["sessionsInRange", range]);
  },
  component: HistoryPage,
});
