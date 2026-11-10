# Features

Priorities:

- **P0**: needed before replacing FitNotes.
- **P1**: soon after.
- **P2**: nice to have.

Terms are defined in [glossary.md](glossary.md).

## Motivation

FitNotes gaps that this app addresses:

- Routines prescribe specific exercises with rep counts, and substituting is awkward. Here, routines only list *what* to train. Any exercise can be swapped at any time, for example when the machine is taken. Weight, reps, and set counts are never prescribed, which suits double progression.
- Outdated UI.
- Unreliable backups. Backups are layered and their freshness is visible in the app. See [backups.md](backups.md).
- No programmatic access to the data. The app adds a CLI with JSON output.

## Platforms

| Feature | Priority | Notes |
| --- | --- | --- |
| Web app, installable as a PWA | P0 | Works offline. |
| Usable on a PC screen | P0 | Logging is phone-first; history, routine editing, settings, and charts must also be comfortable on a desktop browser. See [architecture.md](architecture.md). |
| Android app from the same UI codebase | P0 | Needed for a reliable rest timer alert and health data access. See [architecture.md](architecture.md#android). |
| Sync between devices | P0 | Phone and web are both used from the start. See [sync.md](sync.md). |
| iOS | - | Out of scope. |

## Accounts

The app is shared with a few invited users, each with their own private data. See
[accounts.md](accounts.md).

| Feature | Priority | Notes |
| --- | --- | --- |
| Use without an account (local only) | P0 | |
| Email + password login; sync tied to the account | P0 | |
| Invite-only signup with owner-created invite codes | P0 | |
| Per-user quotas for non-owner users; usage visible to the user | P1 | Quotas are needed before inviting anyone. |
| Owner admin page: invites, users, usage, quotas, disable, password reset link | P1 | |
| Personal API keys for the CLI | P1 | |
| Account deletion and full data export by the user | P1 | |
| OAuth login (Google/GitHub) | P2 | |

## Exercise catalog

| Feature | Priority | Notes |
| --- | --- | --- |
| Built-in exercise list with exercise types and muscle targets | P0 | Seeded from an open dataset and curated. |
| Custom exercises: create, edit, archive, copy | P0 | Copying prefills a new exercise from any exercise, built-in ones included. |
| Browse and search by name and muscle group | P0 | |
| Edit an exercise's muscle targets | P1 | |
| Per-exercise default rest time and notes | P1 | |

## Routines

| Feature | Priority | Notes |
| --- | --- | --- |
| Create routines with an ordered cycle of days | P0 | |
| Each day has ordered slots; each slot has a default exercise | P0 | |
| Per-slot alternatives | P0 | |
| Per-slot rest override and free-text note | P1 | For example, a note like "heavy, 6-10" as a reminder. Never validated. |
| Reorder, duplicate, archive routines, days, slots | P1 | |

## Starting a session

| Feature | Priority | Notes |
| --- | --- | --- |
| Routine of the most recent session preselected; changeable | P0 | "Most recent" = latest `started_at` among sessions that have a routine. Ad hoc sessions are ignored. |
| Next day in the cycle highlighted; any day selectable | P0 | Next = the day after the latest session's day in this routine, by `position`, wrapping. If that day has since been deleted, its old `position` still locates the next existing day. Reordering days changes "next"; that's intended. The last performed day is also marked. |
| Ad hoc session without a routine | P0 | |
| Adding, removing, and reordering exercises in a running session | P0 | Doesn't change the routine. |

## Session view

| Feature | Priority | Notes |
| --- | --- | --- |
| List of session exercises; ones with logged sets are marked done | P0 | |
| Tapping an exercise opens the exercise logging view | P0 | |
| Substitution picker | P0 | Alternatives first, then exercises sharing a primary muscle sorted by most recently used, then search across all exercises. Substituting before any set is logged swaps the exercise in place. After sets are logged, the substitute is added right after it in the same slot, so the logged sets stay with the exercise they were performed on. |
| Session timer with manual start/stop and idle auto-end | P0 | Starts on the first logged set or a manual start; starting a session from the start screen is the manual start. Idle auto-end is derived, never written (see [architecture.md](architecture.md#data-model-client)); a session without sets idles from its start. A manual stop of a session that has already idled out ends it at its last activity. Logging into an ended session (idle or manual) asks whether to continue it, which clears a manual end, or start a new session for the same routine day. |
| Hide the session timer in settings | P1 | Hides only the running elapsed time; the session keeps its start and end, and ended sessions still show their duration. |
| Web app open in several tabs | P0 | Only one tab holds the database; the others offer "use here". |
| Session notes | P1 | |

## Exercise logging view

| Feature | Priority | Notes |
| --- | --- | --- |
| Fast weight and reps entry | P0 | Steppers plus a numeric keypad; one tap to log. Prefill: set 1 copies set 1 of the previous performance. Set n copies the weight of this session's set n-1, and the reps of the previous performance's set n (or this session's set n-1 if there is none). Duration and distance follow the reps rule. |
| Tap a previous-performance row to copy it into the input | P0 | |
| Previous performance shown alongside | P0 | The last session of the selected exercise only. Other exercises that filled the same slot are not shown; they are irrelevant for progressive overload. Expandable to the last N sessions. |
| Progress markers on sets: PR, set record, weight increase | P0 | Shown on logged sets and in history. Tapping a marker shows this set's value next to what it beat. Rules in [progress markers](#progress-markers). |
| Edit and delete logged sets | P0 | |
| History graph for the exercise | P1 | Metrics: best e1RM per session, e1RM of each set, top weight, volume, reps at a weight. |
| Records table: best weight for 1..N reps, best e1RM, heaviest weight, most reps at a weight | P1 | Covers sets above the e1RM cap. |

## Progress markers

Each set gets at most one marker, checked in this order:

1. **PR** (trophy)
2. **Set record** (star)
3. **Weight increase** (up arrow)

The last two compare against the **reference set**: the set with the same index
in the previous performance. Sets are ordered by `position`, and deleted sets
don't count.

### `weight_reps` and `bodyweight_reps`

- **e1RM** uses Epley and is computed only for 1–12 reps. The cap is a setting. Above the cap, e1RM is undefined: estimates there are unreliable.
- **PR:** the set's e1RM is greater than the best e1RM of every earlier set of this exercise. Sets above the cap can't be PRs.
- **Set record:**
  - if both this set and the reference set have an e1RM: this set's e1RM is greater;
  - otherwise (either is above the cap): this set dominates the reference, meaning weight ≥ and reps ≥, with at least one strictly greater. This catches high-rep progress without trusting a formula.
- **Weight increase:** the weight is greater than the reference set's weight, but it isn't a set record. This is the double progression step: more weight, fewer reps.
- `bodyweight_reps` with 0 added weight on both sets is compared like `reps`. For PRs, a set without added weight competes on reps with earlier sets without added weight; a set with added weight competes on the e1RM of the added weight.

### Other exercise types

| Type | PR and set record compare | Weight increase |
| --- | --- | --- |
| `reps` | reps | n/a |
| `time` | duration | n/a |
| `distance_time` | distance | n/a |

### Edge cases

- "Greater" means greater by more than an epsilon (1e-6 kg). Ties get no marker.
- No reference set (first session of the exercise, or more sets than last time): no set record or weight increase marker.
- The first session of an exercise never shows PRs, because everything would be one. For the same reason, a PR needs at least one earlier comparable set: one with an e1RM, or for the other kinds, a value of the same kind.
- Markers in history are computed against the history before each session, so they show what was achieved at the time.

## Rest timer

| Feature | Priority | Notes |
| --- | --- | --- |
| Starts automatically when a set is logged | P0 | Duration from slot override > exercise default > global default (2:00). |
| Can be turned off in settings | P1 | Turning it off cancels a running rest. |
| Adjust with +/-15 s, skip, restart | P0 | |
| Vibration and sound on finish, including in the background and over music | P0 (Android) | Plays at alarm volume in silent mode and DND; music is ducked during the alert. See [architecture.md](architecture.md#rest-timer). Web: works only while the page is visible. Web is best effort. |
| Countdown in a notification or on the lock screen while running | P0 (Android) | Comes with the countdown service that drives the timer. |

## Measurements (custom data)

A page for tracking body data and other quantities next to training data.

| Feature | Priority | Notes |
| --- | --- | --- |
| Built-in body weight metric | P1 | |
| User-defined metrics with a unit, e.g. biceps circumference (cm) | P1 | |
| Manual entry with date/time and a note; edit, delete | P1 | |
| Body weight import from Android Health Connect | P1 (Android) | Incremental and idempotent. See [architecture.md](architecture.md#health-connect). Imported values sync to other devices like any data. |
| Combined chart: any number of series on a shared time axis | P1 | Series can be metrics or derived training series (e1RM of an exercise, weekly weighted sets of a muscle, session count). Two display modes: stacked panels with a shared crosshair, or one overlaid panel with each series normalized to % change from the range start. |
| Smoothing (moving average) per series | P1 | Daily body weight is noisy. |
| Scatter plot of series A vs B, e.g. body weight vs bench e1RM, values paired by week | P2 | |
| Relative strength series (e1RM / body weight) | P2 | |

## Analytics

| Feature | Priority | Notes |
| --- | --- | --- |
| Per-exercise charts over selectable date ranges | P1 | Same metrics as the history graph. |
| Weekly weighted sets per muscle and muscle group | P1 | |
| Session duration and total volume over time | P1 | |
| PR list and recent PRs | P1 | |

## Calendar and frequency

| Feature | Priority | Notes |
| --- | --- | --- |
| Month calendar with sessions marked per day | P1 | A session's day is the local date of its start in the session's time zone. Weeks start on Monday (a setting). Several sessions per day are possible. Each mark is labeled and colored by the routine day, or "ad hoc". Tapping a day lists its sessions; tapping a session opens it read-only, with editing available. |
| Year heatmap of training days | P2 | |
| Sessions per week over time, with average | P1 | |
| Days between sessions: average and distribution | P1 | |
| Per muscle group: days trained per week | P1 | A day counts for a muscle group if any exercise with a primary muscle in the group was performed. |
| Per routine day: how often each day was performed, last date performed | P1 | Shows whether the cycle is actually followed. |

The measurements chart and the analytics page share the same charting and
series code.

## Data

| Feature | Priority | Notes |
| --- | --- | --- |
| Fully functional without network | P0 | |
| Undo for deletes and edits ("undone" snackbar) | P1 | Each core write records the previous row version in a local, non-synced undo stack. Undo writes that version back as a new change with a fresh HLC, so it syncs like any edit. Deletes are soft, so undoing one revives the whole subtree. |
| Multi-step undo/redo history | P2 | |
| FitNotes import | P0 | See [fitnotes-import.md](fitnotes-import.md). |
| Backups, with their age visible in settings | P0 | See [backups.md](backups.md). |
| CLI to fetch data as JSON/CSV | P1 | |
| Weight unit setting (kg/lb), display only | P2 | Storage is always kg. See [architecture.md](architecture.md#units-and-rounding) for the rounding rules. |

## Non-goals

- Social features, shared routines between users, teams.
- Public signup and production-grade operations (SLAs, abuse handling beyond quotas).
- Prescribed weights, reps, or set counts in routines.
- Set types and extra set data: warm-up sets, supersets, drop sets, RPE, per-set notes. A set is weight × reps (or time/distance for those exercise types).
- Automatic body weight in bodyweight exercises. Users enter whatever weight they want to track.
- Coaching, AI-generated programs inside the app. Use the CLI with external tools instead.
- Nutrition tracking.
