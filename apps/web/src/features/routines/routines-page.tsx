import { Link, useNavigate } from "@tanstack/react-router";
import type { RoutineItem } from "@workout-logger/core";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/button.tsx";
import { listClass, rowClass } from "../../components/list.ts";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { useCommand, useDbQuery } from "../../db/react.tsx";

export function RoutinesPage() {
  const routines = useDbQuery("routines");
  const command = useCommand();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const active = routines.filter((r) => !r.archived);
  const archived = routines.filter((r) => r.archived);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const routineId = await command("createRoutine", { name: trimmed });
    if (routineId) {
      setName("");
      await navigate({ to: "/routines/$routineId", params: { routineId } });
    }
  }

  return (
    <Screen
      header={<PageHeader title="Routines" />}
      scrollId="routines"
      width="medium"
    >
      <p className="px-4 pb-4 text-[0.9375rem] text-ink-muted lg:px-0">
        A routine is a cycle of workout days. Each day lists what to train,
        never how much.
      </p>
      {active.length === 0 ? (
        <Empty>No routines yet. Name your first one below.</Empty>
      ) : (
        <RoutineList routines={active} />
      )}
      <form onSubmit={create} className="flex gap-2 px-4 pt-4 lg:px-0">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New routine, e.g. Upper/Lower"
          aria-label="New routine name"
          className="h-10 min-w-0 flex-1 rounded-lg bg-raised px-3 outline-none ring-1 ring-rule focus:ring-2 focus:ring-ink"
        />
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          Create
        </Button>
      </form>
      {archived.length > 0 && (
        <section className="pt-8">
          <h2 className="px-4 pb-2 font-semibold text-ink-muted lg:px-0">
            Archived
          </h2>
          <RoutineList routines={archived} />
        </section>
      )}
    </Screen>
  );
}

function RoutineList({ routines }: { routines: RoutineItem[] }) {
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
              <p className="truncate text-sm text-ink-muted">
                {r.dayNames.length === 0
                  ? "No days yet"
                  : r.dayNames.join(", ")}
              </p>
            </div>
            <ChevronRight size={18} className="text-ink-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
