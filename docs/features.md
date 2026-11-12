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

The app is shared with a few other users, each with their own private data. See
[accounts.md](accounts.md).

| Feature | Priority | Notes |
| --- | --- | --- |
| Use without an account (local only) | P0 | |
| Sign-in; sync tied to the account | P0 | GitHub. No passwords. |
| Google sign-in (GitHub behind a flag) | P1 | |
| Open sign-up up to an account cap | P1 | |
| Per-user quotas for non-owner users; usage visible to the user | P1 | Quotas are needed before anyone else signs up. |
| Owner admin page: users, usage, quotas, disable, delete | P1 | |
| Personal API keys for the CLI | P1 | |
| Account deletion and full data export by the user | P1 | |

## Exercise catalog

| Feature | Priority | Notes |
| --- | --- | --- |
| Built-in exercise list with exercise types and muscle targets | P0 | Seeded from an open dataset and curated. |
| Custom exercises: create, edit, archive, copy | P0 | Copying prefills a new exercise from any exercise, built-in ones included. |
| Browse and search by name and muscle group | P0 | The exercise picker (adding to a session or routine, substituting) has the same search and muscle group filter. Both sort by name, most recently logged, or most logged (logged sets); the order is shared and remembered on the device. A logged exercise's row in the list shows its set count and best set: the set that holds the first record of the records headline, e.g. best e1RM. Of sets with equal e1RM, the one with fewer reps is shown. |
| Edit an exercise's muscle targets | P1 | |
| Per-exercise default rest time and notes | P1 | |

## Routines

| Feature | Priority | Notes |
| --- | --- | --- |
| Create routines with an ordered cycle of days | P0 | |
| Routine description | P2 | Free text under the name in the editor, e.g. what the routine is for and how to run it. Shown in the routine list. |
| Each day has ordered slots; each slot has a default exercise | P0 | |
| Per-slot alternatives | P0 | |
| Per-slot rest override and free-text note | P1 | For example, a note like "heavy, 6-10" as a reminder, shown above the sets while logging. Never validated. |
| Reorder, duplicate, archive routines, days, slots | P1 | Routines and days can be duplicated; a copy keeps the slots, alternatives, notes, and rest overrides. Only routines can be archived; days and slots are deleted, with undo. |
| Built-in routines | P2 | Listed on the Routines screen. Adding one creates an ordinary routine from it, with its description, with undo; the user then owns and edits it. Built-in routines use only built-in exercises, and each slot's alternatives use equipment most gyms have. The first is Eero's Upper/Upper/Lower, the owner's low-volume, high-intensity routine: Upper A starts with chest and back, Upper B with arms, then Lower. |

## Starting a session

| Feature | Priority | Notes |
| --- | --- | --- |
| Routine of the most recent session preselected; changeable | P0 | "Most recent" = latest `started_at` among sessions that have a routine. Ad hoc sessions are ignored. |
| Next day in the cycle highlighted; any day selectable | P0 | Next = the day after the latest session's day in this routine, by `position`, wrapping. If that day has since been deleted, its old `position` still locates the next existing day. Reordering days changes "next"; that's intended. Each day shows its first exercises. |
| Ad hoc session without a routine | P0 | |
| Adding, removing, and reordering exercises in a running session | P0 | Doesn't change the routine. |

## Session view

