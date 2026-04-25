"""Create institution_schema flag tables (FS-01).

3 tables: feature_flags, feature_flag_overrides, feature_flag_audit.
1 enum:   flag_scope_enum (GLOBAL, TENANT).

Source: docs/adr/0001-feature-flag-platform.md + docs/02_planning/12_SprintOne_Backlog_AdaptiveLearningPlatform.md §FS-01.

Revision ID: 001
Revises:
Create Date: 2026-04-23
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "institution_schema"


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")

    op.execute(f"CREATE TYPE {SCHEMA}.flag_scope_enum AS ENUM ('GLOBAL','TENANT')")

    # feature_flags — declarative flag registry. Name is the primary key (kebab/snake mix
    # allowed; convention is snake_case, e.g. `irt_model_enabled`).
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.feature_flags (
          name              TEXT         PRIMARY KEY,
          description       TEXT         NOT NULL,
          default_value     BOOLEAN      NOT NULL,
          danger_critical   BOOLEAN      NOT NULL DEFAULT FALSE,
          owner             TEXT,
          blast_radius      TEXT,
          created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
          updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
        """
    )

    # feature_flag_overrides — per-tenant override. Composite PK prevents duplicate per-tenant rows.
    # Override is deleted (rather than "value=default") when a tenant reverts to default; keeps state lean.
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.feature_flag_overrides (
          flag_name         TEXT         NOT NULL REFERENCES {SCHEMA}.feature_flags(name) ON DELETE CASCADE,
          tenant_id         UUID         NOT NULL,
          value             BOOLEAN      NOT NULL,
          set_by_user_id    UUID,
          rationale         TEXT,
          set_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
          PRIMARY KEY (flag_name, tenant_id)
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_flag_overrides_tenant ON {SCHEMA}.feature_flag_overrides (tenant_id)"
    )

    # feature_flag_audit — append-only audit trail. Critical for compliance (read/write flag UI
    # in web-admin surfaces this as a log). ON DELETE: audit rows survive flag deletion.
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.feature_flag_audit (
          id                UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
          flag_name         TEXT                       NOT NULL,
          scope             {SCHEMA}.flag_scope_enum   NOT NULL,
          tenant_id         UUID,
          old_value         BOOLEAN,
          new_value         BOOLEAN,
          actor_user_id     UUID,
          rationale         TEXT,
          ts                TIMESTAMPTZ                NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(f"CREATE INDEX idx_flag_audit_flag ON {SCHEMA}.feature_flag_audit (flag_name, ts DESC)")
    op.execute(
        f"CREATE INDEX idx_flag_audit_tenant ON {SCHEMA}.feature_flag_audit (tenant_id, ts DESC) "
        "WHERE tenant_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.feature_flag_audit")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.feature_flag_overrides")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.feature_flags")
    op.execute(f"DROP TYPE IF EXISTS {SCHEMA}.flag_scope_enum")
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA}")
