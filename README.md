# Workout Logger

Local-first strength training logger. A web app plus an Android build from the
same codebase, sync between devices, invite-only accounts for a few users, and
a CLI for exporting data to scripts and AI tools.

Status: the web app logs workouts locally and works offline, and the Android
app wraps it with a background rest timer; the server and sync are not built
yet. See
[docs/implementation-plan.md](docs/implementation-plan.md).

## Documentation

- [docs/glossary.md](docs/glossary.md) - terms used in the code and docs
- [docs/features.md](docs/features.md) - feature requirements and priorities
- [docs/architecture.md](docs/architecture.md) - tech stack, data model, platform specifics
- [docs/sync.md](docs/sync.md) - sync protocol
- [docs/accounts.md](docs/accounts.md) - login, roles, quotas, privacy
- [docs/migrations.md](docs/migrations.md) - schema migrations, data fixes, version compatibility
- [docs/backups.md](docs/backups.md) - backup layers and restore procedures
- [docs/deployment.md](docs/deployment.md) - VPS/Dokploy deployment and recovery procedures
- [docs/fitnotes-import.md](docs/fitnotes-import.md) - migrating data from FitNotes
- [docs/implementation-plan.md](docs/implementation-plan.md) - phases and milestones
- [docs/open-questions.md](docs/open-questions.md) - undecided items
