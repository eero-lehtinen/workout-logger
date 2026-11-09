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
      │ quotas, snapshots. Cloudflare Worker + D1    │       └─────────┘
      └──────────────────────────────────────────────┘
```

Principles:

- **Local-first.** Every read and write goes to the on-device SQLite database. The network is used for login and sync only. The app is fully usable without an account; an account adds sync and server backups.
- **One UI codebase.** The web build is the product. Android is the same build inside a Capacitor shell, plus a few native plugins.
- **Server stores data, not domain logic.** The server handles accounts, quotas, and a per-user change log of opaque rows. It never interprets workout data, so app schema changes never need server migrations.
- **Small data.** Years of training for one user are on the order of 10^4-10^5 sets. Analytics run on-device with plain SQL. No server-side aggregation.
- **Several isolated accounts, not a production service.** Each user's data is separate and private. Robustness targets are "a few coworkers", not the public internet. See [accounts.md](accounts.md).

## Tech stack

| Concern | Choice | Reason |
| --- | --- | --- |
| Language | TypeScript everywhere | One language for UI, core, server, CLI. Shared types for the sync protocol. |
| Repo | pnpm workspace monorepo | Shared `core` package. |
| UI | React + Vite (*candidate*) | Largest ecosystem for components and charts. |
| Components | Radix-based headless components (*candidate*) | Accessible primitives; styling is our own. |
| Charts | ECharts or uPlot (*candidate*) | Multi-series time charts with zoom, a shared crosshair, and multiple axes. |
| Local DB (web) | Official SQLite WASM build with the OPFS SAH-pool VFS (*candidate*) | Real SQL for analytics, same engine as the FitNotes backup. Runs in a worker and doesn't need COOP/COEP headers. |
| Local DB (Android) | Same WASM SQLite inside the WebView, or the native SQLite plugin (open question) | |
| Query layer | Kysely or Drizzle (*candidate*) | Typed SQL. |
| Android shell | Capacitor | Reuses the web UI unchanged. |
| Server | Hono (*candidate*) | Runs on Cloudflare Workers and on Node/Bun, so the hosting decision stays reversible. |
| Auth | Better Auth (*candidate*) | TypeScript auth library with Hono and D1 support, a bearer-token plugin for the native app, and an API-key plugin for the CLI. |
| Server storage | Cloudflare D1 | Free-plan limits: 100k rows written/day, 5M rows read/day, 500 MB per database. Per-user quotas keep usage inside these. |
| Object storage | Cloudflare R2 | Daily snapshots. |
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
exercise          (id, name, type, default_rest_s, notes, archived, builtin_key)
exercise_muscle   (id, exercise_id, muscle_id, factor)  -- factor 0..1

routine           (id, name, position, archived)
routine_day       (id, routine_id, name, position)
slot              (id, day_id, exercise_id, position, rest_s?, note?)
slot_alternative  (id, slot_id, exercise_id, position)

session           (id, routine_id?, day_id?, started_at, ended_at?, end_reason?, notes)
session_exercise  (id, session_id, slot_id?, exercise_id, position, notes)
set_log           (id, session_exercise_id, position, logged_at,
                   weight_kg?, reps?, duration_s?, distance_m?,
                   is_warmup, rpe?, notes)

metric            (id, name, unit, builtin_key?, position, archived)
measurement       (id, metric_id, measured_at, value, source, external_id?, note)

setting           (id = key, value_json)
```

Notes:

- Weight is stored in kg as REAL. Display rounding and units are a UI concern.
- The routine's active day is not stored. It is derived from the latest session that has a `routine_id`, so the derived state cannot get out of sync with the logs.
- `ended_at` is NULL for a running session. Idle auto-end runs when the app opens or resumes: if `now - last set_log.logged_at > idle_threshold`, set `ended_at = last logged_at` and `end_reason = 'idle'`. No background job is needed.
- Editing a routine never rewrites past sessions. History queries go by `exercise_id`.
- e1RM, set records, PRs, and volume are computed by queries, not stored. If they get slow, cache them in a local table that is not synced.
- Built-in exercises, muscles, and the body weight metric use UUIDv5 ids derived from their builtin keys, so every device seeds identical rows.

## Sync

Each user's devices push and pull through that user's change log on the server. Row-level last-writer-wins by HLC. Full design: [sync.md](sync.md).

## Accounts

Invite-only signup, an owner role without limits, and per-user quotas. Full design: [accounts.md](accounts.md).

## Backups

Layered:

- the server change log
- daily R2 snapshots
- an offsite CLI pull
- on-device snapshot files

Full design: [backups.md](backups.md).

## Android

The native app exists for the rest timer and health data. The web cannot reliably alert while the page is backgrounded or the screen is locked, and it has no access to Health Connect.

### Rest alarm

- When a set is logged, schedule a local notification at `logged_at + rest`. Cancel and reschedule on adjust or skip.
- The notification uses a dedicated high-importance channel with a custom sound and a vibration pattern. On Android 8+, the sound is fixed per channel.
- Android 12+ needs the exact-alarm permission. For a timer app outside the Play Store, `USE_EXACT_ALARM` is acceptable.
- **Unverified, test first on a device:**
  - whether the alert plays over music
  - its behavior in silent mode and Do Not Disturb

  If the stock Capacitor plugin is insufficient, write a small custom plugin that plays the sound with `AudioAttributes.USAGE_ALARM` and drives the vibrator directly.
- P1: an ongoing notification with a countdown. This may need a foreground service.
- On the web, the rest timer is in-page only: `setTimeout`, then Web Audio, plus `navigator.vibrate`. It works while the page is visible.

### Health Connect

- Read body weight records through a Capacitor health plugin. Candidates: Capawesome Health, `@capgo/capacitor-health`. Requires the `READ_WEIGHT` permission.
- Health Connect limits reads to about 30 days of history unless the user also grants history access. Request it for the first import.
- Import runs on app start and resume. It reads records changed since a stored watermark and upserts them as `measurement` rows with `source = 'health_connect'` and `id = UUIDv5(record id)`. This is idempotent, including across two Android devices.
- Read only; we never write to Health Connect.

### Other

- Keep the screen awake during a session (optional toggle).
- **Distribution:** an APK built in CI and attached to GitHub releases, sideloaded. No Play Store. Coworkers install the same APK.

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
wl backup <dir>                           # dated snapshot file, see backups.md
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
