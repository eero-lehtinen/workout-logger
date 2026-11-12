import { Link, useNavigate } from "@tanstack/react-router";
import type { RoutineItem } from "@workout-logger/core";
import {
  type CatalogRoutine,
  ROUTINES,
  routineContent,
} from "@workout-logger/exercises";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/button.tsx";
import { SectionHeading } from "../../components/headings.tsx";
import { listClass, rowClass } from "../../components/list.ts";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { useCommand, useDbQuery } from "../../db/react.tsx";
import { dayDotClass } from "../history/day-colors.ts";

export function RoutinesPage() {
  const { t } = useTranslation();
  const routines = useDbQuery("routines");
  const command = useCommand();
  const navigate = useNavigate();
  const active = routines.filter((r) => !r.archived);
  const archived = routines.filter((r) => r.archived);

  /** Opens the editor with the placeholder name selected, to type over. */
  async function create() {
    const routineId = await command("createRoutine", {
      name: t("routines.list.newRoutineName"),
    });
    if (routineId) {
      await navigate({
        to: "/routines/$routineId",
        params: { routineId },
        search: { new: true },
      });
    }
  }

  async function addBuiltin(routine: CatalogRoutine) {
    const routineId = await command(
      "createRoutineWithDays",
      routineContent(routine),
      { undoLabel: t("routines.list.added", { name: routine.name }) },
    );
    if (routineId) {
      await navigate({ to: "/routines/$routineId", params: { routineId } });
    }
  }

  return (
    <Screen
      header={
        <PageHeader
          title={t("routines.list.title")}
          actions={
            <Button variant="ghost" size="sm" onClick={() => void create()}>
              <Plus size={17} />
              {t("routines.list.new")}
            </Button>
          }
        />
      }
      scrollId="routines"
      width="medium"
    >
      {active.length === 0 ? (
        <Empty>{t("routines.list.empty")}</Empty>
      ) : (
        <RoutineList routines={active} />
      )}
      <section className="pt-8">
        <SectionHeading>{t("routines.list.builtin")}</SectionHeading>
        <ul className={listClass}>
          {ROUTINES.map((routine) => (
            <li key={routine.key} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{routine.name}</p>
                <p className="text-sm text-ink-muted">{routine.description}</p>
              </div>
              <Button
                aria-label={t("routines.list.add", { name: routine.name })}
                onClick={() => void addBuiltin(routine)}
              >
                {t("common.add")}
              </Button>
            </li>
          ))}
        </ul>
      </section>
      {archived.length > 0 && (
        <section className="pt-8">
          <SectionHeading>{t("routines.list.archived")}</SectionHeading>
          <RoutineList routines={archived} />
        </section>
      )}
    </Screen>
  );
}

function RoutineList({ routines }: { routines: RoutineItem[] }) {
  const { t } = useTranslation();
  return (
    <ul className={listClass}>
      {routines.map((r) => (
        <li key={r.id}>
          <Link
            to="/routines/$routineId"
            params={{ routineId: r.id }}
            className={`${rowClass} flex items-center gap-3 py-3`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.name}</p>
              {r.description && (
                <p className="line-clamp-2 text-sm">{r.description}</p>
              )}
              {r.dayNames.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  {t("routines.list.noDays")}
                </p>
              ) : (
                <p className="flex flex-wrap gap-x-3 text-sm text-ink-muted">
                  {r.dayNames.map((name, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: the index is the day's place in the cycle
                    <span key={index} className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className={`size-2 shrink-0 rounded-full ${dayDotClass(index)}`}
                      />
                      {name}
                    </span>
                  ))}
                </p>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
