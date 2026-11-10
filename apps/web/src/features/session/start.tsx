import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Link, useNavigate } from "@tanstack/react-router";
import { clsx } from "clsx";
import { useState } from "react";
import { Button } from "../../components/button.tsx";
import { Empty, PageHeader } from "../../components/page.tsx";
import { useCommand, useDbQuery } from "../../db/react.tsx";
import { useRunningSession } from "./running.ts";

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
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Start session"
        back={{ to: "/", label: "Back to today" }}
      />
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
              className="flex gap-2 overflow-x-auto px-4 pb-1 lg:flex-wrap lg:px-0"
            >
              {options.routines.map((r) => (
                <Radio.Root
                  key={r.id}
                  value={r.id}
                  className="h-10 shrink-0 rounded-full border border-rule px-4 font-medium text-ink-muted data-checked:border-ink data-checked:bg-ink data-checked:text-chalk"
                >
                  {r.name}
                </Radio.Root>
              ))}
            </RadioGroup>
          )}
          {routine && (
            <section className="mt-4 px-4 lg:px-0">
              <h2 className="pb-2 text-ink-muted">
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
                <ul className="flex flex-col gap-2">
                  {routine.days.map((day) => {
                    const next = day.id === routine.nextDayId;
                    return (
                      <li key={day.id}>
                        <button
                          type="button"
                          disabled={starting}
                          onClick={() => start(day.id)}
                          className={clsx(
                            "flex min-h-16 w-full items-center gap-3 rounded-xl px-4 text-left transition-colors",
                            next
                              ? "bg-ink text-chalk hover:bg-ink/90"
                              : "bg-raised ring-1 ring-rule hover:bg-surface",
                          )}
                        >
                          <span className="flex-1 text-lg font-semibold">
                            {day.name}
                          </span>
                          {next && (
                            <span className="text-sm opacity-80">Next</span>
                          )}
                          {day.id === routine.lastDayId && (
                            <span className="text-sm text-ink-muted">
                              Last time
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      <div className="mt-6 px-4 lg:px-0">
        <Button
          className="w-full"
          disabled={starting}
          onClick={() => start(null)}
        >
          Start ad hoc session
        </Button>
      </div>
    </div>
  );
}
