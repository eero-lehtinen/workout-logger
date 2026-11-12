import { serve } from "@hono/node-server";
import { githubReleases } from "./android-release.ts";
import { createApp } from "./app.ts";
import { readConfig } from "./config.ts";
import { startJobs } from "./jobs.ts";
import { dailyCopyJob, openServer, pruneUsageJob } from "./startup.ts";

const config = readConfig();
const { database, auth, backups, limitCache } = await openServer(config);
const stopJobs = await startJobs(database.db, [
  pruneUsageJob(database.db),
  ...(backups ? [dailyCopyJob(database.db, backups)] : []),
]);

const app = createApp({
  webRoot: config.webRoot,
  bundleRoot: config.bundleRoot,
  commit: config.commit,
  releases: config.releases ? githubReleases(config.releases) : undefined,
  db: database.db,
  auth,
  limitCache,
  databasePath: config.databasePath,
  backups,
  litestreamSocket: config.litestreamSocket,
  minClientVersion: config.minClientVersion,
});

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Serving ${config.webRoot} on port ${info.port}`);
  for (const provider of config.signInMissing) {
    console.warn(`No ${provider} OAuth client configured: its sign-in is off`);
  }
});

// Node as PID 1 ignores SIGTERM unless handled, so `docker stop` would wait
// for its timeout and then kill the process.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopJobs();
    server.close(async () => {
      await database.close();
      process.exit(0);
    });
  });
}
