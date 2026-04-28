"""Seed the 7 Phase-1 feature flags from GAP-16 (Sprint 1 backlog §GAP-16).

Idempotent — ON CONFLICT DO NOTHING. Re-running only inserts missing rows.

Revision ID: 002
Revises: 001
Create Date: 2026-04-23
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "institution_schema"


def upgrade() -> None:
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.feature_flags (name, description, default_value, danger_critical, owner, blast_radius) VALUES
          ('irt_model_enabled',
            'Controls whether the 3PL IRT model drives adaptive question selection. When OFF, binary-search cold-start is used.',
            FALSE, TRUE, 'ML Engineer', 'student quiz experience'),
          ('push_channel_enabled',
            'FCM + APNs push notifications kill switch. OFF silences push across all tenants.',
            TRUE, TRUE, 'Notification BE Lead', 'all push notifications'),
          ('sms_channel_enabled',
            'Twilio SMS kill switch. OFF stops SMS OTP + SMS alerts.',
            TRUE, TRUE, 'Notification BE Lead', 'SMS OTP + alerts'),
          ('email_channel_enabled',
            'SendGrid email kill switch. OFF stops all transactional + marketing email.',
            TRUE, TRUE, 'Notification BE Lead', 'all email delivery'),
          ('premium_tier_enforcement',
            'When ON, premium topics are gated. When OFF (Sprint 1 closed beta), all content is free.',
            FALSE, FALSE, 'PM', 'paywall enforcement'),
          ('checkout_enabled',
            'Master switch for the Stripe/IAP checkout surface. Sprint 3 wiring; OFF until launch.',
            FALSE, TRUE, 'Payment BE Lead', 'purchase path (revenue)'),
          ('assignments_enabled',
            'Teacher-assigned work (EPIC-08). OFF until Sprint 3 Institution epic ships.',
            FALSE, FALSE, 'Institution BE Lead', 'teacher assignments UI')
        ON CONFLICT (name) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        f"DELETE FROM {SCHEMA}.feature_flags WHERE name IN ("
        "'irt_model_enabled','push_channel_enabled','sms_channel_enabled',"
        "'email_channel_enabled','premium_tier_enforcement','checkout_enabled','assignments_enabled')"
    )
