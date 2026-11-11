# Glossary

These terms are used consistently in the UI, code, and docs. Planned things
(templates) and performed things (logs) have separate names so they don't get
mixed up.

## Exercise catalog

| Term | Meaning |
| --- | --- |
| **Exercise** | A movement that can be logged, e.g. "Barbell Row". Built-in or user-created. Has an exercise type and muscle targets. |
| **Exercise type** | What a set of this exercise records: `weight_reps` (most lifts), `bodyweight_reps` (pull-ups, optional added weight), `reps`, `time` (plank), `distance_time` (cardio). Decides which input fields and stats apply. |
| **Muscle** | An entry in a fixed list of muscles, e.g. lats, upper back, biceps, quads. Detailed enough for useful analytics without needing anatomical precision. |
| **Muscle group** | A coarse grouping of muscles used in pickers and summaries, e.g. Back = lats + upper back + traps + lower back. |
| **Muscle target** | An exercise-to-muscle link with a contribution factor in `0..1`. A row is lats 1.0, upper back 1.0, biceps 0.5, rear delts 0.5. |
| **Primary muscle** | Any muscle target with factor 1.0. Used to find substitutes. |

## Planning (templates)

Plans say *what* to train, never *how much*. Weight, reps, and set counts are
free, which is what double progression needs. The app helps by showing the
previous performance, not by prescribing.

| Term | Meaning |
| --- | --- |
| **Routine** | A named training plan made of an ordered cycle of workout days, e.g. "Upper/Lower 4x". You can switch between routines freely. |
| **Workout day** (day) | One entry in a routine's cycle, e.g. "Upper A". Holds an ordered list of slots. |
| **Cycle** | The order of days in a routine. After the last day the cycle wraps back to the first. |
| **Slot** | A position in a workout day. It holds a default exercise, optional alternatives, an optional rest time override, and an optional free-text note. Slots have no rep, weight, or set targets. |
| **Built-in routine** | A routine shipped with the app. Adding one copies it into your routines; the copy is yours to edit. |
| **Alternative** | An exercise you pre-pick as an acceptable replacement for a slot's default exercise, e.g. Dumbbell Row for a Barbell Row slot. Shown first in the substitution picker. |

## Logging (performed)

| Term | Meaning |
| --- | --- |
| **Session** | One performed workout: a start time, an end time, and the exercises performed. It may reference the routine and day it followed, or be ad hoc. Sessions are time-based, not date-based; a calendar day can hold several. |
| **Session exercise** | One exercise performed in a session. It may point to the slot it fills. If its exercise differs from the slot's default, it is a substitution. |
| **Substitution** | Performing a different exercise in place of a slot's default. Allowed for any exercise, at any time. History is recorded under the exercise actually performed. |
| **Set** | One logged effort: weight + reps (or time/distance per exercise type) and a timestamp. Nothing else; there are no set types such as warm-up or superset. |
| **Previous performance** | The sets of the selected exercise in the most recent earlier session that included it. Shown while logging as the target to beat. Only that exact exercise counts, never other exercises from the same slot. |

## Metrics and records

