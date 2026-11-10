# AGENTS.md

Guidance for coding agents working in this repository.

## Project

A local-first workout logger: React web app + Capacitor Android shell, a Hono
server on a Dokploy-managed VPS (auth, sync, quotas, snapshots; backups to
Cloudflare R2), and a CLI. Used by the
owner and a few invited users. Not a production service, but user data
must never be lost or leaked between accounts.

Status: phase 3 of [docs/implementation-plan.md](docs/implementation-plan.md)
is built and awaiting its exit check. `apps/web` is a local-only PWA for
logging workouts: the DB worker, tab ownership, sessions, the logging view,
routines, exercises, settings, snapshots, and the web rest timer.
`packages/core` has the DB drivers, schema v1 and migrations, the write API,
the sync client and shared server sync module, the domain functions, and the
UI's queries and commands; `packages/exercises` has the seed catalog. Android,
the server, sync in the app, and the CLI are not built yet.

## Read first

- [docs/glossary.md](docs/glossary.md). Use these terms in code identifiers, UI text, and docs. Don't invent synonyms: a *slot* is not an "item", a *session* is not a "workout log".
- [docs/architecture.md](docs/architecture.md) for where code goes.
- [docs/sync.md](docs/sync.md) before touching anything that writes synced data.
- [docs/accounts.md](docs/accounts.md) before touching server endpoints.

## Docs are part of the change

- When behavior, data model, protocol, or architecture changes, update the relevant doc in the same change.
- When an item in [docs/open-questions.md](docs/open-questions.md) gets decided, move the decision into the relevant doc and delete the question.
- Implementation plans live in the repo. The overall plan is [docs/implementation-plan.md](docs/implementation-plan.md); mark phases done and adjust it as work proceeds. Detailed plans for a single phase go in `docs/plans/<phase>.md` and are deleted once the phase is done and its decisions are in the design docs.
- Docs describe the current design, not its history.

## Invariants

Breaking these causes data loss or leaks. Don't take shortcuts here.

1. **All writes to synced tables go through the `core` write API.** It stamps the HLC and writes the outbox entry in the same transaction. Never `INSERT`/`UPDATE` synced tables directly from UI or feature code.
2. **Never hard-delete synced rows on the client.** Set `deleted = 1`. Deletes don't cascade: deleting a parent writes only the parent's tombstone, and queries hide children of deleted parents.
3. **Ids are client-generated:** UUIDv7 for new entities. Seeds and imports (builtins, FitNotes, Health Connect) use deterministic ids *and* HLCs from their pseudo-node ([docs/sync.md](docs/sync.md#deterministic-writes)). Never use autoincrement ids for synced tables.
4. **Merge rule is row-level LWW by HLC, applied by clients.** The server's head table uses the same comparison, but the server never interprets `data`. The HLC rules in docs/sync.md are exact, and the sync fuzz test must pass after any change to clock or merge code.
5. **Every server query is scoped by the authenticated `user_id`** through the data-access module. No handler builds its own unscoped SQL.
6. **No foreign key enforcement on synced tables.** Queries must tolerate missing or deleted parents.
7. **Derived values (e1RM, records, volume) are not stored in synced tables.**
8. **Weights are stored in kg.** Unit conversion happens only in the UI.
9. **Domain schema changes follow [docs/migrations.md](docs/migrations.md):**
   - Each change is a new version step with DDL, a pure row `upgrade` function, and fixture tests.
   - Migrations never stamp HLCs or write outbox entries.
   - Released migrations are never edited.
   - Cross-row changes are data fixes, not migrations.
10. **The server is a single instance with one SQLite writer.** Pull correctness depends on it ([docs/sync.md](docs/sync.md#server-side)). Don't scale out or switch databases without redesigning `seq`.
11. **The Capacitor scheme (`https`) and hostname (`localhost`), the app id, the SAH-pool VFS directory, and the database file name never change.** Changing any of them orphans every user's local database ([docs/architecture.md](docs/architecture.md#client-runtime)).
12. **Auth tokens on Android live only in secure storage**, never in `localStorage` or WebView storage. Android Auto Backup stays disabled.

## Private data

- Never commit `data/`, `*.fitnotes`, snapshots, or `.env*`. They hold real personal training and health data.
- Don't paste real user data into issues, PR descriptions, or test fixtures. Generate synthetic fixtures.

## Code conventions

- TypeScript, strict mode, ESM, pnpm workspaces.
- Prefer well-maintained libraries over hand-rolled code. Check existing dependencies first and justify new ones in the PR description. The sync protocol is the deliberate exception (see [docs/sync.md](docs/sync.md#alternatives-considered)).
- Check current library docs instead of relying on memory. Several dependencies (Capacitor, Better Auth, SQLite WASM) change between major versions.
- Comments only for constraints, non-obvious reasons, and known risks. No comments that restate code or record history.
- Keep files focused. Split modules that accumulate unrelated responsibilities.
- Domain logic (e1RM, records, next day, idle auto-end, sync merge) lives in `packages/core`, is pure where possible, and has unit tests.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):
`<type>(<optional scope>): <imperative summary>`, e.g. `feat(core): add HLC clock`,
`fix(sync): keep outbox entry when row changes mid-push`, `docs: describe backups`.

- Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.
- Scopes: the app or package, i.e. `web`, `android`, `server`, `cli`, `core`, `exercises`, or an area like `sync`.
- Breaking changes to the sync protocol or the stored data format are marked with `!` and explained in the body.

## Commands

Requires Node >= 24 and pnpm (version pinned in `packageManager`). Run from
the repo root.

| Command | What it does |
| --- | --- |
| `pnpm install` | Install all workspace dependencies. |
| `pnpm dev` | Vite dev server for `apps/web` on http://localhost:5173. |
| `pnpm build` | Build every package that has a `build` script. |
| `pnpm lint` | Biome lint, format, and import-order check. |
| `pnpm format` | Apply Biome's formatting and safe fixes. |
| `pnpm typecheck` | `tsc` in every package. |
| `pnpm test` | Vitest across all packages; `pnpm test <filter>` to narrow by file name. |
| `SYNC_FUZZ_RUNS=5000 pnpm test fuzz` | Longer sync fuzz run (CI runs 300). Run it after changing clock, merge, or sync code. |
| `pnpm check` | lint, typecheck, test, build: what CI runs. |

- Workspace packages export their TypeScript sources directly; there is no per-package build step for `packages/*`.
- `apps/web/src/routeTree.gen.ts` is generated by the TanStack Router Vite plugin on `pnpm dev` and `pnpm build`. It is committed so `pnpm typecheck` works without a build. Commit it together with route changes; CI fails if it is stale. Biome ignores it.
- Biome doesn't format Markdown; docs are formatted by hand.
