"""Seed a minimal catalog (4 exams, ~10 subjects, ~30 topics) so web-student
Onboarding Exam Selection + Catalog Browse + Topic Detail screens render out
of the box.

This is the `minimal` profile from docs/02_planning/11_SeedScript_Specification.md.
The full `beta` / `load` seed profiles land in scripts/seed_staging.py (Sprint 1 Day 3+).

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

SCHEMA = "catalog_schema"


def upgrade() -> None:
    # Exams — fixed UUIDs for deterministic seeding (also referenced by onboarding tests).
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.exams (id, code, name, subtitle, icon_key, sort_order) VALUES
          ('11111111-0000-0000-0000-000000000001','JEE_MAIN','JEE Main','Engineering entrance','exam-jee',1),
          ('11111111-0000-0000-0000-000000000002','NEET','NEET','Medical entrance','exam-neet',2),
          ('11111111-0000-0000-0000-000000000003','UPSC_CSE','UPSC CSE','Civil services','exam-upsc',3),
          ('11111111-0000-0000-0000-000000000004','CAT','CAT','MBA entrance','exam-cat',4)
        ON CONFLICT (code) DO NOTHING
        """
    )

    # JEE Main subjects + topics
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.subjects (id, exam_id, code, name, sort_order) VALUES
          ('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','PHY','Physics',1),
          ('22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001','CHEM','Chemistry',2),
          ('22222222-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000001','MATH','Mathematics',3)
        ON CONFLICT (exam_id, code) DO NOTHING
        """
    )
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.topics (id, subject_id, code, title, description, question_count, sort_order) VALUES
          ('33333333-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001','MECH','Mechanics','Motion, forces, and energy.',48,1),
          ('33333333-0000-0000-0000-000000000002','22222222-0000-0000-0000-000000000001','THERMO','Thermodynamics','Heat, work, and the laws of thermodynamics.',32,2),
          ('33333333-0000-0000-0000-000000000003','22222222-0000-0000-0000-000000000001','ELEC','Electrostatics','Charges, fields, and potentials.',40,3),
          ('33333333-0000-0000-0000-000000000004','22222222-0000-0000-0000-000000000002','PCHEM','Physical Chemistry','Reaction kinetics, equilibrium, and thermochemistry.',36,1),
          ('33333333-0000-0000-0000-000000000005','22222222-0000-0000-0000-000000000002','OCHEM','Organic Chemistry','Hydrocarbons, functional groups, and mechanisms.',44,2),
          ('33333333-0000-0000-0000-000000000006','22222222-0000-0000-0000-000000000003','CALC','Calculus','Limits, derivatives, and integrals.',52,1),
          ('33333333-0000-0000-0000-000000000007','22222222-0000-0000-0000-000000000003','COORD','Coordinate Geometry','Lines, circles, and conic sections.',36,2)
        ON CONFLICT (subject_id, code) DO NOTHING
        """
    )

    # NEET subjects + topics (sparser — demonstrates polymorphism of the schema)
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.subjects (id, exam_id, code, name, sort_order) VALUES
          ('22222222-0000-0000-0000-000000000004','11111111-0000-0000-0000-000000000002','BIO','Biology',1),
          ('22222222-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000002','PHY','Physics',2),
          ('22222222-0000-0000-0000-000000000006','11111111-0000-0000-0000-000000000002','CHEM','Chemistry',3)
        ON CONFLICT (exam_id, code) DO NOTHING
        """
    )
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.topics (id, subject_id, code, title, description, question_count, sort_order) VALUES
          ('33333333-0000-0000-0000-000000000008','22222222-0000-0000-0000-000000000004','CELL','Cell Biology','Structure and function of cells.',40,1),
          ('33333333-0000-0000-0000-000000000009','22222222-0000-0000-0000-000000000004','GEN','Genetics','Heredity and variation.',30,2)
        ON CONFLICT (subject_id, code) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(f"DELETE FROM {SCHEMA}.topics WHERE id IN ("
               "'33333333-0000-0000-0000-000000000001',"
               "'33333333-0000-0000-0000-000000000002',"
               "'33333333-0000-0000-0000-000000000003',"
               "'33333333-0000-0000-0000-000000000004',"
               "'33333333-0000-0000-0000-000000000005',"
               "'33333333-0000-0000-0000-000000000006',"
               "'33333333-0000-0000-0000-000000000007',"
               "'33333333-0000-0000-0000-000000000008',"
               "'33333333-0000-0000-0000-000000000009')")
    op.execute(f"DELETE FROM {SCHEMA}.subjects WHERE id::text LIKE '22222222-0000-0000-0000-%'")
    op.execute(f"DELETE FROM {SCHEMA}.exams WHERE id::text LIKE '11111111-0000-0000-0000-%'")
