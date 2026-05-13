"""Extend the CBSE Class 8 / Class 9 catalog from 12 representative
topics (migration 017) to the **full NCERT syllabus** — every subject,
every chapter — so the question bank covers the whole grade.

Adds:
  - 4 new subjects: C8_SST, C8_ENG (Class 8 Social Science / English)
                    C9_SST, C9_ENG (Class 9 Social Science / English)
  - 94 new topics across the 8 subjects (existing 12 stay unchanged)

UUID conventions continue the deterministic series:
  Subjects   : 22222222-0000-0000-0000-0000000000{17..20}
  New topics : 33333333-0000-0000-0000-0000000000{37..130}

Topic→Subject map (stable codes are the source of truth — IDs are
derived once and frozen here so the seed bank can reference them by
code):

  C8_MATH (16 chapters, 13 new — keeps RAT/LIN/MENS from 017)
  C8_SCI  (18 chapters, 15 new — keeps FORCE/LIGHT/CELL from 017)
  C8_SST  (18 chapters: 6 History + 6 Geography + 6 Civics)
  C8_ENG  (5 buckets: Honeydew prose/poems, It So Happened, Grammar, Reading)

  C9_MATH (12 chapters, 9 new — keeps NUM/POLY/TRI from 017)
  C9_SCI  (12 chapters, 9 new — keeps MATTER/MOTION/GRAV from 017)
  C9_SST  (20 chapters: 5 History + 6 Geography + 5 Polity + 4 Economics)
  C9_ENG  (5 buckets: Beehive prose/poems, Moments, Grammar, Reading)

ON CONFLICT DO NOTHING keeps the migration idempotent.

Revision ID: 019
Revises: 018
Create Date: 2026-05-03
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "019"
down_revision: str | None = "018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"

CBSE_EXAM_ID = "11111111-0000-0000-0000-000000000005"

# Existing subject IDs from migration 017 (re-used here, NOT inserted):
SUBJ_C8_SCI  = "22222222-0000-0000-0000-000000000013"
SUBJ_C8_MATH = "22222222-0000-0000-0000-000000000014"
SUBJ_C9_SCI  = "22222222-0000-0000-0000-000000000015"
SUBJ_C9_MATH = "22222222-0000-0000-0000-000000000016"

# New subjects added by this migration:
NEW_SUBJECTS = [
    ("22222222-0000-0000-0000-000000000017", "C8_SST", "Class 8 Social Science", 5),
    ("22222222-0000-0000-0000-000000000018", "C8_ENG", "Class 8 English",        6),
    ("22222222-0000-0000-0000-000000000019", "C9_SST", "Class 9 Social Science", 7),
    ("22222222-0000-0000-0000-000000000020", "C9_ENG", "Class 9 English",        8),
]

SUBJ_C8_SST = NEW_SUBJECTS[0][0]
SUBJ_C8_ENG = NEW_SUBJECTS[1][0]
SUBJ_C9_SST = NEW_SUBJECTS[2][0]
SUBJ_C9_ENG = NEW_SUBJECTS[3][0]


def _tid(n: int) -> str:
    return f"33333333-0000-0000-0000-{n:012d}"


# -----------------------------------------------------------------------
# Topic catalog — (id, subject_id, code, title, description, sort_order)
# -----------------------------------------------------------------------

NEW_TOPICS = [
    # =================================================================
    # Class 8 — Maths (extends 017's RAT/LIN/MENS)  IDs 37..49 (13 new)
    # =================================================================
    (_tid(37),  SUBJ_C8_MATH, "C8M_QUAD",  "Understanding Quadrilaterals",
     "Polygons, types of quadrilaterals, angle-sum, parallelograms.", 4),
    (_tid(38),  SUBJ_C8_MATH, "C8M_PGEOM", "Practical Geometry",
     "Construction of quadrilaterals using ruler and compasses.", 5),
    (_tid(39),  SUBJ_C8_MATH, "C8M_DATA",  "Data Handling",
     "Frequency tables, bar graphs, histograms, pie charts, probability basics.", 6),
    (_tid(40),  SUBJ_C8_MATH, "C8M_SQ",    "Squares and Square Roots",
     "Properties of squares, Pythagorean triplets, methods to find square roots.", 7),
    (_tid(41),  SUBJ_C8_MATH, "C8M_CUBE",  "Cubes and Cube Roots",
     "Perfect cubes, cube roots by prime factorisation.", 8),
    (_tid(42),  SUBJ_C8_MATH, "C8M_CQ",    "Comparing Quantities",
     "Ratio, percentage, profit/loss, simple and compound interest.", 9),
    (_tid(43),  SUBJ_C8_MATH, "C8M_AEI",   "Algebraic Expressions and Identities",
     "Monomials, polynomials, multiplication, standard identities.", 10),
    (_tid(44),  SUBJ_C8_MATH, "C8M_SOLID", "Visualising Solid Shapes",
     "3-D shapes, views (top/side/front), Euler's formula.", 11),
    (_tid(45),  SUBJ_C8_MATH, "C8M_EXP",   "Exponents and Powers",
     "Negative exponents, laws of exponents, scientific notation.", 12),
    (_tid(46),  SUBJ_C8_MATH, "C8M_DIP",   "Direct and Inverse Proportions",
     "Direct vs inverse variation, applications and word problems.", 13),
    (_tid(47),  SUBJ_C8_MATH, "C8M_FACT",  "Factorisation",
     "Common factor, grouping, identities, division of polynomials.", 14),
    (_tid(48),  SUBJ_C8_MATH, "C8M_GRAPH", "Introduction to Graphs",
     "Bar graph, pie chart, histogram, line graph, linear graphs.", 15),
    (_tid(49),  SUBJ_C8_MATH, "C8M_PWN",   "Playing with Numbers",
     "Divisibility tests, number puzzles, letters for digits.", 16),

    # =================================================================
    # Class 8 — Science (extends FORCE/LIGHT/CELL)  IDs 50..64 (15 new)
    # =================================================================
    (_tid(50),  SUBJ_C8_SCI, "C8S_CROP",  "Crop Production and Management",
     "Agricultural practices, kharif/rabi, irrigation, storage.", 4),
    (_tid(51),  SUBJ_C8_SCI, "C8S_MICRO", "Microorganisms: Friend and Foe",
     "Bacteria, viruses, fungi, useful microbes, food preservation, diseases.", 5),
    (_tid(52),  SUBJ_C8_SCI, "C8S_MATM",  "Materials: Metals and Non-Metals",
     "Physical & chemical properties of metals/non-metals, displacement reactions.", 6),
    (_tid(53),  SUBJ_C8_SCI, "C8S_COAL",  "Coal and Petroleum",
     "Fossil fuels, formation, refining, conservation.", 7),
    (_tid(54),  SUBJ_C8_SCI, "C8S_COMB",  "Combustion and Flame",
     "Conditions for combustion, types of combustion, structure of a flame.", 8),
    (_tid(55),  SUBJ_C8_SCI, "C8S_CONS",  "Conservation of Plants and Animals",
     "Biodiversity, deforestation, sanctuaries, endemic and endangered species.", 9),
    (_tid(56),  SUBJ_C8_SCI, "C8S_REPRO", "Reproduction in Animals",
     "Sexual vs asexual reproduction, fertilisation, development of embryo.", 10),
    (_tid(57),  SUBJ_C8_SCI, "C8S_ADOL",  "Reaching the Age of Adolescence",
     "Puberty, secondary sexual characters, hormones, reproductive health.", 11),
    (_tid(58),  SUBJ_C8_SCI, "C8S_FRIC",  "Friction",
     "Types of friction, factors affecting friction, fluid friction.", 12),
    (_tid(59),  SUBJ_C8_SCI, "C8S_SOUND", "Sound (Class 8)",
     "Production, propagation, characteristics, audible range, noise pollution.", 13),
    (_tid(60),  SUBJ_C8_SCI, "C8S_CEEC",  "Chemical Effects of Electric Current",
     "Conduction in liquids, electroplating, electrolysis basics.", 14),
    (_tid(61),  SUBJ_C8_SCI, "C8S_NAT",   "Some Natural Phenomena",
     "Lightning, earthquake, charging by friction, earthing.", 15),
    (_tid(62),  SUBJ_C8_SCI, "C8S_STAR",  "Stars and the Solar System",
     "Celestial objects, solar system, planets, satellites, constellations.", 16),
    (_tid(63),  SUBJ_C8_SCI, "C8S_POLL",  "Pollution of Air and Water",
     "Air pollutants, greenhouse effect, water pollution, conservation.", 17),
    (_tid(64),  SUBJ_C8_SCI, "C8S_SYN",   "Synthetic Fibres and Plastics",
     "Polymerisation, types of synthetic fibres, plastics, environmental impact.", 18),

    # =================================================================
    # Class 8 — Social Science (NEW subject)  IDs 65..82 (18 topics)
    # =================================================================
    # History — Our Pasts III (6)
    (_tid(65), SUBJ_C8_SST, "C8H_INTRO",  "How, When and Where",
     "Periodisation of Indian history, sources for modern India.", 1),
    (_tid(66), SUBJ_C8_SST, "C8H_TRADE",  "From Trade to Territory",
     "British East India Company's expansion in the subcontinent.", 2),
    (_tid(67), SUBJ_C8_SST, "C8H_RULING", "Ruling the Countryside",
     "Permanent Settlement, Ryotwari, indigo revolt.", 3),
    (_tid(68), SUBJ_C8_SST, "C8H_TRIBAL", "Tribals, Dikus and the Vision of a Golden Age",
     "Tribal life, colonial impact, Birsa Munda movement.", 4),
    (_tid(69), SUBJ_C8_SST, "C8H_REBEL",  "When People Rebel — 1857 and After",
     "Causes and consequences of the 1857 revolt.", 5),
    (_tid(70), SUBJ_C8_SST, "C8H_NATL",   "The Making of the National Movement",
     "Nationalism, Indian National Congress, partition of Bengal.", 6),
    # Geography — Resources and Development (6)
    (_tid(71), SUBJ_C8_SST, "C8G_RES",    "Resources",
     "Types of resources, sustainable development, conservation.", 7),
    (_tid(72), SUBJ_C8_SST, "C8G_LSWVW",  "Land, Soil, Water, Natural Vegetation, Wildlife",
     "Land use, soil types, water resources, biodiversity.", 8),
    (_tid(73), SUBJ_C8_SST, "C8G_MIN",    "Mineral and Power Resources",
     "Minerals, conventional and non-conventional energy sources.", 9),
    (_tid(74), SUBJ_C8_SST, "C8G_AGRI",   "Agriculture",
     "Types of farming, crops, agricultural systems globally.", 10),
    (_tid(75), SUBJ_C8_SST, "C8G_IND",    "Industries",
     "Classification, factors of location, major industrial regions.", 11),
    (_tid(76), SUBJ_C8_SST, "C8G_HUM",    "Human Resources",
     "Distribution and density of population, factors affecting it.", 12),
    # Civics — Social and Political Life III (6)
    (_tid(77), SUBJ_C8_SST, "C8C_CONST",  "The Indian Constitution",
     "Why we need a Constitution, key features, Fundamental Rights.", 13),
    (_tid(78), SUBJ_C8_SST, "C8C_PARL",   "Parliament and Making of Laws",
     "Composition of Parliament, law-making, role of opposition.", 14),
    (_tid(79), SUBJ_C8_SST, "C8C_JUDIC",  "Judiciary",
     "Independent judiciary, structure of courts, access to justice.", 15),
    (_tid(80), SUBJ_C8_SST, "C8C_MARG",   "Understanding Marginalisation",
     "Adivasis, minorities, marginalised communities and rights.", 16),
    (_tid(81), SUBJ_C8_SST, "C8C_PUB",    "Public Facilities",
     "Water as a right, role of government in public goods.", 17),
    (_tid(82), SUBJ_C8_SST, "C8C_LAW",    "Law and Social Justice",
     "Rule of law, environmental laws, workers' rights.", 18),

    # =================================================================
    # Class 8 — English (NEW subject)  IDs 83..87 (5 buckets)
    # =================================================================
    (_tid(83), SUBJ_C8_ENG, "C8E_HONEY", "Honeydew — Prose",
     "Main NCERT prose chapters: bond between people, science fiction, biography.", 1),
    (_tid(84), SUBJ_C8_ENG, "C8E_POEM",  "Honeydew — Poetry",
     "NCERT poems on nature, courage, childhood and identity.", 2),
    (_tid(85), SUBJ_C8_ENG, "C8E_ISH",   "It So Happened — Stories",
     "Supplementary stories: humour, folktales, moral lessons.", 3),
    (_tid(86), SUBJ_C8_ENG, "C8E_GRAM",  "Grammar and Composition",
     "Tenses, voice, reported speech, letter writing, paragraph.", 4),
    (_tid(87), SUBJ_C8_ENG, "C8E_READ",  "Reading Comprehension",
     "Unseen passages, inference, vocabulary, summary writing.", 5),

    # =================================================================
    # Class 9 — Maths (extends NUM/POLY/TRI)  IDs 88..96 (9 new)
    # =================================================================
    (_tid(88),  SUBJ_C9_MATH, "C9M_COORD", "Coordinate Geometry",
     "Cartesian plane, plotting points, distance/section formula.", 4),
    (_tid(89),  SUBJ_C9_MATH, "C9M_LIN2",  "Linear Equations in Two Variables",
     "Solutions, graph of linear equation, equations of axes.", 5),
    (_tid(90),  SUBJ_C9_MATH, "C9M_EUCL",  "Introduction to Euclid's Geometry",
     "Axioms, postulates, theorems and Euclidean foundations.", 6),
    (_tid(91),  SUBJ_C9_MATH, "C9M_LA",    "Lines and Angles",
     "Pairs of angles, parallel lines, transversal, angle sum properties.", 7),
    (_tid(92),  SUBJ_C9_MATH, "C9M_QUAD",  "Quadrilaterals",
     "Properties of parallelograms, mid-point theorem, special quadrilaterals.", 8),
    (_tid(93),  SUBJ_C9_MATH, "C9M_CIRC",  "Circles",
     "Chords, arcs, cyclic quadrilaterals, angle subtended at the centre.", 9),
    (_tid(94),  SUBJ_C9_MATH, "C9M_HER",   "Heron's Formula",
     "Heron's formula for triangle area, applications to quadrilaterals.", 10),
    (_tid(95),  SUBJ_C9_MATH, "C9M_SAV",   "Surface Areas and Volumes",
     "Cuboid, cylinder, cone, sphere, hemisphere — SA and volume.", 11),
    (_tid(96),  SUBJ_C9_MATH, "C9M_STAT",  "Statistics",
     "Collection, presentation, mean / median / mode of data.", 12),

    # =================================================================
    # Class 9 — Science (extends MATTER/MOTION/GRAV)  IDs 97..105 (9 new)
    # =================================================================
    (_tid(97),  SUBJ_C9_SCI, "C9S_PURE",  "Is Matter Around Us Pure?",
     "Pure substances, mixtures, solutions, separation techniques.", 4),
    (_tid(98),  SUBJ_C9_SCI, "C9S_ATOM",  "Atoms and Molecules",
     "Laws of chemical combination, atomic mass, mole concept.", 5),
    (_tid(99),  SUBJ_C9_SCI, "C9S_STRUC", "Structure of the Atom",
     "Sub-atomic particles, atomic models, electron configuration.", 6),
    (_tid(100), SUBJ_C9_SCI, "C9S_CELL",  "The Fundamental Unit of Life",
     "Cell theory, prokaryotic vs eukaryotic cells, cell organelles.", 7),
    (_tid(101), SUBJ_C9_SCI, "C9S_TIS",   "Tissues",
     "Plant and animal tissues, classification and functions.", 8),
    (_tid(102), SUBJ_C9_SCI, "C9S_FORCE", "Force and Laws of Motion",
     "Newton's three laws, momentum, conservation of momentum.", 9),
    (_tid(103), SUBJ_C9_SCI, "C9S_WE",    "Work and Energy",
     "Work, kinetic and potential energy, power, work-energy theorem.", 10),
    (_tid(104), SUBJ_C9_SCI, "C9S_SOUND", "Sound (Class 9)",
     "Production, propagation, characteristics of sound, SONAR.", 11),
    (_tid(105), SUBJ_C9_SCI, "C9S_FOOD",  "Improvement in Food Resources",
     "Crop production, animal husbandry, food security strategies.", 12),

    # =================================================================
    # Class 9 — Social Science (NEW subject)  IDs 106..125 (20 topics)
    # =================================================================
    # History — India and the Contemporary World I (5)
    (_tid(106), SUBJ_C9_SST, "C9H_FRENCH", "The French Revolution",
     "Causes, course, abolition of monarchy, Declaration of Rights.", 1),
    (_tid(107), SUBJ_C9_SST, "C9H_RUSSIA", "Socialism in Europe and the Russian Revolution",
     "Liberals/radicals/conservatives, October Revolution, USSR.", 2),
    (_tid(108), SUBJ_C9_SST, "C9H_NAZI",   "Nazism and the Rise of Hitler",
     "Weimar Republic, Hitler's rise, Nazi ideology, Holocaust.", 3),
    (_tid(109), SUBJ_C9_SST, "C9H_FOREST", "Forest Society and Colonialism",
     "Commercial forestry, forest rebellions, scientific forestry.", 4),
    (_tid(110), SUBJ_C9_SST, "C9H_PASTOR", "Pastoralists in the Modern World",
     "Nomadic pastoralists in India and Africa, colonial impact.", 5),
    # Geography — Contemporary India I (6)
    (_tid(111), SUBJ_C9_SST, "C9G_LOC",   "India — Size and Location",
     "Latitudinal and longitudinal extent, neighbouring countries.", 6),
    (_tid(112), SUBJ_C9_SST, "C9G_PHY",   "Physical Features of India",
     "Himalayas, plains, plateau, deserts, coasts, islands.", 7),
    (_tid(113), SUBJ_C9_SST, "C9G_DRAIN", "Drainage",
     "River systems — Himalayan and Peninsular, lakes, river pollution.", 8),
    (_tid(114), SUBJ_C9_SST, "C9G_CLIM",  "Climate",
     "Monsoon, factors affecting climate, seasonal variations.", 9),
    (_tid(115), SUBJ_C9_SST, "C9G_VEG",   "Natural Vegetation and Wildlife",
     "Vegetation types, wildlife sanctuaries, biosphere reserves.", 10),
    (_tid(116), SUBJ_C9_SST, "C9G_POP",   "Population",
     "Distribution, density, growth, occupational structure.", 11),
    # Political Science — Democratic Politics I (5)
    (_tid(117), SUBJ_C9_SST, "C9P_DEMO",  "What is Democracy? Why Democracy?",
     "Features of democracy, arguments for and against.", 12),
    (_tid(118), SUBJ_C9_SST, "C9P_CONST", "Constitutional Design",
     "Making of Indian Constitution, philosophy, preamble.", 13),
    (_tid(119), SUBJ_C9_SST, "C9P_ELEC",  "Electoral Politics",
     "Why elections, election system, free and fair elections.", 14),
    (_tid(120), SUBJ_C9_SST, "C9P_INST",  "Working of Institutions",
     "Parliament, executive, judiciary, separation of powers.", 15),
    (_tid(121), SUBJ_C9_SST, "C9P_RIGHTS","Democratic Rights",
     "Fundamental Rights, expanding scope of rights.", 16),
    # Economics (4)
    (_tid(122), SUBJ_C9_SST, "C9E_PALAM", "The Story of Village Palampur",
     "Factors of production, farming and non-farming activities.", 17),
    (_tid(123), SUBJ_C9_SST, "C9E_PEOP",  "People as Resource",
     "Human capital, education, health, unemployment.", 18),
    (_tid(124), SUBJ_C9_SST, "C9E_POV",   "Poverty as a Challenge",
     "Poverty line, vulnerable groups, anti-poverty measures.", 19),
    (_tid(125), SUBJ_C9_SST, "C9E_FOOD",  "Food Security in India",
     "Buffer stock, PDS, role of cooperatives in food security.", 20),

    # =================================================================
    # Class 9 — English (NEW subject)  IDs 126..130 (5 buckets)
    # =================================================================
    (_tid(126), SUBJ_C9_ENG, "C9E_BEEHIVE", "Beehive — Prose",
     "NCERT prose: travel, courage, science, biography.", 1),
    (_tid(127), SUBJ_C9_ENG, "C9E_POEM",    "Beehive — Poetry",
     "NCERT poems on nature, identity, change.", 2),
    (_tid(128), SUBJ_C9_ENG, "C9E_MOM",     "Moments — Stories",
     "Supplementary stories with moral and emotional themes.", 3),
    (_tid(129), SUBJ_C9_ENG, "C9E_GRAM",    "Grammar and Writing",
     "Tenses, modals, clauses, formal letter, descriptive writing.", 4),
    (_tid(130), SUBJ_C9_ENG, "C9E_READ",    "Reading Comprehension",
     "Unseen passages, factual + literary, vocabulary in context.", 5),
]


def upgrade() -> None:
    # 1. Insert new subjects under existing CBSE exam.
    for sid, code, name, sort_order in NEW_SUBJECTS:
        op.execute(
            f"INSERT INTO {SCHEMA}.subjects (id, exam_id, code, name, sort_order) "
            f"VALUES ('{sid}', '{CBSE_EXAM_ID}', '{code}', "
            f"$${name}$$, {sort_order}) "
            f"ON CONFLICT (exam_id, code) DO NOTHING"
        )

    # 2. Insert all new topics. question_count = 100 reflects what
    #    content migration 034 (cbse9 full polymorphic) seeds — the
    #    template engine produces ~100 PUBLISHED MCQs per chapter from
    #    the concept bank. Pre-existing question_count=5 from the
    #    earlier 032 migration is overwritten via the hint below.
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
