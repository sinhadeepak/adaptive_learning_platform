"""Strip the `[EXAM TOPIC #N]` debug prefix from polymorphic seed
question stems.

The polymorphic seed engine (services/learning/.../polymorphic_engine.py)
historically prefixed every generated stem with author-facing debug
metadata like `[CBSE C8_FORCE Diagram #109]`. Useful for content
authors; confusing for students who ended up reading the prefix as
part of the question.

Mobile patched the leak at render time in Sprint 1 (regex strip in
quiz_screen.dart). This migration cleans the underlying data so the
prefix never leaves the database in the first place — every other
client (web, future kiosk apps, exports) benefits without needing
its own renderer-side scrubber. The seed engine source has also been
cleaned (Sprint 4) so newly-seeded rows ship clean from now on.

Local-only — gated by CONTENT_SEED_LOCAL=1, mirroring the polymorphic
seed migrations themselves. In staging / production the seed never
ran (real authors author through the review pipeline) so there's
nothing to strip.

The regex matches the family of debug prefixes the engine produced:

    [CBSE C8_FORCE #12]                  ← objective
    [UPSC GS-PAPER1 Diagram #5]          ← visual
    [UPSC Mains GS-PAPER1 Essay #2]      ← subjective
    [UPSC GS-IV Ethics ETHICS Case #3]   ← case study

Captures from `[` up to and including the first `]` plus a single
trailing whitespace.

Revision ID: 033
Revises: 032
Create Date: 2026-05-04
"""

from __future__ import annotations

import os
from collections.abc import Sequence

from alembic import op

revision: str = "033"
down_revision: str | None = "032"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"

# PostgreSQL POSIX-regex equivalent of the Python regex used in the
# Python seed cleanup. ^\[ ... \]\s?
#
# Inside the brackets we accept any non-`]` characters. The actual
# debug-prefix shape always ends with `#<digits>]` so we anchor on
# that to avoid stripping a legitimate `[Source: NCERT 2023]` prefix
# that an author may have set deliberately.
DEBUG_PREFIX_RE = r'^\[[^]]*#\s*[0-9]+\][[:space:]]?'


def upgrade() -> None:
    if not os.environ.get("CONTENT_SEED_LOCAL"):
        return

    op.execute(
        f"""
        UPDATE {SCHEMA}.questions
           SET stem = regexp_replace(stem, '{DEBUG_PREFIX_RE}', '')
         WHERE stem ~ '{DEBUG_PREFIX_RE}'
        """
    )


def downgrade() -> None:
    # No restore — the prefix was never user-meaningful.
    pass
