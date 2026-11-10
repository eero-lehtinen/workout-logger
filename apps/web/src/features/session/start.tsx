import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { listClass, rowClass } from "../../components/list.ts";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { useCommand, useDbQuery } from "../../db/react.tsx";
import { dayDotClass } from "../history/day-colors.ts";
import { useRunningSession } from "./running.ts";

const headingClass = "px-4 pb-2 font-semibold text-ink-muted lg:px-0";

/** A row that starts a session when tapped. */
function StartRow(props: {
  title: string;
  subtitle?: string;
  mark: ReactNode;
  note?: ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={`${rowClass} flex min-h-14 w-full items-center gap-3 py-3 text-left`}
    >
      {props.mark}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{props.title}</span>
        {props.subtitle && (
          <span className="block text-sm text-ink-muted">{props.subtitle}</span>
        )}
      </span>
      {props.note}
      <ChevronRight size={18} className="shrink-0 text-ink-muted" />
    </button>
  );
}

export function StartPage() {
  const options = useDbQuery("startOptions");
  const running = useRunningSession();
  const command = useCommand();
  const navigate = useNavigate();
  const [routineId, setRoutineId] = useState(options.preselectedRoutineId);
  const [starting, setStarting] = useState(false);
  const routine =
    options.routines.find((r) => r.id === routineId) ?? options.routines[0];

  async function start(dayId: string | null) {
    if (starting) return;
    setStarting(true);
    const sessionId = await command("startSession", {
      routineId: dayId ? (routine?.id ?? null) : null,
      dayId,
    });
    setStarting(false);
    if (sessionId) {
      await navigate({ to: "/sessions/$sessionId", params: { sessionId } });
    }
  }

  return (
    <Screen
      header={
        <PageHeader
          title="Start session"
          back={{ to: "/", label: "Back to today" }}
        />
      }
      scrollId="start"
      width="narrow"
    >
      {running && (
        <p className="mx-4 mb-3 rounded-xl bg-surface px-4 py-3 text-[0.9375rem] lg:mx-0">
          A session is still running.{" "}
          <Link
            to="/sessions/$sessionId"
            params={{ sessionId: running.id }}
            className="font-semibold underline underline-offset-2"
          >
            Continue it
          </Link>{" "}
          instead?
        </p>
      )}

      {options.routines.length === 0 ? (
        <Empty>
          No routines yet.{" "}
          <Link
            to="/routines"
            className="font-semibold text-ink underline underline-offset-2"
          >
            Create one
          </Link>
          , or start an ad hoc session.
        </Empty>
      ) : (
        <>
          {options.routines.length > 1 && (
            <RadioGroup
              aria-label="Routine"
              value={routine?.id ?? null}
              onValueChange={(value) => setRoutineId(value as string)}
              className="flex flex-wrap gap-2 px-4 lg:px-0"
            >
              {options.routines.map((r) => (
                <Radio.Root
                  key={r.id}
                  value={r.id}
                  className="h-10 shrink-0 rounded-full border border-rule px-4 font-medium text-ink-muted data-checked:border-ink/60 data-checked:bg-raised data-checked:text-ink"
                >
                  {r.name}
                </Radio.Root>
              ))}
            </RadioGroup>
          )}
          {routine && (
            <section className="pt-4">
              <h2 className={headingClass}>
                {options.routines.length === 1 ? routine.name : "Pick a day"}
              </h2>
              {routine.days.length === 0 ? (
                <Empty>
                  This routine has no days.{" "}
                  <Link
                    to="/routines/$routineId"
                    params={{ routineId: routine.id }}
                    className="font-semibold text-ink underline underline-offset-2"
                  >
                    Add some
                  </Link>
                  .
                </Empty>
              ) : (
                <ul className={listClass}>
                  {routine.days.map((day, dayIndex) => (
                    <li key={day.id}>
                      <StartRow
                        disabled={starting}
                        onClick={() => start(day.id)}
                        mark={
                          <span
                            aria-hidden
                            className={`size-3 shrink-0 rounded-full ${dayDotClass(dayIndex)}`}
                          />
                        }
                        title={day.name}
                        note={
                          day.id === routine.nextDayId ? (
                            <span className="rounded-full bg-surface px-2 py-0.5 text-sm font-medium">
                              Next
                            </span>
                          ) : (
                            day.id === routine.lastDayId && (
                              <span className="text-sm text-ink-muted">
                                Last time
                              </span>
                            )
                          )
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      <section className="pt-6">
        <h2 className={headingClass}>Without a routine</h2>
        <ul className={listClass}>
          <li>
            <StartRow
              disabled={starting}
              onClick={() => start(null)}
              mark={
                <Plus
                  size={16}
                  aria-hidden
                  className="-mx-0.5 text-ink-muted"
                />
              }
              title="Ad hoc session"
              subtitle="Add exercises as you go"
            />
          </li>
        </ul>
      </section>
    </Screen>
  );
}
