"""Seed marketplace fixtures so the Tutor / Course UIs have content.

Promotes 5 institution-teacher accounts (one per tenant from
identity 006_seed_e2e_institutions) to ACTIVE tutors, gives each
qualifications + weekly availability + topic coverage, then makes 3 of
them creators with 5 published courses spanning the seeded exams.

Gated behind MARKETPLACE_SEED_LOCAL to keep these synthetic rows out
of staging/production. Idempotent via deterministic uuid5 + ON
CONFLICT DO NOTHING.

Revision ID: 007
Revises: 006
Create Date: 2026-05-03
"""

from __future__ import annotations

import json
import os
import uuid
from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

revision: str = "007"
down_revision: str | None = "006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "marketplace_schema"
NS = uuid.UUID("c0000000-0000-4000-a000-000000000007")

# Five teachers (teacher0.<slug>) — UUIDs match identity 006 seed
# (uuid5 of "teacher|<slug>|0" under namespace c0000000-...-006). Hard-
# coded so this migration doesn't depend on the identity DB at runtime.
TUTORS = [
    {
        "user_id": "4e781c8d-4362-59ec-8cb3-f361eca4e8a6",
        "slug": "aurora-coaching",
        "display_name": "Anika Iyer",
        "headline": "JEE Main rank 247 · 8 years coaching",
        "bio": "IIT-Bombay alum. Specialises in mechanics + calculus.",
        "rate_paise": 120000,  # ₹1,200/hr
        "exam": "JEE_MAIN",
        "topics": ["33333333-0000-0000-0000-000000000006",  # Calculus
                   "33333333-0000-0000-0000-000000000007"],  # Coord Geometry
        "qual": ("DEGREE", "B.Tech Mechanical", "IIT Bombay", 2017),
    },
    {
        "user_id": "c3960d7e-44d7-5920-abdf-e12729d8e66a",
        "slug": "vedanta-tutorials",
        "display_name": "Dr. Rakesh Menon",
        "headline": "AIIMS-trained · NEET Biology + Chemistry",
        "bio": "MBBS, PhD in Cell Biology. 12 years NEET prep mentoring.",
        "rate_paise": 180000,
        "exam": "NEET",
        "topics": ["33333333-0000-0000-0000-000000000008",  # Cell Biology
                   "33333333-0000-0000-0000-000000000027"],  # Cell Structure
        "qual": ("DEGREE", "MBBS, PhD", "AIIMS New Delhi", 2014),
    },
    {
        "user_id": "e74d9cb0-522a-5d3a-8ae4-ac643f50ba38",
        "slug": "dps-rk-puram",
        "display_name": "Priya Bhattacharya",
        "headline": "CBSE Class 9 · Math + Science · 15 yrs at DPS",
        "bio": "Senior teacher at DPS RK Puram. Loves Olympiad-style problems.",
        "rate_paise": 60000,
        "exam": "CBSE",
        "topics": ["33333333-0000-0000-0000-000000000021",  # Algebra
                   "33333333-0000-0000-0000-000000000020"],  # Arithmetic
        "qual": ("TEACHING_EXPERIENCE", "Sr. Math Teacher · 15 yrs", "DPS RK Puram", None),
    },
    {
        "user_id": "b0528241-b889-5bd0-adb5-ea4a62d814bb",
        "slug": "kv-new-delhi",
        "display_name": "Mohan Kulkarni",
        "headline": "CBSE Class 8 · Foundation builder",
        "bio": "PGT Math + Science at KV New Delhi. Concept-first pedagogy.",
        "rate_paise": 50000,
        "exam": "CBSE",
        "topics": ["33333333-0000-0000-0000-000000000020"],  # Arithmetic
        "qual": ("DEGREE", "M.Sc Mathematics", "Delhi University", 2009),
    },
    {
        "user_id": "862dde37-b6fb-541e-82a3-25999ec648ca",
        "slug": "allen-test",
        "display_name": "Ishaan Verma",
        "headline": "JEE Main 2025 · AIR 89 · Demo tutor",
        "bio": "Recent IIT-Delhi joinee, mentoring this year's batch.",
        "rate_paise": 80000,
        "exam": "JEE_MAIN",
        "topics": ["33333333-0000-0000-0000-000000000006",  # Calculus
                   "33333333-0000-0000-0000-000000000021"],  # Algebra
        "qual": ("EXAM_RANK", "JEE Main 2025 · AIR 89", "Allen Career Institute", 2025),
    },
]

