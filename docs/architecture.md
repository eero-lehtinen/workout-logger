# Architecture

Status: draft. Library choices marked *candidate* still need checking against
current docs before we commit to them.

The UI targets two screens: logging is phone-first, while history, routine
editing, settings, and the planned charts must be comfortable on a PC screen.
Narrow screens get one pane with bottom navigation; wide screens (Tailwind
`lg`) get a sidebar and side-by-side panes, e.g. the session's exercise list
next to the logging pane.

The window never scrolls. Every screen is a `Screen`: a fixed header, a body
that alone scrolls, and an optional fixed footer (the set entry while
logging). Scrollbars therefore run only beside what scrolls, and sticky
elements never overlap content. Header, body, and footer span the full width
with their content centered, so on a wide window the scrollbar stays at the
edge. The router restores each screen body's scroll position when returning
to the screen, keyed by path.

On phones, the on-screen keyboard resizes the layout instead of panning the
page (`interactive-widget=resizes-content` in the viewport meta, honored by
Chrome and Firefox on Android). The shell's height (`h-dvh`) shrinks to the
space above the keyboard, so the header stays and only the footer moves up
with the keyboard. Safari ignores the setting and pans the page.

## Overview

```
 ┌────────────────────── one TypeScript UI codebase ──────────────────────┐
 │  Web (PWA, browser)                Android (Capacitor shell)           │
 │  ┌──────────────┐                  ┌──────────────┐ ┌───────────────┐  │
 │  │  UI (React)  │                  │  UI (React)  │ │ native plugins│  │
 │  ├──────────────┤                  ├──────────────┤ │ rest timer,   │  │
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
| Styling | Tailwind CSS | Utility classes, no separate stylesheet architecture to maintain. |
| Routing | TanStack Router, file-based routes | Type-safe routes and search params. |
| Components | Base UI (`@base-ui/react`) | Headless, accessible primitives from the Radix authors, actively released since v1; Radix Primitives releases have slowed. Styling is our own. Its bundled docs (`node_modules/@base-ui/react/docs`) match the installed version. |
| React compilation | React Compiler (`babel-plugin-react-compiler` through `@rolldown/plugin-babel`) | Automatic memoization; no hand-written `useMemo`/`useCallback`. The native Rust port in `@vitejs/plugin-react` is still experimental. |
| Icons | `lucide-react` | Tree-shaken SVG icons. |
| Validation | Valibot | Small and fast at runtime and in type-checking. Used where stored or imported data may come from another app version, e.g. settings. |
| Worker RPC | Comlink | Calls into the DB worker and proxies change events back. |
| Lint/format | Biome | One fast tool for both. |
| Tests | Vitest; Storybook stories as browser tests; Playwright end-to-end | See [testing](#testing). |
| Charts | Undecided. Try several (e.g. ECharts, uPlot) on real data | Needs multi-series time charts with zoom, a shared crosshair, and multiple axes. |
| Local DB | Official SQLite WASM build (`@sqlite.org/sqlite-wasm`, pinned; verified on 3.54.1-build1) with the OPFS SAH-pool VFS, on both web and Android | One code path: Android runs the same build inside the Capacitor WebView. Real SQL for analytics, same engine as the FitNotes backup. Runs in a worker and doesn't need COOP/COEP headers. Verified in Chrome, Firefox, and the Android WebView; see [client runtime](#client-runtime). |
| Query layer | Kysely, with its stock SQLite dialect over a small `Driver` interface in `core`: sqlite-wasm in the browser, better-sqlite3 on Node (tests, CLI, server) | Typed SQL builder that still allows hand-written analytics SQL (CTEs, window functions). The same tool on client, server, and CLI. |
| Ids | `uuid` (v7 for new rows, v5 for deterministic ids) | Maintained, implements both versions. |
| Ordering | `fractional-indexing` | Position keys that sort as plain strings. |
| Property tests | fast-check | Shrinking finds minimal failing sequences; used by the sync fuzz test. |
| Reactive queries | TanStack Query + table-tag invalidation | See [client runtime](#reactive-queries). |
| Android shell | Capacitor | Reuses the web UI unchanged. |
| Server | Hono on Node (`hono`, `@hono/node-server`) | Small, typed, and portable across runtimes. Node runs the TypeScript sources directly by stripping types. |
| Auth | Better Auth (*candidate*) | TypeScript auth library with Hono and SQLite support, a bearer-token plugin for the native app, and an API-key plugin for the CLI. |
| Hosting | Owner's VPS under Dokploy, behind a Cloudflare Tunnel | See [deployment.md](deployment.md). |
| Server storage | SQLite file on a Docker volume (better-sqlite3 via Kysely, *candidate*) | Same engine as the clients. No platform row limits. |
| Server backups | Litestream to Cloudflare R2 | Continuous replication with point-in-time restore, at a different provider than the VPS. |
| Object storage | Cloudflare R2 | Litestream replica and daily DB copies, in separate buckets. |
| CLI | Node/Bun script in the monorepo | Reuses `core` for the schema and sync client. |

## Repository layout (planned)

```
apps/
  web/        React app; also the Capacitor web asset source
  android/    Capacitor Android project + native plugin code
  server/     Hono server: serves the web build and /api/status; later
              auth, sync, quotas, snapshot job
  cli/        `wl` command