| Feature | Priority | Notes |
| --- | --- | --- |
| List of session exercises; ones with logged sets are marked done | P0 | |
| Tapping an exercise opens the exercise logging view | P0 | |
| Substitution picker | P0 | Alternatives first, then exercises sharing a primary muscle, then all other exercises, each in the picker's chosen order; typing searches all exercises. Substituting before any set is logged swaps the exercise in place. After sets are logged, the substitute is added right after it in the same slot, so the logged sets stay with the exercise they were performed on. The session list, a past session, and the logging screen show the slot's default exercise with a substitute's name, marked with the Substitute icon. |
| Session timer with manual start/stop and idle end | P0 | Starts on the first logged set or a manual start; starting a session from the start screen is the manual start. Idle end is derived, never written (see [architecture.md](architecture.md#data-model-client)); a session without sets idles from its start. A manual stop of a session that has already idled out ends it at its last activity. Logging into an ended session (idle or manual) asks whether to continue it, which clears a manual end, or start a new session for the same routine day. An ended session offers Resume: a manual end is cleared; an idle session opens the exercise to continue with (the first without sets, else the last), and its next set continues the session without asking. |
| Hide the session timer in settings | P1 | Hides only the running elapsed time; the session keeps its start and end, and ended sessions still show their duration. |
| Keep the screen on while a session runs | P1 | A setting, off by default. Android, and browsers with the Screen Wake Lock API. |
| Web app open in several tabs | P0 | Only one tab holds the database; the others offer "use here". |
| Session notes | P1 | One for the session, edited under its exercise list, and one per exercise in it, edited in the logging view (behind "Add note" until it has text) and shown in the exercise's row. Both save on leaving the field. A past session shows them read-only. |

## Exercise logging view

| Feature | Priority | Notes |
| --- | --- | --- |
| Fast weight and reps entry | P0 | Steppers plus a numeric keypad; one tap to log. Prefill: set 1 copies set 1 of the previous performance. Set n copies the weight of this session's set n-1, and the reps of the previous performance's set n (or this session's set n-1 if there is none). Duration and distance follow the reps rule. |
| Tap a previous-performance row to copy it into the input | P0 | |
| Previous performance shown alongside | P0 | The last session of the selected exercise only. Other exercises that filled the same slot are not shown; they are irrelevant for progressive overload. Expandable to the last N sessions. |
| Progress markers on sets: PR, set record, weight increase | P0 | Shown on logged sets and in history. Tapping a marker shows this set's value next to what it beat. Rules in [progress markers](#progress-markers). |
| Edit and delete logged sets | P0 | |
| History graph for the exercise | P1 | Metrics, picked from a dropdown: best e1RM per session, e1RM of each set (one line per set number: set 1 of every session, set 2, ...), top weight, reps at a weight, and sets per week. Bodyweight exercises add most reps without added weight; reps, time, and distance exercises plot the best set. Sets per week are bars over every week since the first session, empty weeks included; the average stops at the last session, so a dropped exercise keeps the average it had. A trend line, on by default, fits the points in view and states its rate per month, so zooming shows that stretch's progress. A full-screen view gives the graph the whole window, with the same metric controls; back, including Android's, closes it. Volume (weight × reps) and per-session totals are not shown: they mix heavy and light work into a number nobody trains for. The exercise list and the logging view open the exercise's history screen, which also lists past sessions with their markers. |
| Records table: best weight for 1..N reps, best e1RM, heaviest weight, most reps at a weight | P1 | Covers sets above the e1RM rep limit. By rep count: the heaviest weight for exactly that many reps. By weight: the most reps at that weight. A row is dimmed when another set had at least as much weight and as many reps. The first session to reach a value holds the record. |
| Period of the history screens | P1 | 3 months, 6 months, a year, or all, ending today. On an exercise it filters the graph, the records, and the session list; markers still compare with all earlier history. The History tab's frequency stats use the same period. |
| Remembered view choices | P1 | The period, the graph metric, the trend line, the records table, showing muscles, and the weight for "reps at a weight" (per exercise) are remembered on the device. They are view preferences, not synced settings. |
| Back returns where you came from | P1 | An exercise's history and editor return to the logging screen, session, or list they were opened from; a session returns to the exercise history or calendar day it was opened from, or to Today. |

## Progress markers

Each set gets at most one marker, checked in this order:

1. **PR** (trophy)
2. **Set record** (star)
3. **Weight increase** (up arrow)

A set record compares against every earlier set with the same set number: set 2
today against set 2 of every earlier performance of the exercise. A weight
increase compares against the **reference set**: the set with the same set
number in the previous performance. Sets are numbered by `position` within the
performance. Deleted sets, and sets of deleted session exercises or sessions,
don't count.

### `weight_reps` and `bodyweight_reps`

- **e1RM** uses Epley and is computed only for 1–12 reps. The cap is a setting. Above the cap, e1RM is undefined: estimates there are unreliable.
- **PR:** the set's e1RM is greater than the best e1RM of every earlier set of this exercise. Sets above the cap can't be PRs.
- **Set record:** the set beats every earlier set with its set number. Against each earlier set:
  - if both have an e1RM: this set's e1RM is greater;
  - otherwise (either is above the cap): this set dominates the earlier one, meaning weight ≥ and reps ≥, with at least one strictly greater. This catches high-rep progress without trusting a formula.

  Matching an earlier best, or beating last time after a worse session, is not a set record. Tapping the star shows the earlier set that was hardest to beat: the highest e1RM, or above the cap the heaviest, then the most reps.
- **Weight increase:** the weight is greater than the reference set's weight, but it isn't a set record. This is the double progression step: more weight, fewer reps.
- `bodyweight_reps` with 0 added weight on both sets is compared like `reps`. For PRs, a set without added weight competes on reps with earlier sets without added weight; a set with added weight competes on the e1RM of the added weight. For set records, a set without added weight is compared only with earlier sets without added weight; a set with added weight is compared with all of them.

### Other exercise types

| Type | PR and set record compare | Weight increase |
| --- | --- | --- |
| `reps` | reps | n/a |
| `time` | duration | n/a |
| `distance_time` | distance | n/a |

### Edge cases

- "Greater" means greater by more than an epsilon (1e-6 kg). Ties get no marker.
- No earlier set with the same set number (first session of the exercise, or more sets than ever before): no set record. No reference set (more sets than last time): no weight increase.
- A session that has the exercise twice is one performance, numbered in session order, so its sets don't compete with each other for set records.
- The first session of an exercise never shows PRs, because everything would be one. For the same reason, a PR needs at least one earlier comparable set: one with an e1RM, or for the other kinds, a value of the same kind.
- Markers in history are computed against the history before each session, so they show what was achieved at the time.

## Rest timer

| Feature | Priority | Notes |
| --- | --- | --- |
| Starts automatically when a set is logged | P0 | Duration from slot override > exercise default > global default (2:00). |
| Can be turned off in settings | P1 | Turning it off cancels a running rest. |
| Adjust with +/-15 s, skip, restart | P0 | |
| Alert volume: quiet, medium, loud | P1 | A setting; selecting a level previews it. On Android it scales the alert down from the phone's alarm volume. |
| Countdown floats over other screens | P0 | Tapping it opens the exercise whose set started the rest; opening "Rest over" also dismisses it. "Rest over" clears itself after a minute. |
| Vibration and sound on finish, including in the background and over music | P0 (Android) | Plays at alarm volume in silent mode and DND; music is ducked during the alert. See [architecture.md](architecture.md#rest-timer). Web: works only while the page is visible. Web is best effort. |
| Countdown in a notification or on the lock screen while running | P0 (Android) | Comes with the countdown service that drives the timer. The notification has "+15 s" and "Skip". |

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
| Weekly weighted sets per muscle and muscle group over time | P1 | The averages are on the History tab ([calendar and frequency](#calendar-and-frequency)); this is the chart over time. |
| Session duration over time | P1 | |
| PR list and recent PRs | P1 | |

## Calendar and frequency

| Feature | Priority | Notes |
| --- | --- | --- |
| Month calendar with sessions marked per day | P1 | A session's day is the local date of its start in the session's time zone. Weeks start on Monday or Sunday (a synced setting under Settings → Sessions). Several sessions per day are possible. Each mark is labeled and colored by the routine day (by its index in the cycle; six colors repeat), or "ad hoc". Tapping a day lists its sessions; tapping a session opens it read-only, with editing available. Sessions from today open editable, since an idle end may only be a long rest. |
| Year heatmap of training days | P2 | |
| Sessions per week over time, with average | P1 | Over the history period (3 months, 6 months, a year, or all); a period starts no earlier than the first session, so averages aren't diluted. |
| Days between sessions: average and distribution | P1 | Between training days: several sessions on one date count once. Gaps of 14 days or more share one bucket. |
| Per muscle group and muscle: weighted sets per week | P1 | [Weighted sets](glossary.md#metrics-and-records) averaged over the weeks of the period, with the last date trained. For a group, a set counts once, by its exercise's largest factor among the group's muscles. Muscles are listed under their groups behind a switch. |
| Per routine day: how often each day was performed, last date performed | P1 | Shows whether the cycle is actually followed. Archived routines are listed only if they were used in the period. |

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
- Public sign-up and production-grade operations (SLAs, abuse handling beyond quotas).
- Prescribed weights, reps, or set counts in routines.
- Set types and extra set data: warm-up sets, supersets, drop sets, RPE, per-set notes. A set is weight × reps (or time/distance for those exercise types).
- Automatic body weight in bodyweight exercises. Users enter whatever weight they want to track.
- Coaching, AI-generated programs inside the app. Use the CLI with external tools instead.
- Nutrition tracking.
