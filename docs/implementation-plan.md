# Implementation plan

Order of work from an empty repo to the full feature set. Phases are ordered by:

1. risk first (spikes),
2. then a usable vertical slice,
3. then breadth.

Update this file as phases complete or the plan changes. Mark completed phases
`[done]` and record deviations in the relevant design doc.

Sizes are relative: S ≈ a few sessions, M ≈ one to two weeks of evenings,
L ≈ several weeks.

These are human estimates. AI agents can do large phases very quickly.

## Milestones

| Milestone | After phase | Meaning |
| --- | --- | --- |
| **M1: FitNotes replaced** | 9 | Android app with a reliable rest timer, sync between phone and web, server backups running, history and records. Workouts are logged only here from now on. |
| **M2: other users** | 11 | Google sign-in, sign-up up to an account cap, quotas, admin, account deletion. |

Both milestones are reached and every phase is done. What's left is in
[future work](#future-work).

## Phase 0: Scaffolding (S) [done]

- pnpm workspace with the layout from [architecture.md](architecture.md#repository-layout).
- TypeScript strict, ESM, a shared `tsconfig`.
- Lint/format: Biome.
- Tests: Vitest.
- GitHub Actions: install, lint, typecheck, test, build on every push and PR.
- `apps/web`: Vite + React + Tailwind + TanStack Router "hello" page.
- AGENTS.md: fill in the Commands section.

**Exit:** CI green on `main`. `pnpm dev` serves the web app.

## Phase 1: Spikes (S each, in parallel) [done]

Throwaway code in a `spikes/` directory, deleted once the findings are recorded
in the design docs.

1. **RestTimer plugin** [done]. A minimal Capacitor app with a Kotlin plugin: an exact alarm, a short alert sound, and a vibrator.
   - Test matrix on your phone: music playing (Spotify), silent mode, DND, screen locked, app swiped away, exact-alarm permission revoked.
   - Exit: all pass, or the failures are documented with a workaround.
   - Result: all pass with a FitNotes-style countdown service instead of an exact alarm. Design and results in [architecture.md](architecture.md#rest-timer).
2. **SQLite WASM storage** [done]. The official build with the OPFS SAH-pool VFS in a worker. Test in Chrome, Firefox, and the Android WebView inside the Capacitor app:
   - persistence across reload, app restart, and app update;
   - `navigator.storage.persist()`;
   - Web Lock tab ownership;
   - the "don't wipe on init failure" option.
   - Exit: the [architecture.md](architecture.md#client-runtime) assumptions are confirmed, or the native-plugin fallback is chosen.
   - Result: confirmed, no native fallback. Findings are in [architecture.md](architecture.md#client-runtime).
3. **FitNotes schema** [done]. Dump your `.fitnotes` backup's tables and columns, and fill in the mapping in [fitnotes-import.md](fitnotes-import.md).

Health Connect and charting spikes are deferred to their phases; they are lower risk.

## Phase 2: Core foundations (M) [done]

`packages/core`, all unit-tested on Node.

- **DB access:**
  - a `Driver` interface over SQLite;
  - a WASM driver (worker, browser) and a better-sqlite3 driver (Node tests, CLI);
  - Kysely on top.
- **Migration framework:**
  - version steps with DDL and row `upgrade` functions;
  - the runner, with a pre-migration copy hook;
  - fixture test helpers ([migrations.md](migrations.md)).
- **Schema v1:** all tables from [architecture.md](architecture.md#data-model-client), plus `_outbox`, `_sync_state`, and the undo stack.
- **Sync primitives:**
  - the HLC;
  - the write API (stamping, outbox, undo record, table-change events);
  - the apply function (LWW, upgrade, outbox drop);
  - deterministic writes.
- **Sync fuzz test** against an in-memory server model ([sync.md](sync.md#testing)). The server push/pull logic lives in a module shared with the real server, so the test exercises the real code.
- **Domain logic** as pure functions:
  - e1RM and progress markers
  - prefill
  - next day
  - effective session end
  - units and rounding
- **`packages/exercises`:**
  - the muscle list;
  - a curated seed from free-exercise-db (license checked), with factors;
  - the seeding routine.

**Exit:** the fuzz test converges over thousands of random runs. Domain functions have tests for every rule in [features.md](features.md#progress-markers).

Result: 5000 runs of up to 150 operations converge. The fuzz test found that a
device pushing before its first pull couldn't detect a server restore; push
responses now carry the epoch ([sync.md](sync.md#push)). Module layout is in
[architecture.md](architecture.md#repository-layout).

## Phase 3: Logging slice, web (M–L) [done]

- DB worker in the web app with the VFS options and Web Lock tab ownership from [architecture.md](architecture.md#client-runtime), and the TanStack Query table-tag invalidation.
- Component library choice: Base UI ([architecture.md](architecture.md#tech-stack)).
- Screens:
  - start session: routine preselect, day highlight, ad hoc;
  - session view: exercise list, done state, add/remove/reorder, session timer;
  - exercise view: entry with prefill and steppers, previous performance with tap-to-copy, markers, edit/delete sets;
  - substitution picker;
  - minimal routine editor: routines, days, slots, alternatives;
  - minimal exercise browser and custom exercise creation;
  - settings: units, weight steps, rest default, idle end, e1RM rep limit.
- Web rest timer (in-page).
- Snapshot export/import (file) and the undo snackbar.
- PWA: installable, offline, updates applied when no session is running.
- Frontend tests: Storybook stories of every screen as browser tests, Playwright end-to-end tests of persistence, tab ownership, and offline use ([architecture.md](architecture.md#testing)).

**Exit:** a full real workout logged in the phone's browser; the data survives reload and offline use.

Result: every screen above is built, plus the web rest timer, snapshot
export and import, undo, and the PWA. Storybook stories cover every screen
at phone and PC widths in both themes, with accessibility checks, and
Playwright tests cover persistence, the tab handoff, and offline use of the
production build. Review in a PC browser led to fixed screen headers with
only the body scrolling, drag reordering, in-place set editing, marker
explanations, and calmer warm visuals ([architecture.md](architecture.md)).

## Phase 4: Static hosting (S) [done]

Host the static web build over HTTPS on the VPS, so the phone can use it: the
part of phase 6's deployment that doesn't need the server.

Result: served at <https://lift.eerolehtinen.fi>, deployed on every push to
`main` ([deployment.md](deployment.md)).

## Phase 5: Android app (M) [done]

- `apps/android`: Capacitor shell over the web build, with the scheme, hostname, and app id fixed as in [architecture.md](architecture.md#storage-durability).
- RestTimer plugin as designed in [architecture.md](architecture.md#rest-timer): the countdown service with its live notification, start/adjust/cancel, the alert.
- Keep-awake toggle, on-device snapshots after each session, `allowBackup=false`.
- CI: APK build on tags, attached to the GitHub release; an in-app update check.

**Exit:** the release APK installs on the phone, and the rest timer passes the phase 1 test matrix in the real app.

Result: released as `v0.1.0` to `v0.1.2`, installed on the owner's phone
from the release APK, and updated in place through the app's update prompt.
The repository is private, so the update check goes through the server
instead of GitHub directly ([deployment.md](deployment.md#android-releases)).
`minSdk` is 30, the keep-screen-on setting also works in browsers, and an
alert volume setting was added ([architecture.md](architecture.md#app-shell)).

Checked on the phone (Android 16, WebView 157): the database survives
installs over the top and background and resume; the service, countdown
notification, and alert work in the foreground and with the phone locked
(alert 20 ms after the end); keep-screen-on; snapshot files. Device testing
found and fixed two bugs: a `resume` without a `freeze` left the app waiting
for its own database lock, and the update download was answered by the web
app's service worker in the phone's browser.

## Phase 6: Server, sync, deployment (L) [done]

Owner-only at first; multi-user hardening is phase 11.

- `apps/server`: Hono on Node, better-sqlite3 + Kysely, server migrations with the pre-migration R2 copy.
- **Auth:** Better Auth with GitHub sign-in only (no passwords), web cookies, the Android bearer token in secure storage, `server create-owner`.
- **Sync:**
  - `v1` push/pull/snapshot using the shared module from phase 2;
  - head table, epoch, `server new-epoch`, schema-version guard, `MIN_CLIENT_VERSION`.
- **Client sync loop:**
  - triggers, status UI (last sync, unsynced count, errors), clock repair;
  - the login/logout/merge flows from [accounts.md](accounts.md#without-an-account).
- **Deployment** (the image, GHCR, and the CI deploy with pinned SHAs exist since phase 4):
  - a bundle step for the server once it imports workspace packages ([deployment.md](deployment.md#build-and-release));
  - the `data` volume, and `litestream-init` and `litestream` in `deploy/compose.yaml`;
  - R2 buckets and tokens;
  - Litestream config (14-day retention).
- **Backups:**
  - daily DB copy job;
  - backup fields in `/api/status`;
  - external uptime monitor;
  - owner warning badges.

**Exit:** phone and web stay in sync. You've rehearsed the "VPS lost" procedure once.

Result: sign-in is GitHub only, instead of email
and password: the Android app signs in through a Custom Tab and a deep link
([accounts.md](accounts.md#login)). The Playwright suite syncs two browser
devices through the real server. The restore rehearsal job moved to phase
11b.

## Phase 7: History, records, calendar (M) [done]

- Charting spike: try 2 libraries on real data and pick one. Record the choice in [architecture.md](architecture.md#tech-stack).
- Exercise history graph, records table.
- Calendar and frequency analytics ([features.md](features.md#calendar-and-frequency)).
- Routine editor polish: duplicate, archive, slot notes, rest overrides.

Result: ECharts over uPlot, both built against the same chart API and
compared on the owner's FitNotes history converted to a snapshot
([architecture.md](architecture.md#charts)). Review on that data replaced
volume and per-session totals with sets per week, and days per muscle group
with weighted sets per week ([features.md](features.md#calendar-and-frequency)).
The history graph got trend lines that refit on zoom, one line per set
number for every set's e1RM, and a period that filters the whole page; view
choices are remembered on the device. Exercises open their history screen;
a History tab holds the calendar and the frequency stats; past sessions open
read-only.
Only routines can be archived: days and slots have no archived flag, and
deleting them is undoable. Dates use `Temporal`, so everything needs Node 26.

## Phase 9: FitNotes import (S–M) [done]

- A private conversion script, outside this repo, that turns the owner's backup into a snapshot ([fitnotes-import.md](fitnotes-import.md)). No import in the app or the CLI: only the owner has FitNotes history.
- Curate the mapping by hand: chart each exercise's progression to find technique or equipment changes to split by date, fix inconsistent names, and merge duplicates ([fitnotes-import.md](fitnotes-import.md#exercise-mapping)).
- Convert a backup taken on cutover day, check set counts, sessions, and best e1RM against it, and import the snapshot with Settings → Import snapshot.

**Exit:** **M1.** A full real workout logged on the phone, including the phase 3 check that the data survives reload and offline use. You've stopped using FitNotes.

Result: the conversion and the mapping are in the private
`workout-logger-fitnotes` repo; on the owner's 2026-11-10 backup it matches
FitNotes per exercise on set count, session count, and best e1RM. No
further import is planned. The owner has cut over and logs real workouts on
the phone; the bugs found in use were small.

## Phase 9b: Android live updates (S) [done]

- The Android app downloads newer web builds from the server and runs them from the same origin, so web changes, including schema migrations, need no APK release.
- A bundle declares the oldest native shell it works with; a bundle that fails to start rolls back.

**Exit:** a push to `main` reaches the phone without installing an APK, and a broken bundle rolls back on the phone.

Result ([architecture.md](architecture.md#live-updates),
[deployment.md](deployment.md#live-updates)): the Capawesome live-update
plugin, a signed bundle in the server image, its endpoints, and the app's
check and rollback handling. `v0.5.0` is the first APK with the plugin.

## Phase 11: Multi-user (M) [done]

- The server keeps only the newest version of each row, about a third of the database size; history comes from backups.
- Google sign-in instead of GitHub, which stays behind a flag.
- Open sign-up up to an account cap sized from the R2 free tier, with a privacy notice. No invites.
- Rate limits (per-IP before auth, per user after), body limits, trusted proxy configuration.
- Quotas and their exemptions, the usage table and pruning, usage shown to the user, the owner admin page (users, usage, quotas, disable).
- Account deletion with stated retention. Data export already exists (Settings → Export snapshot).

**Exit:** **M2.** Google sign-in works on the live server, on the web and in the Android app.

Result ([accounts.md](accounts.md), [sync.md](sync.md#server-side),
[deployment.md](deployment.md#configuration)): the server offers only
Google sign-in, and the owner's account signs in with it on the web and in
the Android app. Sign-up is open up to the account cap. Requests are rate
limited, pushes and snapshots count against per-user quotas, the owner's
admin page shows the server and every account, and users can delete their
accounts. No one else has been invited.

## Phase 11b: Backup checks (S) [done]

Moved out of phase 11: they protect the owner's backups, not other users.

- Daily restore rehearsals of the newest daily copy and of the Litestream replica.
- A daily check that the R2 buckets and tokens are separate.

Result ([backups.md](backups.md#restore-rehearsal),
[storage isolation](backups.md#storage-isolation)): three daily server jobs,
each with a row on the admin page; a failed run makes `backupsOk` false at
once and shows the warning dot. The rehearsals run monthly in the design
were made daily, since they cost a few R2 requests. The replica's rehearsal
runs `litestream restore` in the app container with a read-only token. The
planned warning for an on-device snapshot older than 7 days was dropped:
snapshots are written only when a session ends, so their age alone says
nothing.

## Future work

Not scheduled. When work on an item starts, give it a phase above.

### Measurements (M)

- Metrics and measurements UI with manual entry.
- Health Connect import (plugin choice, permissions, history access, deterministic writes).
- Combined chart: stacked panels and normalized overlay, smoothing.

### CLI (S–M)

- `apps/cli`: `login`, `pull` (mirror via the same sync client and migrations), `sessions`, `exercise`, `measurements`, `export`, `sql`, `backup`, `restore`.
- API keys in the app settings, with read and write scopes.

### Analytics

- Analytics page: weekly weighted sets per muscle over time, durations, PR list.
- Year heatmap, scatter plots, relative strength.

### Other

- Multi-step undo/redo, kg/lb display polish.
- Server push notifications (SSE) instead of polling.
- Prepared-statement cache in the client drivers (`node-driver.ts`, `wasm-driver.ts`), keyed by SQL with a bounded LRU. Measured on synthetic data: applying a 30k-row snapshot drops from 1.4 s to 0.6 s natively and 0.9 s on WASM, and every UI query gets a little faster. The WASM driver finalizes statements after each use today; a cache needs `reset()` and rebinding instead. Don't cache statements used through `iterate()`, where a nested use of the same SQL would clash.

## Ways of working

- One branch and PR per phase, or per coherent part of a phase. Conventional commits.
- Design docs are updated in the same PR when implementation deviates from them.
- Spikes record their findings in the design docs before the spike code is deleted.
- Version-sensitive libraries (Capacitor, Better Auth, SQLite WASM, Litestream) are checked against current docs when adopted, and pinned.
