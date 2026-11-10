import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { githubReleases } from "./android-release.ts";
import { createApp } from "./app.ts";

const port = Number(process.env.PORT ?? 3000);
const webRoot =
  process.env.WEB_ROOT ??
  fileURLToPath(new URL("../../web/dist", import.meta.url));

const releasesToken = process.env.GITHUB_RELEASES_TOKEN;

const app = createApp({
  webRoot,
  commit: process.env.GIT_COMMIT || undefined,
  releases: releasesToken
    ? githubReleases({
        repository:
          process.env.GITHUB_RELEASES_REPOSITORY ??
          "eero-lehtinen/workout-logger",
        token: releasesToken,
      })
    : undefined,
});

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Serving ${webRoot} on port ${info.port}`);
});

// Node as PID 1 ignores SIGTERM unless handled, so `docker stop` would wait
// for its timeout and then kill the process.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