# Three of the tutors also become creators (publish courses).
CREATORS_AND_COURSES = [
    {
        "user_id": "4e781c8d-4362-59ec-8cb3-f361eca4e8a6",  # Anika
        "courses": [
            {
                "title": "JEE Mechanics — 30-Day Sprint",
                "description": "Daily problem sets covering kinematics → rotational dynamics. Ideal for the final month.",
                "price_paise": 49900,
                "exam_id": "11111111-0000-0000-0000-000000000001",
                "topic_ids": ["33333333-0000-0000-0000-000000000006"],
            },
            {
                "title": "Coordinate Geometry — From Zero to Mains",
                "description": "Conceptual derivations + 200 solved JEE-style problems.",
                "price_paise": 39900,
                "exam_id": "11111111-0000-0000-0000-000000000001",
                "topic_ids": ["33333333-0000-0000-0000-000000000007"],
            },
        ],
    },
    {
        "user_id": "c3960d7e-44d7-5920-abdf-e12729d8e66a",  # Dr. Menon
        "courses": [
            {
                "title": "NEET Biology — Cell to System",
                "description": "Visual deep-dive into cell biology and human physiology with NCERT alignment.",
                "price_paise": 79900,
                "exam_id": "11111111-0000-0000-0000-000000000002",
                "topic_ids": [
                    "33333333-0000-0000-0000-000000000008",
                    "33333333-0000-0000-0000-000000000027",
                ],
            },
        ],
    },
    {
        "user_id": "e74d9cb0-522a-5d3a-8ae4-ac643f50ba38",  # Priya
        "courses": [
            {
                "title": "CBSE Class 9 Math — Master Algebra",
                "description": "All NCERT chapters worked through with extension problems.",
                "price_paise": 19900,
                "exam_id": "11111111-0000-0000-0000-000000000005",
                "topic_ids": ["33333333-0000-0000-0000-000000000021"],
            },
            {
                "title": "Arithmetic Olympiad Track",
                "description": "Train for school-level Olympiads. Weekly graded problem sets.",
                "price_paise": 24900,
                "exam_id": "11111111-0000-0000-0000-000000000005",
                "topic_ids": ["33333333-0000-0000-0000-000000000020"],
            },
        ],
    },
]


def _det(label: str) -> str:
    return str(uuid.uuid5(NS, label))