| Term | Meaning |
| --- | --- |
| **e1RM** (estimated one-rep max) | The weight you could lift for one rep, estimated from a set's weight and reps. Epley: `w * (1 + reps / 30)`, with `e1RM = w` for 1 rep. Defined only up to the **e1RM cap** (default 12 reps); above it the estimate is too unreliable. |
| **Reference set** | The set with the same index in the previous performance. Set 2 today is compared with set 2 last time. |
| **Progress marker** | At most one per set: PR, set record, or weight increase. Full rules in [features.md](features.md#progress-markers). |
| **PR** (personal record, trophy) | A set whose e1RM beats every earlier set of that exercise. Other record kinds (heaviest weight, best weight for N reps) appear in the records table but don't produce a marker. |
| **Set record** (star) | A set that beats its reference set: higher e1RM, or, when either set is above the e1RM cap, at least as much weight and reps with one of them strictly more. |
| **Weight increase** (up arrow) | A set with more weight than its reference set that is not a set record, typically fewer reps after a weight bump. Marks the double progression step. |
| **Weight unit** | Display setting, `kg` or `lb`. Storage is always kg. |
| **Weight increment** | The step used by the +/- buttons and for rounding converted values, e.g. 2.5 kg or 5 lb. A global default, overridable per exercise. |
| **Weighted sets** | A set count per muscle, where each set counts by the muscle target factor. 3 sets of rows = 3 lats, 3 upper back, 1.5 biceps, 1.5 rear delts. For a muscle group, each set counts once, by its largest factor in the group: the same rows are 3 back sets and 1.5 arm sets. |

## Measurements (custom data)

| Term | Meaning |
| --- | --- |
| **Metric** | A user-defined quantity tracked over time, with a unit. Examples: body weight (kg), biceps circumference (cm), body fat (%), sleep (h). Body weight is built in. |
| **Measurement** | One value of a metric at a point in time, with its source. |
| **Source** | Where a measurement came from: `manual`, `health_connect` (the Android health data store), or `import`. |
| **Series** | Anything plottable against time in the measurements chart: a metric, or a derived training series such as the best e1RM per session of an exercise, or weekly weighted sets for a muscle. |
| **Relative strength** | A derived series: e1RM divided by the body weight on that date. |

## Timers

| Term | Meaning |
| --- | --- |
| **Rest timer** | A countdown that starts when a set is logged. When it ends, the phone vibrates and plays a sound, even when the app is in the background or music is playing. Can be turned off in settings. |
| **Session timer** | Elapsed time of the current session. It starts on the first logged set or a manual start, and ends on a manual stop or idle auto-end. Its display can be hidden in settings. |
| **Idle auto-end** | If no set has been logged for the idle threshold (default 15 min, configurable), the session counts as ended at the timestamp of its last set, or at its start if it has no sets. |

## Data, sync, and backups

See [sync.md](sync.md) and [backups.md](backups.md).

| Term | Meaning |
| --- | --- |
| **Local store** | The on-device SQLite database. It is the source of truth for the device; the app works fully offline. |
| **Synced table** | A domain table whose rows replicate between devices. Every row has `id`, `hlc`, and `deleted` columns. |
| **HLC** (hybrid logical clock) | A timestamp combining wall-clock time, a counter, and the device id. HLCs are unique and totally ordered, and roughly follow real time. |
| **Change** | The full state of one row after a write: table, id, HLC, deleted flag, and data. Sync moves changes, not diffs. |
| **LWW** (last writer wins) | The merge rule: of two versions of a row, the one with the greater HLC wins. |
| **Outbox** | A local table listing rows written on this device that the server hasn't acknowledged yet. |
| **Cursor** | The highest `seq` a device has pulled and applied. |
| **Head table** | The server's only sync table: the newest version of each row by HLC, with the sequence number (`seq`) it got when it arrived. Pulls read it by `seq`; snapshots read all of it. |
| **Server epoch** | A random id that changes when the server database is restored. A client that sees a new epoch re-uploads everything and re-pulls. |
| **Pseudo-node** | A fixed HLC node id (`seed`, `hc`, `fitnotes`, `restore`) used for deterministic writes, so the same import produces identical changes on every device. |
| **Snapshot** | The full current state of all synced rows as one file. |
| **Server** | Handles accounts, quotas, and each user's rows. It stores the newest version of each row and orders them; all merging happens on the clients. |

## Accounts

See [accounts.md](accounts.md).

| Term | Meaning |
| --- | --- |
| **Account** (user) | A login. Each account's data is fully isolated; accounts never share rows. |
| **Owner** | The admin account (you). No quotas. Manages users and quotas. |
| **Account cap** | The most accounts the server allows, the owner included. Sign-up is open until it is reached. |
| **Quota** | A per-user limit on server usage: bytes written per day, bytes stored, request rate, snapshots per day. Hitting one pauses sync, never local use. |
| **Disabled account** | An account the owner has switched off: its sign-ins and Android tokens are revoked and it can't sign in or sync. Its data stays on the server and on its devices. |
| **API key** | A personal, revocable token the CLI uses instead of a login session. |
