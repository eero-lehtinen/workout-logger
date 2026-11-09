# Architecture

Status: draft. Library choices marked *candidate* still need checking against
current docs before we commit to them.

## Overview

```
 ┌────────────────────── one TypeScript UI codebase ──────────────────────┐
 │  Web (PWA, browser)                Android (Capacitor shell)           │
 │  ┌──────────────┐                  ┌──────────────┐ ┌───────────────┐  │
 │  │  UI (React)  │                  │  UI (React)  │ │ native plugins│  │
 │  ├──────────────┤                  ├──────────────┤ │ rest alarm,   │  │
 │  │ core: domain,│                  │ core         │ │ health connect│  │
 │  │ queries, sync│                  │              │ │ keep-awake    │  │
 │  ├──────────────┤                  ├──────────────┤ └───────────────┘  │
 │  │ SQLite (WASM)│                  │ SQLite       │                    │
 │  └──────┬───────┘                  └──────┬───────┘                    │
 └─────────┼─────────────────────────────────┼────────────────────────────┘
           │  login, push / pull changes (HTTPS, bearer token)
           ▼                                 ▼
      ┌──────────────────────────────────────────────┐       ┌─────────┐
      │ Server (Hono): auth, per-user change log,    │◀──────│   CLI   │
      │ quotas, snapshots. VPS (Dokploy) + SQLite    │       └─────────┘
      └──────────────────────┬───────────────────────┘
                             │ Litestream replica + daily DB copies
                             ▼
                    Cloudflare R2 (backups)
```

Principles:

- **Local-first.** Every read and write goes to the on-device SQLite database. The network is used for login and sync only. The app is fully usable without an account; an account adds sync and server backups.
- **One UI codebase.** The web build is the product. Android is the same build inside a Capacitor shell, plus a few native plugins.
- **Server stores data, not domain logic.** The server handles accounts, quotas, and a per-user change log of opaque rows. It never interprets workout data, so app schema changes never need server migrations.
- **Small data.** Years of training for one user are on the order of 10^4-10^5 sets. Analytics run on-device with plain SQL. No server-side aggregation.
- **Several isolated accounts, not a production service.** Each user's data is separate and private. Robustness targets are "a few invited users", not the public internet. See [accounts.md](accounts.md).

## Tech stack

