import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";
import { HistoryPage } from "../features/history/history-page.tsx";

const search = v.object({
  /** The shown month, `YYYY-MM`; the current month if missing. */
  month: v.optional(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}$/))),
  /** The selected day, `YYYY-MM-DD`. */
  day: v.optional(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/))),
});

export const Route = createFileRoute("/history")({
  validateSearch: search,
  component: HistoryPage,
});