def upgrade() -> None:
    if not os.environ.get("MARKETPLACE_SEED_LOCAL"):
        return

    for t in TUTORS:
        op.execute(
            text(
                f"""
                INSERT INTO {SCHEMA}.tutor_profiles (
                  user_id, display_name, headline, bio, hourly_rate_paise,
                  tier, application_status, kyc_status, applied_at, approved_at
                )
                VALUES (
                  CAST(:uid AS uuid), :name, :headline, :bio, :rate,
                  'STANDARD', 'ACTIVE', 'verified', NOW() - INTERVAL '30 days', NOW() - INTERVAL '7 days'
                )
                ON CONFLICT (user_id) DO UPDATE SET
                  application_status = 'ACTIVE',
                  kyc_status = 'verified',
                  approved_at = COALESCE({SCHEMA}.tutor_profiles.approved_at, NOW() - INTERVAL '7 days')
                """
            ).bindparams(
                uid=t["user_id"], name=t["display_name"],
                headline=t["headline"], bio=t["bio"], rate=t["rate_paise"],
            )
        )

        # Qualification (one per tutor — enough to render the profile card)
        kind, title, inst, year = t["qual"]
        op.execute(
            text(
                f"""
                INSERT INTO {SCHEMA}.tutor_qualifications (
                  id, tutor_user_id, kind, title, institution, year_completed
                )
                VALUES (CAST(:qid AS uuid), CAST(:uid AS uuid), :kind, :title, :inst, :year)
                ON CONFLICT (id) DO NOTHING
                """
            ).bindparams(
                qid=_det(f"qual|{t['user_id']}"),
                uid=t["user_id"], kind=kind, title=title, inst=inst, year=year,
            )
        )

        # Availability — Mon/Wed/Fri 18:00–21:00 (1080–1260 minutes)
        for dow in (1, 3, 5):
            op.execute(
                text(
                    f"""
                    INSERT INTO {SCHEMA}.tutor_availability (
                      id, tutor_user_id, day_of_week, start_minute, end_minute
                    )
                    VALUES (CAST(:aid AS uuid), CAST(:uid AS uuid), :dow, 1080, 1260)
                    ON CONFLICT (id) DO NOTHING
                    """
                ).bindparams(
                    aid=_det(f"avail|{t['user_id']}|{dow}"),
                    uid=t["user_id"], dow=dow,
                )
            )

        # Topic coverage
        for topic_id in t["topics"]:
            op.execute(
                text(
                    f"""
                    INSERT INTO {SCHEMA}.tutor_topics (tutor_user_id, topic_id)
                    VALUES (CAST(:uid AS uuid), CAST(:tid AS uuid))
                    ON CONFLICT DO NOTHING
                    """
                ).bindparams(uid=t["user_id"], tid=topic_id)
            )

    # Creator profiles + courses
    for c in CREATORS_AND_COURSES:
        op.execute(
            text(
                f"""
                INSERT INTO {SCHEMA}.creator_profiles (
                  user_id, display_name, headline, bio,
                  tier, application_status, kyc_status, applied_at, approved_at
                )
                SELECT user_id, display_name, headline, bio,
                       'STANDARD', 'ACTIVE', 'verified',
                       NOW() - INTERVAL '30 days', NOW() - INTERVAL '7 days'
                  FROM {SCHEMA}.tutor_profiles
                 WHERE user_id = CAST(:uid AS uuid)
                ON CONFLICT (user_id) DO UPDATE SET
                  application_status = 'ACTIVE',
                  kyc_status = 'verified',
                  approved_at = COALESCE({SCHEMA}.creator_profiles.approved_at, NOW() - INTERVAL '7 days')
                """
            ).bindparams(uid=c["user_id"])
        )
        for idx, course in enumerate(c["courses"]):
            op.execute(
                text(
                    f"""
                    INSERT INTO {SCHEMA}.courses (
                      id, creator_user_id, title, description, content_md,
                      price_paise, tier, status, exam_id, topic_ids,
                      published_at
                    )
                    VALUES (
                      CAST(:cid AS uuid), CAST(:uid AS uuid), :title, :desc, :body,
                      :price, 'STANDARD', 'PUBLISHED', CAST(:eid AS uuid), CAST(:tids AS jsonb),
                      NOW() - INTERVAL '5 days'
                    )
                    ON CONFLICT (id) DO NOTHING
                    """
                ).bindparams(
                    cid=_det(f"course|{c['user_id']}|{idx}"),
                    uid=c["user_id"],
                    title=course["title"],
                    desc=course["description"],
                    body=f"# {course['title']}\n\nFull course content lives in modules/lessons.",
                    price=course["price_paise"],
                    eid=course["exam_id"],
                    tids=json.dumps(course["topic_ids"]),
                )
            )


def downgrade() -> None:
    if not os.environ.get("MARKETPLACE_SEED_LOCAL"):
        return
    tutor_ids = [t["user_id"] for t in TUTORS]
    creator_ids = [c["user_id"] for c in CREATORS_AND_COURSES]
    op.execute(
        text(
            f"DELETE FROM {SCHEMA}.courses WHERE creator_user_id = ANY(CAST(:ids AS uuid[]))"
        ).bindparams(ids=creator_ids)
    )
    op.execute(
        text(
            f"DELETE FROM {SCHEMA}.creator_profiles WHERE user_id = ANY(CAST(:ids AS uuid[]))"
        ).bindparams(ids=creator_ids)
    )
    op.execute(
        text(
            f"DELETE FROM {SCHEMA}.tutor_topics WHERE tutor_user_id = ANY(CAST(:ids AS uuid[]))"
        ).bindparams(ids=tutor_ids)
    )
    op.execute(
        text(
            f"DELETE FROM {SCHEMA}.tutor_availability WHERE tutor_user_id = ANY(CAST(:ids AS uuid[]))"
        ).bindparams(ids=tutor_ids)
    )
    op.execute(
        text(
            f"DELETE FROM {SCHEMA}.tutor_qualifications WHERE tutor_user_id = ANY(CAST(:ids AS uuid[]))"
        ).bindparams(ids=tutor_ids)
    )
    op.execute(
        text(
            f"DELETE FROM {SCHEMA}.tutor_profiles WHERE user_id = ANY(CAST(:ids AS uuid[]))"
        ).bindparams(ids=tutor_ids)
    )
