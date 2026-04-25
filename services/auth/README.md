# auth

Auth service — registration, OTP, JWT, refresh (`STU-REQ-01..11`).

## Run locally

```bash
uv sync
uv run uvicorn auth.main:app --reload --port 38001
curl http://localhost:38001/health
```

## Test

```bash
uv run pytest
```

## Lint

```bash
uv run ruff check .
uv run ruff format --check .
```

---

## Database migrations (Alembic)

Auth is the **template service** for the migration pattern other services will adopt in Sprint 1. If you're standing up migrations for another service, copy this layout verbatim.

### Layout

```
services/auth/
├── alembic.ini                    # config — script_location, file_template, post-write hooks
├── alembic/
│   ├── env.py                     # async-friendly env; reads DATABASE_URL from env
│   ├── script.py.mako             # template for new migration files
│   └── versions/
│       └── 001_create_auth_schema.py   # V001: schema + 4 enums + 5 tables + indexes
└── pyproject.toml                 # deps include sqlalchemy[asyncio], alembic, asyncpg
```

### How it differs from a vanilla Alembic setup

- **Async**. `env.py` uses `async_engine_from_config` + `asyncpg`. Mirrors how the service runs in production.
- **No `target_metadata`** yet. Migrations are hand-written SQL via `op.execute(...)` until SQLAlchemy ORM models land in Sprint 1. Then `target_metadata = Base.metadata` lights up `alembic revision --autogenerate`.
- **`DATABASE_URL` from env, never from `alembic.ini`**. The `sqlalchemy.url` line is intentionally blank. This is what lets the same config run against local Compose, CI, staging, and prod with no source change.
- **Post-write hook runs `ruff format`** on generated migrations so they're consistent with the rest of the codebase.
- **Schema-qualified DDL**. Tables are created in `auth_schema`, not `public`. In local Compose each service has its own database (`auth`, `quiz`, …) and the migration creates `auth_schema` inside it. In Aurora staging/prod, all 9 schemas coexist in one cluster — same DDL, one connection URL per schema.

### Run a migration

```bash
# From repo root — make target wires up DATABASE_URL from .env
make migrate svc=auth                 # alembic upgrade head
make migrate-status svc=auth          # current revision

# Or directly inside the service
cd services/auth
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:35432/auth \
  uv run alembic upgrade head
```

Prereqs: `make dev` running (Postgres healthy on localhost:35432) and `uv sync` done in `services/auth/`.

### Validate

```bash
docker exec -it alp-local-postgres-1 psql -U postgres -d auth -c "\dn"   # auth_schema present
docker exec -it alp-local-postgres-1 psql -U postgres -d auth -c "\dt auth_schema.*"   # 5 tables
docker exec -it alp-local-postgres-1 psql -U postgres -d auth -c "\dT auth_schema.*"   # 4 enums
```

Expected: `auth_schema` listed; `users`, `refresh_tokens`, `otp_tokens`, `user_exam_selections`, `invite_links`; enums `user_role_enum`, `admin_level_enum`, `account_status_enum`, `onboarding_status_enum`.

### Write a new migration

```bash
cd services/auth
uv run alembic revision -m "add_password_reset_tokens"
# Edit alembic/versions/<rev>_add_password_reset_tokens.py — implement upgrade() and downgrade()
make migrate svc=auth                 # apply
make migrate-status svc=auth          # confirm new head
```

### Migration conventions (project-wide)

- **Append-only.** Never edit a migration that has run in any non-local environment. Add a new migration that fixes the prior one's effect.
- **Both directions implemented.** `downgrade()` always present and tested locally — even if you never plan to run it. It's a sanity check that you understood the `upgrade()`.
- **One concern per migration.** Adding a column and renaming another belong in two migrations.
- **DDL only — no business data backfills inline.** Backfill scripts go under `services/<svc>/scripts/backfills/` with their own runbook entry.
- **Schema-qualify everything.** `auth_schema.users`, never `users`. Keeps queries portable to the unified-cluster prod layout.
- **Naming**: tables snake_case plural, columns snake_case, PK is `id` UUID, FKs `{table}_id`, booleans `is_*`/`has_*`. Indexes `idx_{table}_{cols}`. Constraints `uq_*`, `chk_*`, `fk_*`. Full convention is in [DB Schema doc §1.1](../../docs/01_design/02_DatabaseSchema_ERD_AdaptiveLearningPlatform.docx).
- **No cross-schema FKs in DDL.** They are enforced at the application layer. The DB cluster topology and the local-dev one-DB-per-service split both make cross-schema FKs unportable.
- **No CASCADE deletes** in application tables. Documented exception: `auth_schema.refresh_tokens(user_id)` cascades from `users` because tokens are valueless without their owner. Any other cascade requires Tech Lead sign-off in PR review.

### Production / staging

Same migration files, different `DATABASE_URL`. Auth's `DATABASE_URL` in staging will point at the Aurora writer endpoint with `auth_db` as the database. Application of migrations is a deploy-time step run by ArgoCD pre-sync hook (Sprint 1+) — never as a developer's manual command.
