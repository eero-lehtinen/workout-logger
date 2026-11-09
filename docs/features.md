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
| Android app from the same UI codebase | P0 | Needed for a reliable rest timer alert and health data access. See [architecture.md](architecture.md#android). |
| Sync between devices | P0 | Phone and web are both used from the start. See [sync.md](sync.md). |
| iOS | - | Out of scope. |

## Accounts

The app is shared with coworkers, each with their own private data. See
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
| Custom exercises: create, edit, archive | P0 | |
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
| Routine of the most recent session preselected; changeable | P0 | |
| Next day in the cycle highlighted; any day selectable | P0 | Next = the day after the last session's day in this routine, wrapping. The last performed day is also marked. |
| Ad hoc session without a routine | P0 | |
| Adding, removing, and reordering exercises in a running session | P0 | Doesn't change the routine. |

## Session view

| Feature | Priority | Notes |
| --- | --- | --- |
| List of session exercises; ones with logged working sets are marked done | P0 | |
| Tapping an exercise opens the exercise logging view | P0 | |
| Substitution picker | P0 | Alternatives first, then exercises sharing a primary muscle sorted by most recently used, then search across all exercises. |
| Session timer with manual start/stop and idle auto-end | P0 | Starts on the first logged set. Idle auto-end is computed when the app next opens, so no background process is needed. |
| Session notes | P1 | |

## Exercise logging view

| Feature | Priority | Notes |
| --- | --- | --- |
| Fast weight and reps entry | P0 | Prefilled from the previous set, or from the same set index of the previous performance. Steppers plus a numeric keypad. One tap to log. |
| Previous performance shown alongside | P0 | The last session of this exercise. Expandable to the last N sessions. |
| Dim star for set records, bright star for PRs | P0 | Shown on logged sets and in history. |
| Edit and delete logged sets | P0 | |
| Warm-up flag | P1 | |
| Per-set notes, RPE | P2 | |
| History graph for the exercise | P1 | Metrics: best e1RM per session, e1RM of each set, top weight, volume, reps at a weight. |
| Records table: best weight for 1..N reps, best e1RM, heaviest weight | P1 | |

## Rest timer

| Feature | Priority | Notes |
| --- | --- | --- |
| Starts automatically when a set is logged | P0 | Duration from slot override > exercise default > global default. |
| Adjust with +/-15 s, skip, restart | P0 | |
| Vibration and sound on finish, including in the background and over music | P0 (Android) | Web: works only while the page is visible. Web is best effort. |
| Countdown in a notification or on the lock screen while running | P1 (Android) | |

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
| Body weight added to bodyweight-exercise e1RM, e.g. pull-ups | P2 | |

## Analytics

| Feature | Priority | Notes |
| --- | --- | --- |
| Per-exercise charts over selectable date ranges | P1 | Same metrics as the history graph. |
| Weekly weighted sets per muscle and muscle group | P1 | |
| Session frequency, duration, total volume over time | P1 | |
| PR list and recent PRs | P1 | |
| Calendar view of sessions | P1 | |

The measurements chart and the analytics page share the same charting and
series code.

## Data

| Feature | Priority | Notes |
| --- | --- | --- |
| Fully functional without network | P0 | |
| FitNotes import | P0 | See [fitnotes-import.md](fitnotes-import.md). |
| Backups, with their age visible in settings | P0 | See [backups.md](backups.md). |
| CLI to fetch data as JSON/CSV | P1 | |
| Units: kg storage, kg/lb display | P2 | |

## Non-goals

- Social features, shared routines between users, teams.
- Public signup and production-grade operations (SLAs, abuse handling beyond quotas).
- Prescribed weights, reps, or set counts in routines.
- Coaching, AI-generated programs inside the app. Use the CLI with external tools instead.
- Nutrition tracking.