packages/
  core/       schema, migrations, domain logic (e1RM, records, next-day,
              idle end), queries, sync client, FitNotes importer
  exercises/  seed exercise catalog + muscle list, seeding routine
docs/
```

`packages/core/src`:

```
db/          Driver interface, better-sqlite3 and sqlite-wasm drivers
schema/      table types, SCHEMA_VERSION, synced column registry
migrations/  version steps, runner, row upgrade chain
store/       Store: write API, undo, change events, deterministic writes
sync/        HLC, ids, protocol types, client push/pull/apply
sync/server/ server push/pull/snapshot, shared with apps/server
domain/      pure functions: e1RM, markers, prefill, next day, session end, units
queries/     read queries for the UI, each tagged with the tables it reads
commands/    domain writes for the UI, each one write transaction
settings.ts  setting keys, defaults, and validation
snapshot/    snapshot file export and import (merge or replace)
api.ts       runQuery / runCommand: the dispatch the DB worker exposes
testing.ts   in-memory store and server, migration fixture helpers
```

`apps/web/src`:

```
db/          DB worker, Comlink client, tab ownership, query and command hooks
components/  Base UI wrappers and shared UI, styled with Tailwind
features/    screens by area: session, exercises, routines, settings
lib/         formatting, the web rest timer, storage persistence, PWA install
routes/      TanStack Router file routes; thin, they render feature components
```

Entry points: `@workout-logger/core` (browser-safe), `/node` (better-sqlite3
driver), `/wasm` (sqlite-wasm driver), `/sync-server`, `/testing`.

## Data model (client)

Every table below is synced, so every row also carries:

- `id` (UUIDv7, or a deterministic UUIDv5)
- `hlc` (hybrid logical clock)
- `deleted` (soft-delete flag)

See [sync.md](sync.md). `position` columns are fractional index strings.
Timestamps (`*_at`) are INTEGER UTC epoch milliseconds. Flags (`deleted`,
`archived`) are INTEGER 0/1. The local-only tables `_outbox`, `_sync_state`,
and `_undo` are described in [sync.md](sync.md#client-side).

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
  - effective end = `ended_at`, or else the last `set_log.logged_at` (or `started_at` without sets) if `now` minus that time exceeds the idle threshold, or else still running;
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
- **Comparisons** for set records and PRs run on kg values with a small epsilon (1e-6). Unit conversion then cannot create false records.

## Client runtime

### Database worker and tabs

- SQLite runs in a dedicated module worker. All queries go through it. Writes are short transactions. Heavy analytics queries are indexed, and split if they would delay set logging noticeably (target: logging a set under 100 ms).
- The `Driver` is synchronous, so Kysely and the `Store` live in the worker too. The main thread can't pass callbacks or transactions across, so it calls named queries and commands from `core` (`QUERIES`, `COMMANDS`) through Comlink. Each command runs as one undoable write transaction and returns its undo transaction id; the undo snackbar undoes exactly that transaction, and only while it is still the latest.
- The main-thread bundle must not pull in Kysely: the workspace packages are marked `"sideEffects": false` so the query registry is tree-shaken out of it.
- The database file is `/workout-logger.sqlite3` in the pool. Like the pool directory, the name never changes. The pre-migration copy is `/pre-migration.sqlite3`; snapshot imports go through a temporary `/import.sqlite3`. The pool reserves capacity for all three and their journals.
- On open, the worker migrates, then seeds the built-in catalog (`seedCatalog`).
- Vite setup: exclude `@sqlite.org/sqlite-wasm` from `optimizeDeps`, and create the worker with `new Worker(new URL("./db.worker.ts", import.meta.url), { type: "module" })`. This works in dev and in the production build. The build also emits the library's unused `sqlite3-worker1` and `sqlite3-opfs-async-proxy` scripts (about 250 KB). Keep them out of the PWA precache.
- VFS init takes about 50-70 ms on desktop and on the phone, and up to 200 ms on the first run on the phone.

### VFS configuration

`installOpfsSAHPoolVfs` options:

- `preserveOnInitFailure: true`. This is required. The default is `false`, and then any init failure calls `removeVfs()`, which recursively deletes the pool directory and the database with it. With the option set, a failed init releases its handles and leaves the files alone. Verified with injected handle-acquisition failures in Chrome, Firefox, and the Android WebView.
- `directory` is set explicitly (`.opfs-sahpool`, the current default), so a changed library default can't move it. Changing it orphans the database, like a Capacitor origin change.
- Never `clearOnInit`.
- A failed init is cached for that JS context. Retry by starting a fresh worker, not with `forceReinitIfPreviouslyFailed`.

### Tab ownership

- The SAH-pool VFS holds a sync access handle on every pool file, so only one context can open the database. A second open fails with `NoModificationAllowedError`.
- The tab holding the Web Lock `workout-logger-db` owns the database. Other tabs get the lock with `ifAvailable: true`, see that it's taken, and show "open in another tab" with a "use here" button. Proxying queries between tabs is not worth it.
- "Use here" requests the lock with `steal: true`. The old tab's lock request rejects with `AbortError`. It then terminates its worker, which releases the handles, and shows "open in another tab". The new tab opens the database with a fresh worker, retrying on failure. In Chrome and Firefox the first attempt succeeded, in about 50 ms.
- A frozen page runs no code, so it can't see that its lock was stolen, and its worker keeps the files. Android freezes a background Chrome tab, for example while the installed app is in front. Two measures:
  - On the Page Lifecycle `freeze` event, the owning tab terminates its worker and releases the lock. A waiting tab takes over by itself. On `resume`, the tab asks for the lock again and opens, or shows "open in another tab". A write in flight at that moment is lost and rolled back.
  - If the files are still held after a steal's ten retries, the new tab keeps the lock and shows "still open in another window". It retries every 2 s, when the page becomes visible, and on "try again". Keeping the lock means the old tab, once it runs again, terminates its worker and waits instead of taking the database back. This covers tabs frozen without the event and tabs running a version without the handler.
  - Headless Chromium doesn't freeze pages, so the e2e tests dispatch `freeze` and `resume` themselves, and stall a tab's main thread to stand in for a frozen tab.
- A worker terminated mid-transaction leaves a rollback journal, which SQLite recovers on the next open.

### Storage durability

- **Web:** call `navigator.storage.persist()` on first run and show the result next to the backup status. Without it, the browser may evict the database under storage pressure.
  - Chrome grants it based on engagement or PWA install, without a prompt. A fresh profile gets `false`.
  - Firefox shows a permission prompt, so the automatic request runs once in a browser tab and once more on the first launch as the installed app, never on every start.
  - Settings has an "Install app" button. The app catches `beforeinstallprompt` before the first render and shows the browser's install prompt from the button. Where the browser has no such event (Safari, Firefox), Settings tells the user to install from the browser's menu.
  - Installing asks for persistence again: on `appinstalled`, which fires for installs from the button and from the browser's own menu, and on the first launch as the installed app, in case Chrome hadn't counted the install yet when the tab asked.
- **Android:** the database lives in the app's private WebView storage. It survives reload, process kill, force stop, and an update installed over the top with a higher versionCode (tested on Android 16, WebView 157). Uninstalling deletes it.
  - `persist()` always returns `false` in the WebView: there is no grant path. Whether the WebView can evict storage under disk pressure is not documented. The on-device snapshots and server sync are the protection.
- **Android origin:** `server.androidScheme: "https"` and `server.hostname: "localhost"`, set explicitly in the Capacitor config, so the origin is `https://localhost`. These are Capacitor 8's defaults, and `https` gives a secure context, which OPFS and Web Locks require. They never change: changing them changes the WebView origin and orphans the database (an invariant in AGENTS.md). The `appId` is chosen once in phase 5 and is equally permanent.

