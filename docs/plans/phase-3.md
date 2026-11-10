# Phase 3 plan: logging slice, web

Detailed plan for phase 3 of [implementation-plan.md](../implementation-plan.md).
Deleted once the phase is done and its decisions are in the design docs.

## Status

Everything in the order of work below is built. Decisions are recorded in
architecture.md, features.md, and backups.md. Verified:

- `pnpm check` passes: core tests cover the commands, queries, settings, snapshot round trips, and undo by transaction.
- 31 Storybook stories cover every screen at phone and PC widths, light and dark, with accessibility checks. Writing them found and fixed two accessibility bugs: low contrast on the next-set placeholder, and set buttons whose accessible name hid their visible text.
- Playwright end-to-end tests cover logging with undo, persistence across reloads, the tab handoff in both directions, and offline use of the production build.

Left before the phase is done:

1. The exit check: a full real workout in the phone's browser, plus installing the PWA there.
2. Firefox: tab handoff and the `persist()` prompt are untested in this build.
3. Delete this file once the exit check passes, and mark the phase done.

## Decisions

| Concern | Choice | Reason |
| --- | --- | --- |
| Components | Base UI (`@base-ui/react`) | Headless and accessible, from the Radix authors. Actively released since v1; Radix Primitives releases have slowed. Styling stays in Tailwind. |
| React compilation | React Compiler via Babel | Automatic memoization from the start. |
| Worker RPC | Comlink | The `Driver` is synchronous, so Kysely and the `Store` live in the worker. The main thread calls named queries and commands; callbacks (change events) are proxied. |
| Icons | `lucide-react` | Maintained, tree-shaken SVG icons. |
| Validation | Valibot | Stored setting values may come from another app version; invalid values fall back to the default. Smaller and faster than zod at runtime and in type-checking. |
| PWA | `vite-plugin-pwa` 2 (Vite 8 support), prompt mode | "Reload to update" is never automatic. |

## Code layout

`packages/core/src`:

```
queries/     read queries for the UI: (db, args) => result, each tagged with the tables it reads
commands/    domain writes for the UI: start session, log set, edit routine, ... (through Store.write)
settings.ts  setting keys, defaults, Valibot schemas
snapshot/    snapshot file export and import (merge or replace)
```

Queries and commands are pure functions over a `Store`, unit-tested on Node.
Registries (`QUERIES`, `COMMANDS`) give the worker one typed dispatch point.

`apps/web/src`:

```
db/          worker (VFS, migrations, seeding), Comlink client, tab ownership, query hooks
components/  Base UI wrappers styled with Tailwind
features/    screens grouped by area: session, exercise, routine, settings
routes/      TanStack Router file routes, thin: they render feature components
```

## Data flow

1. The root tab-ownership gate takes the Web Lock, starts the worker, and waits for it to open the database (VFS, migrate with a pre-migration copy, seed).
2. `useDbQuery(name, args)` is a TanStack Query query keyed `["db", name, args]`. The query's table tags come from the `QUERIES` registry.
3. Commands run in the worker; after commit the store emits changed tables, the worker forwards them, and the client invalidates queries whose tags intersect.
4. Undoable commands return the undo transaction id; the snackbar undoes only that transaction.

## Layout

Phone-first for logging, comfortable on a PC for everything else:

- Narrow screens: bottom navigation, one pane.
- Wide screens (`lg`): side navigation; the session view shows the exercise list next to the logging pane; lists use the extra width instead of stretching one column.

## Screens

| Route | Content |
| --- | --- |
| `/` | Running session, start button, recent sessions |
| `/start` | Routine select (preselected), days with next and last marked, ad hoc |
| `/sessions/$sessionId` | Exercise list with done state, add/remove/reorder, session timer, end |
| `/sessions/$sessionId/$sessionExerciseId` | Entry with prefill and steppers, logged sets with markers, edit/delete, previous performance with tap-to-copy, substitution |
| `/routines`, `/routines/$routineId` | Routines, days, slots, alternatives |
| `/exercises`, `/exercises/new`, `/exercises/$exerciseId` | Browse and search, create and edit custom exercises |
| `/settings` | Units, increments, rest default, idle threshold, e1RM cap, snapshot export/import, storage persistence |

## Order of work

1. Core: settings, queries, commands, snapshot, undo by transaction id. Tests.
2. Web runtime: worker, tab ownership, query hooks, change invalidation.
3. Components and layout.
4. Screens, in the order of the table above.
5. Rest timer, undo snackbar, snapshot UI.
6. PWA.
7. Docs: move decisions into architecture.md and features.md, mark the phase done, delete this file.
