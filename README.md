# Workout Logger

Local-first strength training logger. A web app plus an Android build from the
same codebase, sync between devices, and accounts for a few users.

Status: in daily use, replacing FitNotes. The web app logs workouts locally and
works offline, with exercise history, records, a calendar, and frequency
stats. The Android app wraps it with a background rest timer and takes web
updates without a new APK. Both sync through the server after a Google sign-in,
and the server backs up to R2. Measurements, a CLI, and more analytics are
future work; see [docs/implementation-plan.md](docs/implementation-plan.md).

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
