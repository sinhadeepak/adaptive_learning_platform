"""Add CBSE Class 9 Hindi + Sanskrit subjects and chapters.

Migration 019 (full Class 8/9 syllabus) added Maths, Science, Social
Science, and English — leaving Hindi and Sanskrit out because the
question banks for those needed Devanagari content. This migration
fills the gap so the CBSE Class IX experience is complete:

  C9_HINDI   — 14 chapters (10 Kshitij + 4 Kritika)
  C9_SANSKRIT — 8 chapters (selected from Shemushi)

UUID conventions continue migration 019's series:
  Subjects   : 22222222-0000-0000-0000-0000000000{21,22}
  New topics : 33333333-0000-0000-0000-0000000000{131..152}

Revision ID: 020
Revises: 019
Create Date: 2026-05-04
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "020"
down_revision: str | None = "019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"
CBSE_EXAM_ID = "11111111-0000-0000-0000-000000000005"


def _tid(n: int) -> str:
    return f"33333333-0000-0000-0000-{n:012d}"


NEW_SUBJECTS = [
    ("22222222-0000-0000-0000-000000000021", "C9_HINDI",    "Class 9 Hindi",    9),
    ("22222222-0000-0000-0000-000000000022", "C9_SANSKRIT", "Class 9 Sanskrit", 10),
]
SUBJ_C9_HINDI    = NEW_SUBJECTS[0][0]
SUBJ_C9_SANSKRIT = NEW_SUBJECTS[1][0]


# ─── Hindi (Kshitij + Kritika) — 14 chapters ──────────────────────
# Deliberately curated to the chapters most-taught in the CBSE Class 9
# Hindi syllabus. Course B (alternative book) chapters share the same
# code prefix and can be added in a follow-up migration.
NEW_TOPICS = [
    # Kshitij — prose (Gadya)
    (_tid(131), SUBJ_C9_HINDI, "C9H_KS_DOPAHAR",  "Dopahar Ka Bhojan",
     "Premchand-style prose; family, social-realist themes.", 1),
    (_tid(132), SUBJ_C9_HINDI, "C9H_KS_KIBLA",    "Mere Bachpan Ke Din",
     "Mahadevi Verma's autobiographical sketch of childhood.", 2),
    (_tid(133), SUBJ_C9_HINDI, "C9H_KS_SAVALE",   "Saavle Sapnon Ki Yaad",
     "Jabir Hussain prose on dreams + reform.", 3),
    (_tid(134), SUBJ_C9_HINDI, "C9H_KS_PREMVAND", "Premchand Ke Phate Joote",
     "Harishankar Parsai satirical essay.", 4),
    (_tid(135), SUBJ_C9_HINDI, "C9H_KS_MERA_GHAR","Mera Chhota Sa Niji Pustakalaya",
     "Gunakar Mule on the joys of a personal library.", 5),
    # Kshitij — poetry (Padya)
    (_tid(136), SUBJ_C9_HINDI, "C9H_KS_RAIDAS",   "Raidas Ke Pad",
     "Bhakti-period devotional poems by Sant Raidas.", 6),
    (_tid(137), SUBJ_C9_HINDI, "C9H_KS_RAHIM",    "Rahim Ke Dohe",
     "Rahim's couplets on virtue, prudence and love.", 7),
    (_tid(138), SUBJ_C9_HINDI, "C9H_KS_NAGARJUN", "Nagarjun — Yeh Damdar Tukde",
     "Nagarjun's progressive verse on resistance and identity.", 8),
    (_tid(139), SUBJ_C9_HINDI, "C9H_KS_SUMITRA",  "Sumitranandan Pant — Gram Shree",
     "Pant's lyric on village beauty, nature, and dawn.", 9),
    (_tid(140), SUBJ_C9_HINDI, "C9H_KS_KEDARNATH","Kedarnath Agarwal — Chandra Gahna Se Lautati Ber",
     "Pastoral poem on rural landscape.", 10),
    # Kritika (supplementary)
    (_tid(141), SUBJ_C9_HINDI, "C9H_KR_IS_JAL",   "Is Jal Pralay Mein",
     "Phanishwar Nath Renu — Bihar 1975 floods sketch.", 11),
    (_tid(142), SUBJ_C9_HINDI, "C9H_KR_MERE_HAM", "Mere Sang Ki Auratein",
     "Mridula Garg essay on the women who shaped her.", 12),
    (_tid(143), SUBJ_C9_HINDI, "C9H_KR_REEDH",    "Reedh Ki Haddi",
     "Jagdish Chandra Mathur's one-act play on dowry.", 13),
    (_tid(144), SUBJ_C9_HINDI, "C9H_KR_KIS_TARAH","Kis Tarah Aakhir Kaar Main Hindi Mein Aaya",
     "Shamsher Bahadur Singh — language, identity.", 14),

    # ─── Sanskrit (Shemushi) — 8 chapters ─────────────────────────
    (_tid(145), SUBJ_C9_SANSKRIT, "C9S_BHARATIVAM", "Bharativam",
     "Sanskrit verses extolling India's cultural heritage.", 1),
    (_tid(146), SUBJ_C9_SANSKRIT, "C9S_SVARNA",    "Svarnakaakah",
     "Story of the golden crow — moral fable.", 2),
    (_tid(147), SUBJ_C9_SANSKRIT, "C9S_GOLI",      "Goli Hi Goli",
     "Modern story in Sanskrit about a doctor's compassion.", 3),
    (_tid(148), SUBJ_C9_SANSKRIT, "C9S_KALOSI",    "Kalo'si Kalo'si Kalo'si",
     "Comic dialogue piece teaching grammar contrasts.", 4),
    (_tid(149), SUBJ_C9_SANSKRIT, "C9S_SUKTI",     "Sukti Manjari",
     "Anthology of Sanskrit subhashitas (wise sayings).", 5),
    (_tid(150), SUBJ_C9_SANSKRIT, "C9S_BHAGEEr",   "Bhaageeratha Pravruttam",
     "Story of Bhagiratha bringing the Ganga to Earth.", 6),
    (_tid(151), SUBJ_C9_SANSKRIT, "C9S_PRARYAA",   "Pryavaranam",
     "Verses on the importance of environment & nature.", 7),
    (_tid(152), SUBJ_C9_SANSKRIT, "C9S_VYANJANA",  "Vyanjana Varnah",
     "Phonetics + grammar primer on consonants.", 8),
]


def upgrade() -> None:
    for sid, code, name, sort_order in NEW_SUBJECTS:
        op.execute(
            f"INSERT INTO {SCHEMA}.subjects (id, exam_id, code, name, sort_order) "
            f"VALUES ('{sid}', '{CBSE_EXAM_ID}', '{code}', "
            f"$${name}$$, {sort_order}) "
            f"ON CONFLICT (exam_id, code) DO NOTHING"
        )
    for tid, sid, code, title, desc, sort_order in NEW_TOPICS:
        op.execute(
            f"INSERT INTO {SCHEMA}.topics "
            f"(id, subject_id, code, title, description, question_count, sort_order) "
            f"VALUES ('{tid}', '{sid}', '{code}', "
            f"$${title}$$, $${desc}$$, 100, {sort_order}) "
            f"ON CONFLICT (subject_id, code) DO NOTHING"
        )


def downgrade() -> None:
    topic_ids = ", ".join(f"'{t[0]}'" for t in NEW_TOPICS)
    subj_ids = ", ".join(f"'{s[0]}'" for s in NEW_SUBJECTS)
    op.execute(f"DELETE FROM {SCHEMA}.topics WHERE id IN ({topic_ids})")
    op.execute(f"DELETE FROM {SCHEMA}.subjects WHERE id IN ({subj_ids})")
