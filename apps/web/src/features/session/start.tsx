import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { chipClass } from "../../components/chip.tsx";
import { SectionHeading } from "../../components/headings.tsx";
import { listClass, rowClass } from "../../components/list.ts";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { useCommand, useDbQuery } from "../../db/react.tsx";
import { exerciseSummary } from "../exercises/name.ts";
import { dayDotClass } from "../history/day-colors.ts";
import { useRunningSession } from "./running.ts";

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
          <span className="block truncate text-sm text-ink-muted">
            {props.subtitle}
          </span>
        )}
      </span>
      {props.note}
    </button>
  );
}

export function StartPage() {
  const { t } = useTranslation();
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
      // In place of the start screen, so back from the session goes to Today.
      await navigate({
        to: "/sessions/$sessionId",
        params: { sessionId },
        replace: true,
      });
    }
  }

  return (
    <Screen
      header={
        <PageHeader
          title={t("session.start.title")}
          back={{ to: "/", label: t("session.backToToday") }}
        />
      }
      scrollId="start"
      width="narrow"
      align="bottom"
    >
      {running && (
        <p className="mx-4 mb-3 rounded-2xl bg-surface px-4 py-3 text-[0.9375rem] lg:mx-0">
          <Trans
            i18nKey="session.start.stillRunning"
            components={{
              a: (
                <Link
                  to="/sessions/$sessionId"
                  params={{ sessionId: running.id }}
                  className="font-semibold underline underline-offset-2"
                />
              ),
            }}
          />
        </p>
      )}

      {options.routines.length === 0 ? (
        <Empty>
          <Trans
            i18nKey="session.start.noRoutines"
            components={{
              a: (
                <Link
                  to="/routines"
                  className="font-semibold text-ink underline underline-offset-2"
                />
              ),
            }}
          />
        </Empty>
      ) : (
        <>
          {options.routines.length > 1 && (
            <RadioGroup
              aria-label={t("session.start.routine")}
              value={routine?.id ?? null}
              onValueChange={(value) => setRoutineId(value as string)}
              className="flex flex-wrap gap-2 px-4 lg:px-0"
            >
              {options.routines.map((r) => (
                <Radio.Root key={r.id} value={r.id} className={chipClass("md")}>
                  {r.name}
                </Radio.Root>
              ))}
            </RadioGroup>
          )}
          {routine && (
            <section className="pt-4 first:pt-0">
              <SectionHeading>
                {options.routines.length === 1
                  ? routine.name
                  : t("session.start.pickDay")}
              </SectionHeading>
              {routine.days.length === 0 ? (
                <Empty>
                  <Trans
                    i18nKey="session.start.noDays"
                    components={{
                      a: (
                        <Link
                          to="/routines/$routineId"
                          params={{ routineId: routine.id }}
                          className="font-semibold text-ink underline underline-offset-2"
                        />
                      ),
                    }}
                  />
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
                        subtitle={
                          day.exercises.length > 0
                            ? exerciseSummary(day.exercises)
                            : t("session.start.noExercises")
                        }
                        note={
                          day.id === routine.nextDayId ? (
                            <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-sm font-medium">
                              {t("session.start.next")}
                            </span>
                          ) : (
                            day.id === routine.lastDayId && (
                              <span className="shrink-0 text-sm text-ink-muted">
                                {t("session.start.lastTime")}
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
        <SectionHeading>{t("session.start.withoutRoutine")}</SectionHeading>
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
              title={t("session.adHocSession")}
              subtitle={t("session.start.adHocHint")}
            />
          </li>
        </ul>
      </section>
    </Screen>
  );
}
