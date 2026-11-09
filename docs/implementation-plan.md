# Implementation plan

Order of work from an empty repo to the full feature set. Phases are ordered by:

1. risk first (spikes),
2. then a usable vertical slice,
3. then breadth.

Update this file as phases complete or the plan changes. Mark completed phases
`[done]` and record deviations in the relevant design doc.

Sizes are relative: S ≈ a few sessions, M ≈ one to two weeks of evenings,
L ≈ several weeks.

## Milestones

| Milestone | After phase | Meaning |
| --- | --- | --- |
| **M1: logs locally** | 4 | A full workout can be logged in the browser on the phone, with real FitNotes history. |
| **M2: FitNotes replaced** | 6 | Android app with a reliable rest timer, sync between phone and web, server backups running. |
| **M3: other users invited** | 10 | Multi-user hardening, quotas, admin, restore rehearsal. |

## Phase 0: Scaffolding (S) [done]

- pnpm workspace with the layout from [architecture.md](architecture.md#repository-layout-planned).
- TypeScript strict, ESM, a shared `tsconfig`.
- Lint/format: Biome.
- Tests: Vitest.
- GitHub Actions: install, lint, typecheck, test, build on every push and PR.
- `apps/web`: Vite + React + Tailwind + TanStack Router "hello" page.
- AGENTS.md: fill in the Commands section.

**Exit:** CI green on `main`. `pnpm dev` serves the web app.

## Phase 1: Spikes (S each, in parallel)

Throwaway code in a `spikes/` directory, deleted once the findings are recorded
in the design docs.

1. **RestTimer plugin.** A minimal Capacitor app with a Kotlin plugin: an exact alarm, a `USAGE_ALARM` sound, and a vibrator.
   - Test matrix on your phone: music playing (Spotify), silent mode, DND, screen locked, app swiped away, exact-alarm permission revoked.
   - Exit: all pass, or the failures are documented with a workaround.
2. **SQLite WASM storage.** The official build with the OPFS SAH-pool VFS in a worker. Test in Chrome, Firefox, and the Android WebView inside the Capacitor app:
   - persistence across reload, app restart, and app update;
   - `navigator.storage.persist()`;
   - Web Lock tab ownership;
   - the "don't wipe on init failure" option.
   - Exit: the [architecture.md](architecture.md#client-runtime) assumptions are confirmed, or the native-plugin fallback is chosen.
3. **FitNotes schema.** Dump your `.fitnotes` backup's tables and columns, and fill in the mapping in [fitnotes-import.md](fitnotes-import.md).

Health Connect and charting spikes are deferred to their phases; they are lower risk.

## Phase 2: Core foundations (M)

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

## Phase 3: Logging slice, web (M–L)

- DB worker in the web app, Web Lock tab ownership, the TanStack Query table-tag invalidation.
- Component library choice (Radix-based).
- Screens:
  - start session: routine preselect, day highlight, ad hoc;
  - session view: exercise list, done state, add/remove/reorder, session timer;
  - exercise view: entry with prefill and steppers, previous performance with tap-to-copy, markers, edit/delete sets;
  - substitution picker;
  - minimal routine editor: routines, days, slots, alternatives;
  - minimal exercise browser and custom exercise creation;
  - settings: units, increments, rest default, idle threshold, e1RM cap.
- Web rest timer (in-page).
- Snapshot export/import (file) and the undo snackbar.
- PWA: installable, offline, "reload to update" prompt.

**Exit:** a full real workout logged in the phone's browser; the data survives reload and offline use.

## Phase 4: FitNotes import (S–M)

- Importer in `core`, the exercise mapping file, the import report, re-import rules.
- Settings → Import.
- Run it on your backup, then spot-check volumes, PRs, and session counts against FitNotes.

**Exit:** **M1.** All history is visible, and markers and records look right on real data.

## Phase 5: Android app (M)

- `apps/android`: Capacitor shell over the web build, with a fixed scheme and hostname.
- RestTimer plugin, productionized from the spike: start/adjust/cancel, permission check on resume. The foreground-service countdown can wait for P1.
- Keep-awake toggle, on-device snapshots after each session, `allowBackup=false`.
- CI: APK build on tags, attached to the GitHub release; an in-app update check.

**Exit:** daily use on the phone, with the rest timer trusted.

## Phase 6: Server, sync, deployment (L)

Owner-only at first; multi-user hardening is phase 10.

- `apps/server`: Hono on Node, better-sqlite3 + Kysely, server migrations with the pre-migration R2 copy.
- **Auth:** Better Auth with email + password, web cookies, the Android bearer token in secure storage, `server create-owner`.
- **Sync:**
  - `v1` push/pull/snapshot using the shared module from phase 2;
  - head table, epoch, `server new-epoch`, schema-version guard, `MIN_CLIENT_VERSION`.
- **Client sync loop:**
  - triggers, status UI (last sync, unsynced count, errors), clock repair;
  - the login/logout/merge flows from [accounts.md](accounts.md#without-an-account).
- **Deployment:**
  - Dockerfile;
  - compose with `litestream-init`, `litestream`, and `app`;
  - GHCR and the Dokploy webhook with pinned SHAs;
  - R2 buckets and tokens;
  - Litestream config (14-day retention).
- **Backups:**
  - daily DB copy job;
  - `/api/status`;
  - external uptime monitor;
  - owner warning badges.

**Exit:** **M2.** Phone and web stay in sync. You've rehearsed the "VPS lost" procedure once, and stopped using FitNotes.

## Phase 7: History, records, calendar (M)

- Charting spike: try 2 libraries on real data and pick one. Record the choice in [architecture.md](architecture.md#tech-stack).
- Exercise history graph, records table.
- Calendar and frequency analytics ([features.md](features.md#calendar-and-frequency)).
- Routine editor polish: reorder, duplicate, archive, slot notes, rest overrides.

## Phase 8: Measurements (M)

- Metrics and measurements UI with manual entry.
- Health Connect import (plugin choice, permissions, history access, deterministic writes).
- Combined chart: stacked panels and normalized overlay, smoothing.

## Phase 9: CLI (S–M)

- `apps/cli`: `login`, `pull` (mirror via the same sync client and migrations), `sessions`, `exercise`, `measurements`, `export`, `sql`, `backup [--all]`, `restore`, `import fitnotes`.
- API keys in the app settings, with read and write scopes.
- Owner backup task: `wl backup --all` plus restic, scheduled on your PC.

## Phase 10: Multi-user hardening (M)

- Invites (entropy, expiry, transactional redemption), signup.
- Rate limits (per-IP before auth, tight on auth endpoints), body limits, trusted proxy configuration.
- Quotas and their exemptions, the usage table and pruning, the owner admin page (users, usage, quotas, disable, reset links).
- Account deletion with stated retention; data export.
- Monthly restore rehearsal job; checks that the R2 buckets and tokens are separate.
- Signup screen privacy notice.

**Exit:** **M3.** The first invited user onboarded.

## Phase 11: Analytics and P2 (ongoing)

- Analytics page: weekly weighted sets per muscle, volume, durations, PR list.
- Multi-step undo/redo, year heatmap, scatter plots, relative strength, kg/lb display polish.
- Rest countdown notification (foreground service).
- Server push notifications (SSE) instead of polling.

## Ways of working

- One branch and PR per phase, or per coherent part of a phase. Conventional commits.
- Design docs are updated in the same PR when implementation deviates from them.
- Spikes record their findings in the design docs before the spike code is deleted.
- Version-sensitive libraries (Capacitor, Better Auth, SQLite WASM, Litestream) are checked against current docs when adopted, and pinned.
