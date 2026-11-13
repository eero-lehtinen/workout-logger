import { Cron } from "croner";
import type { ServerKysely } from "./db/database.ts";

export interface Job {
  name: string;
  /** Cron pattern, UTC. */
  schedule: string;
  /** A run is due at startup when the last good run is older than this. */
  maxAgeMs: number;
  run(): Promise<void>;
}

export interface JobState {
  lastRunAt: number;
  lastOkAt: number | null;
  lastError: string | null;
}

export async function readJob(
  db: ServerKysely,
  name: string,
): Promise<JobState | null> {
  const row = await db
    .selectFrom("job_run")
    .selectAll()
    .where("name", "=", name)
    .executeTakeFirst();
  return row
    ? {
        lastRunAt: row.last_run_at,
        lastOkAt: row.last_ok_at,
        lastError: row.last_error,
      }
    : null;
}

/** Runs `job` once and records the outcome. Never throws. */
export async function runJob(
  db: ServerKysely,
  job: Job,
  now: () => number = Date.now,
): Promise<boolean> {
  const startedAt = now();
  let error: string | null = null;
  try {
    await job.run();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error(`Job ${job.name} failed:`, e);
  }
  const ok = error === null;
  await db
    .insertInto("job_run")
    .values({
      name: job.name,
      last_run_at: startedAt,
      last_ok_at: ok ? startedAt : null,
      last_error: error,
    })
    .onConflict((oc) =>
      oc.column("name").doUpdateSet((eb) => ({
        last_run_at: startedAt,
        last_ok_at: ok ? startedAt : eb.ref("job_run.last_ok_at"),
        last_error: error,
      })),
    )
    .execute();
  return ok;
}

/**
 * Schedules the jobs in-process (docs/deployment.md#scheduled-jobs). A job
 * whose last good run is too old, e.g. after downtime over its slot, also
 * runs right away. Those catch-up runs go one at a time in the order of
 * `jobs`, so the restore rehearsal restores the copy caught up before it.
 */
export async function startJobs(
  db: ServerKysely,
  jobs: readonly Job[],
  now: () => number = Date.now,
): Promise<{ stop: () => void; caughtUp: Promise<void> }> {
  const crons = jobs.map(
    (job) =>
      new Cron(job.schedule, { timezone: "UTC", protect: true }, async () => {
        await runJob(db, job, now);
      }),
  );
  const due: Job[] = [];
  for (const job of jobs) {
    const state = await readJob(db, job.name);
    if (!state?.lastOkAt || now() - state.lastOkAt > job.maxAgeMs) {
      due.push(job);
    }
  }
  const caughtUp = (async () => {
    for (const job of due) await runJob(db, job, now);
  })();
  return {
    caughtUp,
    stop: () => {
      for (const cron of crons) cron.stop();
    },
  };
}
