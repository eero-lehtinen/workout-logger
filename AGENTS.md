# AGENTS.md

Guidance for coding agents working in this repository.

## Project

A local-first workout logger: React web app + Capacitor Android shell, a Hono
server on Cloudflare (auth, sync, quotas, snapshots), and a CLI. Used by the
owner and a few invited coworkers. Not a production service, but user data
must never be lost or leaked between accounts.

Status: design phase. The docs describe the intended system. Code does not
exist yet unless you see it.

## Read first

- [docs/glossary.md](docs/glossary.md). Use these terms in code identifiers, UI text, and docs. Don't invent synonyms: a *slot* is not an "item", a *session* is not a "workout log".
- [docs/architecture.md](docs/architecture.md) for where code goes.
- [docs/sync.md](docs/sync.md) before touching anything that writes synced data.
- [docs/accounts.md](docs/accounts.md) before touching server endpoints.

## Docs are part of the change

- When behavior, data model, protocol, or architecture changes, update the relevant doc in the same change.
- When an item in [docs/open-questions.md](docs/open-questions.md) gets decided, move the decision into the relevant doc and delete the question.
- Docs describe the current design, not its history.

## Invariants

Breaking these causes data loss or leaks. Don't take shortcuts here.

1. **All writes to synced tables go through the `core` write API.** It stamps the HLC and writes the outbox entry in the same transaction. Never `INSERT`/`UPDATE` synced tables directly from UI or feature code.
2. **Never hard-delete synced rows on the client.** Set `deleted = 1`.
3. **Ids are client-generated:** UUIDv7 for new entities, UUIDv5 for entities with a natural key (builtin key, FitNotes row id, Health Connect record id). Never use autoincrement ids for synced tables.
4. **Merge rule is row-level LWW by HLC, applied on the client only.** The server stores and orders changes but never merges or interprets `data`.
5. **Every server query is scoped by the authenticated `user_id`** through the data-access module. No handler builds its own unscoped SQL.
6. **No foreign key enforcement on synced tables.** Queries must tolerate missing or deleted parents.
7. **Derived values (e1RM, records, volume) are not stored in synced tables.**
8. **Weights are stored in kg.** Unit conversion happens only in the UI.
9. **Schema changes need a migration** for local tables and an upgrade function for incoming sync rows with an older `v`.

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

To be added when the workspace is scaffolded.