| Concern | Choice | Reason |
| --- | --- | --- |
| Language | TypeScript everywhere | One language for UI, core, server, CLI. Shared types for the sync protocol. |
| Repo | pnpm workspace monorepo | Shared `core` package. |
| UI | React + Vite | Largest ecosystem for components and charts. |
| Components | Radix-based headless components (*candidate*) | Accessible primitives; styling is our own. |
| Charts | Undecided. Try several (e.g. ECharts, uPlot) on real data | Needs multi-series time charts with zoom, a shared crosshair, and multiple axes. |
| Local DB | Official SQLite WASM build with the OPFS SAH-pool VFS (*candidate*), on both web and Android | One code path: Android runs the same build inside the Capacitor WebView. Real SQL for analytics, same engine as the FitNotes backup. Runs in a worker and doesn't need COOP/COEP headers. OPFS in the Android WebView is verified in the first spike. |
| Query layer | Kysely | Typed SQL builder that still allows hand-written analytics SQL (CTEs, window functions). The same tool on client, server, and CLI. |
| Reactive queries | TanStack Query + table-tag invalidation | See [client runtime](#client-runtime). |
| Android shell | Capacitor | Reuses the web UI unchanged. |
| Server | Hono on Node (*candidate*) | Small, typed, and portable across runtimes. |
| Auth | Better Auth (*candidate*) | TypeScript auth library with Hono and SQLite support, a bearer-token plugin for the native app, and an API-key plugin for the CLI. |
| Hosting | Owner's VPS under Dokploy | See [deployment.md](deployment.md). |
| Server storage | SQLite file on a Docker volume (better-sqlite3 via Kysely, *candidate*) | Same engine as the clients. No platform row limits. |
| Server backups | Litestream to Cloudflare R2 | Continuous replication with point-in-time restore, at a different provider than the VPS. |
| Object storage | Cloudflare R2 | Litestream replica and daily DB copies, in separate buckets. |
| CLI | Node/Bun script in the monorepo | Reuses `core` for the schema and sync client. |

## Repository layout (planned)

```
apps/
  web/        React app; also the Capacitor web asset source
  android/    Capacitor Android project + native plugin code
  server/     Hono server: auth, sync, quotas, snapshot job
  cli/        `wl` command
packages/
  core/       schema, migrations, domain logic (e1RM, records, next-day,
              idle end), queries, sync client, FitNotes importer
  exercises/  seed exercise catalog (JSON) + muscle list
docs/
```

## Data model (client)

Every table below is synced, so every row also carries:

- `id` (UUIDv7, or a deterministic UUIDv5)
- `hlc` (hybrid logical clock)
- `deleted` (soft-delete flag)

See [sync.md](sync.md). `position` columns are fractional index strings.

```
muscle            (id, name, group_name)               -- seeded, effectively static
exercise          (id, name, type, default_rest_s?, weight_increment_kg?, notes, archived, builtin_key)
exercise_muscle   (id, exercise_id, muscle_id, factor)  -- factor 0..1

routine           (id, name, position, archived)
routine_day       (id, routine_id, name, position)
slot              (id, day_id, exercise_id, position, rest_s?, note?)
slot_alternative  (id, slot_id, exercise_id, position)

session           (id, routine_id?, day_id?, started_at, tz, ended_at?, end_reason?, notes)
                  -- tz: IANA zone at start; end_reason: manual | unknown (imported, no duration)
session_exercise  (id, session_id, slot_id?, exercise_id, position, notes)
set_log           (id, session_exercise_id, position, logged_at,
                   weight_kg?, reps?, duration_s?, distance_m?)

metric            (id, name, unit, builtin_key?, position, archived)
measurement       (id, metric_id, measured_at, value, source, external_id?, note)

setting           (id = key, value_json)
```

Notes:

- Weight is stored in kg as REAL. See [units and rounding](#units-and-rounding).
- The routine's active day is not stored. It is derived (see [features.md](features.md#starting-a-session)), so the derived state cannot get out of sync with the logs.
- **Session end.** `ended_at` is written only by a manual stop. Idle auto-end is derived at query time, not stored:
  - effective end = `ended_at`, or else the last `set_log.logged_at` if `now` minus that time exceeds the idle threshold, or else still running;
  - deriving it means nothing is written in the background and no device can overwrite another's edits with a computed value.
- **Logging into an idle-ended session.** Opening a session whose effective end has passed and logging a set asks "continue that session or start a new one?". Continuing writes nothing extra; the idle rule then simply measures from the new last set.
- **Calendar date** of a session is the local date of `started_at` in the session's `tz`. Weeks start on Monday (a setting).
- Editing a routine never rewrites past sessions. History queries go by `exercise_id`.
- The `set_log` columns are deliberately minimal. There are no set types (warm-up, superset, drop set), RPE, or per-set notes.
- e1RM, set records, PRs, and volume are computed by queries, not stored. If they get slow, cache them in a local table that is not synced.
- Built-in exercises, muscles, and the body weight metric use deterministic ids and HLCs, so every device seeds identical rows. Seeding never overwrites user edits ([sync.md](sync.md#deterministic-writes)).
- Every exercise has at least one primary muscle (factor 1.0). The editor enforces this, because frequency stats count primary muscles.

## Units and rounding

The weight unit is a per-user display setting. Storage is always kg.

- **Input.** A value entered in lb is converted with the exact factor (1 lb = 0.45359237 kg) and stored unrounded. Converting it back for display gives the entered value again, e.g. 225 lb → 102.0582 kg → 225 lb.
- **Display.** Weights are converted to the display unit, rounded to 2 decimals, and trailing zeros are trimmed (`100`, `102.5`, `220.46`). e1RM and other derived values are rounded to 1 decimal.
- **Increment.**
  - Defaults: 2.5 kg, or 5 lb when the unit is lb. The value is overridable per exercise (`weight_increment_kg`), e.g. 1 kg for dumbbells.
  - The +/- buttons snap to the nearest multiple of the increment first, then step. A converted 220.46 lb becomes 225 after +, not 225.46.
- **Prefill.** The prefilled weight is shown unrounded, in display units. If the unit changed since the value was logged, it shows as e.g. 220.46 lb; the first +/- press snaps it.
- **Comparisons** for stars and PRs run on kg values with a small epsilon (1e-6). Unit conversion then cannot create false records.

## Client runtime

### Database worker and tabs

- SQLite runs in a dedicated worker. All queries go through it. Writes are short transactions. Heavy analytics queries are indexed, and split if they would delay set logging noticeably (target: logging a set under 100 ms).
- The SAH-pool VFS allows one connection per database, so only one tab can open it. The tab holding a Web Lock owns the database. Other tabs show "open in another tab", with a "use here" button that takes the lock over. Proxying queries between tabs is not worth it.
- Configure the VFS so that it does **not** delete its storage when initialization fails. Recent SQLite versions have an option for this; pin a version that has it and verify the option name.

### Storage durability

- **Web:** call `navigator.storage.persist()` on first run and show the result next to the backup status. Without it, the browser may evict the database.
- **Android:** the Capacitor scheme and hostname are fixed forever. Changing them changes the WebView origin and orphans the database (an invariant in AGENTS.md).

### Client migrations

- Run in the worker, before any other query, in one transaction.
- Before migrating, copy the database file (OPFS copy on web, plus the regular snapshot on Android), and keep the last copy.
- Migrations of local tables and upgrades of incoming sync rows with an older `v` share the same functions. See [migrations.md](migrations.md).

### Reactive queries

- The `core` write API knows which tables each transaction touched, for local writes and for sync applies alike.
- After commit, it emits the table names.
- UI queries are TanStack Query queries tagged with the tables they read. Matching queries are invalidated and refetch. This is simple, and coarse enough to be correct.

### Updates and version compatibility

- **PWA:** precache the app shell and the SQLite WASM file (`vite-plugin-pwa`, *candidate*). A new version shows "reload to update". It is never activated automatically during a running session.
- **APK:** checks GitHub releases on start and shows an update prompt.
- **Server:** every request sends the app version. Below `MIN_CLIENT_VERSION` the server returns 426, and the app shows "update the app". Sync additionally guards schema versions per change ([sync.md](sync.md#schema-evolution)).

## Sync

Each user's devices push and pull through that user's change log on the server. Row-level last-writer-wins by HLC. Full design: [sync.md](sync.md).

## Deployment

A single Node container on the owner's VPS, managed by Dokploy. It serves the API and the web app. Images are built in CI. Full design and recovery procedures: [deployment.md](deployment.md).

## Accounts

Invite-only signup, an owner role without limits, and per-user quotas. Full design: [accounts.md](accounts.md).

## Backups

Layered:

- the server change log
- a Litestream replica
- daily full-DB copies in R2
- the owner's encrypted PC copy
- on-device snapshot files

Full design: [backups.md](backups.md).

## Android

The native app exists for the rest timer and health data. The web cannot reliably alert while the page is backgrounded or the screen is locked, and it has no access to Health Connect.

### Rest alarm

A custom Capacitor plugin in Kotlin, `RestTimer`, is the primary implementation. The stock local-notifications plugin quietly falls back to inexact alarms, loses scheduled alarms when the exact-alarm permission is revoked, and can't do the P1 countdown.

- **API:** `start(endsAt)`, `adjust(endsAt)`, `cancel()`, and events back to JS.
- **Firing:** an exact alarm via `AlarmManager` (`setAlarmClock`, *candidate*: exact, and allowed in Doze). When it fires:
  - play the sound with `AudioAttributes.USAGE_ALARM`, so it plays over music and isn't muted by notification volume;
  - drive the vibrator directly with a pattern;
  - show a notification.
- **Countdown (P1):** a foreground service with an ongoing notification that shows the remaining time.
- **Permission:** `USE_EXACT_ALARM` (acceptable for a timer app outside the Play Store). On every resume, check that exact alarms are still allowed; if not, warn in the UI.
- **Test first on a device:**
  - over music
  - in silent mode and Do Not Disturb
  - with the screen locked
  - with the app swiped away
- **Web:** the rest timer is in-page only: `setTimeout`, then Web Audio, plus `navigator.vibrate`. It works while the page is visible.

### Health Connect

- Read body weight records through a Capacitor health plugin. Candidates: Capawesome Health, `@capgo/capacitor-health`. Requires the `READ_WEIGHT` permission.
- Health Connect limits reads to about 30 days of history unless the user also grants history access. Request it for the first import.
- Import runs on app start and resume. It reads records changed since a stored watermark and writes them as `measurement` rows with `source = 'health_connect'`, using the deterministic id and HLC from [sync.md](sync.md#deterministic-writes). Re-reads are idempotent across devices, and a user's deletes or edits of imported rows survive.
- Read only; we never write to Health Connect.

### Other

- Keep the screen awake during a session (optional toggle).
- **Distribution:** an APK built in CI and attached to GitHub releases, sideloaded. No Play Store. Other users install the same APK.

## CLI

`wl` logs in with a personal API key and keeps a local SQLite mirror by using
the same pull protocol as the app. It can also read a snapshot file instead.

```
wl login                                  # store API key
wl pull                                   # sync mirror from server
wl sessions --since 2026-01-01 --json
wl exercise "Barbell Row" --history --json
wl measurements --metric "Body weight" --json
wl export --format json|csv|sqlite
wl sql "select ..."                       # raw read-only SQL on the mirror
wl backup <dir> [--all]                   # snapshot files, see backups.md
wl restore --at <time> [--table] [--id]   # append-only restore, needs write-scoped key
wl import fitnotes <file>                 # needs write-scoped key
```

The JSON output uses denormalized, readable names, so AI tools can consume it
directly.

## Exercise catalog seed

Start from an open, permissively licensed exercise dataset that has primary and
secondary muscles. Candidates:

- free-exercise-db (public domain JSON)
- the wger exercise database (CC-BY-SA)

Map its muscles onto our muscle list and convert primary/secondary into factors
1.0 / 0.5. Then curate. License and data quality still need checking.