### Client migrations

- Run in the worker, before any other query, in one transaction.
- Before migrating, copy the database file (OPFS copy on web, plus the regular snapshot on Android), and keep the last copy.
- Migrations of local tables and upgrades of incoming sync rows with an older `v` share the same functions. See [migrations.md](migrations.md).

### Reactive queries

- The `core` write API knows which tables each transaction touched, for local writes and for sync applies alike.
- After commit, it emits the table names.
- Each query in `QUERIES` lists the tables it reads. The worker maps changed tables to affected query names and posts those; the main thread invalidates TanStack Query queries keyed `["db", name, args]` by name. This is simple, and coarse enough to be correct.
- Queries use `networkMode: "always"` and never go stale on their own: the data is local, and only commits change it.

### Updates and version compatibility

- **PWA:** `vite-plugin-pwa` precaches the app shell, fonts, icons, and the SQLite WASM file, in prompt mode: a new version shows "reload to update" and is never activated automatically during a running session.
- **APK:** checks GitHub releases on start and shows an update prompt.
- **Server:** every request sends the app version. Below `MIN_CLIENT_VERSION` the server returns 426, and the app shows "update the app". Sync additionally guards schema versions per change ([sync.md](sync.md#schema-evolution)).

## Testing

| Layer | Runs | Covers |
| --- | --- | --- |
| Unit (Vitest, Node) | `pnpm test` | Everything in `core`: domain functions, queries, commands, migrations, snapshots, and the sync fuzz test. Pure web helpers. |
| Stories (Storybook + `@storybook/addon-vitest`, Chromium) | `pnpm test`, `pnpm storybook` to browse | Every screen at phone and PC widths, light and dark, with interaction checks in `play` functions and axe accessibility checks that fail the test. |
| End-to-end (Playwright, Chromium) | `pnpm e2e` | What only the real app shell shows: OPFS persistence across reloads, tab ownership through the Web Lock, the DB worker, and offline use through the service worker. Runs against the production build, served by `apps/server` with its production caching headers. |

Screen stories don't mock data. They render the real router at a URL over
`openMemoryDb()`: the real `core` store on an in-memory SQLite in the page,
seeded with the catalog and filled by fixtures (`apps/web/src/stories/fixtures.ts`)
through the real commands at past timestamps. Story data therefore can't
drift from what the queries return.

Storybook keeps the PWA plugin's virtual modules but drops its service worker
build. Telemetry is disabled.

## Sync

Each user's devices push and pull through that user's change log on the server. Row-level last-writer-wins by HLC. Full design: [sync.md](sync.md).

## Deployment

A single Node container on the owner's VPS, managed by Dokploy, at <https://lift.eerolehtinen.fi>. It serves the API and the web app. Images are built in CI and deployed on every push to `main`. Full design and recovery procedures: [deployment.md](deployment.md).

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

### Rest timer

A custom Capacitor plugin in Kotlin, `RestTimer`, registered in `MainActivity` before `super.onCreate`. It works like FitNotes: a foreground service stays alive for the whole rest and counts down itself. There is no alarm and no exact-alarm permission.

- **API:** `start(endsAt)`, `adjust(endsAt)`, `cancel()`, and events back to JS (`finished`, `cancelled`, `startFailed`). The pending `endsAt` is also persisted natively, so the UI can show the countdown, or a finished rest, after a cold start.
- **Start:** `start` runs when a set is logged, with the app visible. It starts `RestTimerService` with `startForegroundService` (`foregroundServiceType="mediaPlayback"`; permissions `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `WAKE_LOCK`). Android only allows this while the app is visible. Otherwise it throws `ForegroundServiceStartNotAllowedException`, which the plugin catches and reports as `startFailed`. The UI shows that the timer didn't start, instead of the app crashing.
- **Countdown:** the service acquires a non-reference-counted `PARTIAL_WAKE_LOCK` with a timeout of the remaining time plus 30 s, and posts the end on a main-thread `Handler`. The wake lock keeps the CPU running in Doze, so the handler fires on time. `adjust` re-arms the handler, extends the wake lock, and re-posts the notification.
- **Countdown notification** (the foreground-service notification):
  - channel with default importance, sound and vibration disabled;
  - ongoing, `CATEGORY_STOPWATCH`, `VISIBILITY_PUBLIC`, title and "next set at" text, `BigTextStyle`;
  - `setUsesChronometer(true)`, `setChronometerCountDown(true)`, `setWhen(endsAt)`, so the system draws the live countdown without reposting;
  - actions "+15 s" and "Skip", delivered to the service through `PendingIntent.getService`;
  - `setRequestPromotedOngoing(true)` (AndroidX `NotificationCompat`, core 1.17.0+) and the `POST_PROMOTED_NOTIFICATIONS` permission. This asks for an Android 16 QPR1 (API 36.1) Live Update, a status-bar chip with the countdown. It needs `BigTextStyle` or another allowed style, a title, ongoing, and no colorization. Not verified on a device yet; the test phone runs API 36.0, where `canPostPromotedNotifications()` is false.
- **End of rest:** the service
  - requests `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` and plays a short (~1.5 s) bundled sound through `MediaPlayer` with `USAGE_ALARM` / `CONTENT_TYPE_SONIFICATION`, so it uses the alarm volume and ignores the ringer mode;
  - vibrates with `VibrationAttributes.USAGE_ALARM` (API 33+; `AudioAttributes` with `USAGE_ALARM` below);
  - posts a "rest over" notification on a high-importance channel with sound and vibration disabled;
  - after playback, abandons focus, removes the countdown notification, releases the wake lock, and stops itself.

  Audio focus works because the service is in the foreground. On Android 15+, apps targeting API 35+ get focus only as the top app or with a foreground service; without focus, music isn't ducked.
- **Notifications permission:** without `POST_NOTIFICATIONS` the countdown and the alert still run, but no notification is shown. Request it on first use.
- **Known gap:** if the process dies during a rest (force stop, crash, an OEM killer), that alert is lost. This is accepted: missing an alert in rare cases isn't harmful, and a foreground service with a wake lock survived swipe-away and deep Doze in testing. On the next app start, the UI shows a rest whose `endsAt` has passed as finished.
- **Web:** the rest timer is in-page only: `setTimeout`, then Web Audio, plus `navigator.vibrate`. It works while the page is visible. The audio context is unlocked by the tap that logs the set. The end time is kept in `localStorage`, so a reload still shows the countdown, or a finished rest.

#### Alternatives tested and rejected

- **`AlarmManager.setAlarmClock`, firing an alert service.** Exact in every case, including after swipe-away (cold start, ~300 ms). Rejected because it needs `USE_EXACT_ALARM` and replaces the user's wake-up alarm as the system's next alarm clock while a rest runs. Revoking `SCHEDULE_EXACT_ALARM` kills the app and deletes pending alarms.
- **`setExactAndAllowWhileIdle`.** Not exact on OxygenOS: alarm batching delivered one 27 s early and another 8 s late.
- **Inexact alarms** (`setAndAllowWhileIdle`): about 3 minutes late on a locked phone.
- **Playing the alert from a `BroadcastReceiver`.** The audio focus request fails on Android 15+, so music isn't ducked.
- **The stock local-notifications plugin.** It falls back to inexact alarms and can't show a countdown.

#### Device test results

Phase 1 spike, on the owner's OnePlus 12R (CPH2581), Android 16 (API 36.0), OxygenOS 16.0.10.601, app targeting API 36. Checked through `dumpsys` (audio player state, focus, ducking, vibration, wake locks), not by ear. Latency is the time from the scheduled end of the rest to the alert.

| Case | Countdown service |
| --- | --- |
| Screen locked | Pass, 30 ms. |
| Forced deep Doze, 2 min | Pass, 51 ms. Wake lock held throughout. |
| App swiped away from recents | Pass, 31 ms. The task is removed; the process stays alive with its foreground service. |
| Process killed mid-rest | No alert (the accepted gap). |
| Started while the phone was locked | Refused by Android (`ForegroundServiceStartNotAllowedException`). |

The alert itself, measured with the same alert code started by an alarm:

| Case | Result |
| --- | --- |
| Alert slider on vibrate or silent | Pass. Sound plays unmuted on the speaker; vibration plays in full. |
| DND (priority mode, alarms allowed) | Pass. |
| Music playing (YouTube Music on the speaker) | Pass from a foreground service: music ducks to 20% for the alert and resumes. |

Not tested: Bluetooth earbuds (where an alarm-usage sound is routed), DND configured to block alarms, battery saver, the "+15 s" and "Skip" notification actions, the Live Update chip. The alarm stream volume on this phone can't go below 1.

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

`packages/exercises` holds a hand-curated catalog of 111 common gym exercises,
drawn from [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
(public domain, the Unlicense). Entries record the source id they were curated
from, where the dataset has one.

- Muscle targets are set by hand, as factors 1.0 (primary) and 0.5 (secondary). The source data's targets are too coarse ("shoulders" instead of front, side, and rear delts) and sometimes wrong.
- The muscle list has 19 muscles in 6 groups: Chest, Back, Shoulders, Arms, Legs, Core.
- Names are `<Movement> (<Equipment>)`, movement first so variants sort together: `Curl (Barbell)`, `Curl (Cable)`, `Curl (Dumbbell)`. Equipment is one of Barbell, Dumbbell, EZ Bar, Cable, Machine, Smith, Bodyweight, or Leg Press, or the attachment where that is the variant (`Triceps Pushdown (Rope)`). Cardio machines name the machine (`Running (Treadmill)`, `Cycling (Stationary)`). It is left out when the movement implies it (`Pull-Up`, `T-Bar Row`). English, Title Case, singular, hyphenated compounds.
- Keys (`barbell_bench_press`) are permanent: ids derive from them, and FitNotes mapping files refer to them. Renaming an exercise doesn't change its key.
- The body weight metric is the only built-in metric.
- `seedCatalog(store)` writes everything as deterministic rows ([sync.md](sync.md#deterministic-writes)) and is safe to run on every start.
