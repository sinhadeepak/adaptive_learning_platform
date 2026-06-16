"""Expand NEET / JEE Main / UPSC CSE / CAT from a handful of sample topics
to the **full chapter-level syllabus** per subject.

Before this migration the non-CBSE exams only carried 2-3 illustrative
topics per subject (Mechanics, Optics, Organic Chemistry, ...). The
Edit-exam screen and the student catalog therefore showed a sparse,
sample-only syllabus. This migration fills every existing subject out to
its real chapter list and — for UPSC, which previously had only
Polity / History / Geography — adds the three remaining core GS subjects
(Economy, Environment & Ecology, Science & Technology).

What it adds:
  NEET     Biology +34, Physics +22, Chemistry +26
  JEE Main Physics +22, Chemistry +24, Mathematics +17
  UPSC CSE Polity +16, History +11, Geography +10
           + Economy (10), Environment & Ecology (8), Science & Tech (8)
  CAT      Quant +7, Verbal +6, DI&LR +6
  CBSE     unchanged (already fully seeded in migrations 017/019/020)

Conventions (continuing the deterministic series):
  - Existing umbrella topics (Mechanics, Optics, Inorganic/Organic
    Chemistry, ...) are KEPT — questions and catalog tests reference them
    by id — and the granular chapters are appended after them, continuing
    each subject's sort_order.
  - New subject UUIDs : 22222222-0000-0000-0000-0000000000{30..32}
    (existing subjects run …01..22; 30+ leaves a clean gap).
  - New topic UUIDs   : 33333333-0000-0000-0000-{200 + index} — assigned
    programmatically so 227 rows cannot pick up a hand-typed UUID and so
    downgrade() recomputes the identical id set.
  - question_count = 0 : no questions are authored for these chapters yet;
    a later content seed can backfill the counts (cf. migration 008).

ON CONFLICT DO NOTHING keeps the migration idempotent / re-runnable.

Revision ID: 027
Revises: 026
Create Date: 2026-06-15
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "027"
down_revision: str | None = "026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"

# ---------------------------------------------------------------------------
# Exam / subject ids (from migrations 002 + 007 — re-used, NOT re-inserted).
# ---------------------------------------------------------------------------
UPSC_EXAM_ID = "11111111-0000-0000-0000-000000000003"

# JEE Main
JEE_PHY = "22222222-0000-0000-0000-000000000001"
JEE_CHEM = "22222222-0000-0000-0000-000000000002"
JEE_MATH = "22222222-0000-0000-0000-000000000003"
# NEET
NEET_BIO = "22222222-0000-0000-0000-000000000004"
NEET_PHY = "22222222-0000-0000-0000-000000000005"
NEET_CHEM = "22222222-0000-0000-0000-000000000006"
# UPSC CSE (existing)
UPSC_POL = "22222222-0000-0000-0000-000000000007"
UPSC_HIS = "22222222-0000-0000-0000-000000000008"
UPSC_GEO = "22222222-0000-0000-0000-000000000009"
# CAT
CAT_QA = "22222222-0000-0000-0000-000000000010"
CAT_VA = "22222222-0000-0000-0000-000000000011"
CAT_DILR = "22222222-0000-0000-0000-000000000012"

# New UPSC subjects added by this migration.
UPSC_ECO = "22222222-0000-0000-0000-000000000030"
UPSC_ENV = "22222222-0000-0000-0000-000000000031"
UPSC_SCT = "22222222-0000-0000-0000-000000000032"

NEW_SUBJECTS = [
    (UPSC_ECO, UPSC_EXAM_ID, "ECO", "Economy", 4),
    (UPSC_ENV, UPSC_EXAM_ID, "ENV", "Environment & Ecology", 5),
    (UPSC_SCT, UPSC_EXAM_ID, "SCT", "Science & Technology", 6),
]

# Topic-id allocation base. Suffixes 01..152 are already used by migrations
# 002/007/017/019/020; start well clear of them.
TOPIC_ID_BASE = 200


def _tid(n: int) -> str:
    return f"33333333-0000-0000-0000-{n:012d}"


# ---------------------------------------------------------------------------
# Topic catalog — (subject_id, code, title, description, sort_order).
# Ids are assigned in order via _tid(TOPIC_ID_BASE + index) in upgrade().
# sort_order continues after each subject's pre-existing topics.
# ---------------------------------------------------------------------------
NEW_TOPICS: list[tuple[str, str, str, str, int]] = [
    # =====================================================================
    # NEET — Biology  (existing: Cell Biology=1, Genetics=2)
    # =====================================================================
    (NEET_BIO, "NB_LIVING", "The Living World", "Diversity of living organisms, taxonomy, nomenclature.", 3),
    (NEET_BIO, "NB_BIOCLASS", "Biological Classification", "Five-kingdom system, monera, protista, fungi, viruses.", 4),
    (NEET_BIO, "NB_PLANTK", "Plant Kingdom", "Algae, bryophytes, pteridophytes, gymnosperms, angiosperms.", 5),
    (NEET_BIO, "NB_ANIMALK", "Animal Kingdom", "Classification of animals, phyla, chordates.", 6),
    (NEET_BIO, "NB_MORPH", "Morphology of Flowering Plants", "Root, stem, leaf, flower, inflorescence, fruit, seed.", 7),
    (NEET_BIO, "NB_ANATOMY", "Anatomy of Flowering Plants", "Plant tissues, tissue systems, secondary growth.", 8),
    (NEET_BIO, "NB_ANIMORG", "Structural Organisation in Animals", "Animal tissues, organ systems (frog/cockroach/earthworm).", 9),
    (NEET_BIO, "NB_BIOMOL", "Biomolecules", "Carbohydrates, proteins, lipids, nucleic acids, enzymes.", 10),
    (NEET_BIO, "NB_CELLDIV", "Cell Cycle and Cell Division", "Mitosis, meiosis, significance of cell division.", 11),
    (NEET_BIO, "NB_PHOTO", "Photosynthesis in Higher Plants", "Light & dark reactions, C3/C4 pathways, photorespiration.", 12),
    (NEET_BIO, "NB_RESP", "Respiration in Plants", "Glycolysis, Krebs cycle, electron transport, fermentation.", 13),
    (NEET_BIO, "NB_PGROWTH", "Plant Growth and Development", "Growth phases, plant hormones, photoperiodism, vernalisation.", 14),
    (NEET_BIO, "NB_MINERAL", "Mineral Nutrition & Transport in Plants", "Macro/micronutrients, water & solute transport, transpiration.", 15),
    (NEET_BIO, "NB_DIGEST", "Digestion and Absorption", "Human digestive system, enzymes, absorption, disorders.", 16),
    (NEET_BIO, "NB_BREATH", "Breathing and Exchange of Gases", "Respiratory system, gas transport, regulation, disorders.", 17),
    (NEET_BIO, "NB_BODYFLU", "Body Fluids and Circulation", "Blood, lymph, heart, cardiac cycle, double circulation.", 18),
    (NEET_BIO, "NB_EXCRET", "Excretory Products and their Elimination", "Nephron, urine formation, osmoregulation, dialysis.", 19),
    (NEET_BIO, "NB_LOCOMOT", "Locomotion and Movement", "Muscles, skeletal system, joints, muscle contraction.", 20),
    (NEET_BIO, "NB_NEURAL", "Neural Control and Coordination", "Neuron, nerve impulse, CNS, reflex, sense organs.", 21),
    (NEET_BIO, "NB_CHEMCO", "Chemical Coordination and Integration", "Endocrine glands, hormones, mechanism of hormone action.", 22),
    (NEET_BIO, "NB_PLANTREP", "Sexual Reproduction in Flowering Plants", "Flower structure, pollination, fertilisation, seed/fruit.", 23),
    (NEET_BIO, "NB_HUMANREP", "Human Reproduction", "Male/female reproductive systems, gametogenesis, pregnancy.", 24),
    (NEET_BIO, "NB_REPHEALTH", "Reproductive Health", "Contraception, STDs, ART, population control.", 25),
    (NEET_BIO, "NB_INHERIT", "Principles of Inheritance and Variation", "Mendelism, linkage, sex determination, mutations, disorders.", 26),
    (NEET_BIO, "NB_MOLBASIS", "Molecular Basis of Inheritance", "DNA, replication, transcription, translation, gene regulation.", 27),
    (NEET_BIO, "NB_EVOL", "Evolution", "Origin of life, evidences, Darwinism, Hardy-Weinberg.", 28),
    (NEET_BIO, "NB_HEALTH", "Human Health and Disease", "Pathogens, immunity, vaccines, cancer, drugs & alcohol.", 29),
    (NEET_BIO, "NB_MICROBE", "Microbes in Human Welfare", "Microbes in food, industry, sewage, biocontrol, biofertilisers.", 30),
    (NEET_BIO, "NB_BIOTECHP", "Biotechnology: Principles and Processes", "rDNA technology, tools, cloning vectors, PCR, bioreactors.", 31),
    (NEET_BIO, "NB_BIOTECHA", "Biotechnology and its Applications", "GM crops, gene therapy, transgenics, biosafety, patents.", 32),
    (NEET_BIO, "NB_ORGPOP", "Organisms and Populations", "Adaptations, population attributes, interactions, growth.", 33),
    (NEET_BIO, "NB_ECOSYS", "Ecosystem", "Energy flow, food chains, pyramids, nutrient cycling.", 34),
    (NEET_BIO, "NB_BIODIV", "Biodiversity and Conservation", "Levels of biodiversity, threats, in-situ/ex-situ conservation.", 35),
    (NEET_BIO, "NB_ENVISSUE", "Environmental Issues", "Pollution, global warming, ozone depletion, waste management.", 36),

    # =====================================================================
    # NEET — Physics  (existing: Mechanics & Waves=1, Optics=2)
    # =====================================================================
    (NEET_PHY, "NP_UNITS", "Units and Measurements", "SI units, dimensional analysis, errors, significant figures.", 3),
    (NEET_PHY, "NP_KINEM", "Kinematics", "Motion in a straight line and a plane, projectile motion.", 4),
    (NEET_PHY, "NP_LAWS", "Laws of Motion", "Newton's laws, friction, circular motion, momentum.", 5),
    (NEET_PHY, "NP_WEP", "Work, Energy and Power", "Work-energy theorem, conservation of energy, collisions.", 6),
    (NEET_PHY, "NP_ROT", "System of Particles and Rotational Motion", "Centre of mass, torque, moment of inertia, angular momentum.", 7),
    (NEET_PHY, "NP_GRAV", "Gravitation", "Newton's law of gravitation, orbits, escape velocity, satellites.", 8),
    (NEET_PHY, "NP_MATTER", "Mechanical Properties of Solids and Fluids", "Elasticity, pressure, viscosity, surface tension, Bernoulli.", 9),
    (NEET_PHY, "NP_THERMAL", "Thermal Properties of Matter", "Heat, temperature, expansion, calorimetry, heat transfer.", 10),
    (NEET_PHY, "NP_THERMO", "Thermodynamics", "Laws of thermodynamics, processes, heat engines, entropy.", 11),
    (NEET_PHY, "NP_KTG", "Kinetic Theory of Gases", "Gas laws, kinetic theory, degrees of freedom, mean free path.", 12),
    (NEET_PHY, "NP_ECHARGE", "Electric Charges and Fields", "Coulomb's law, electric field, Gauss's law, dipoles.", 13),
    (NEET_PHY, "NP_EPOT", "Electrostatic Potential and Capacitance", "Potential, equipotentials, capacitors, dielectrics.", 14),
    (NEET_PHY, "NP_CURRENT", "Current Electricity", "Ohm's law, resistivity, Kirchhoff's laws, Wheatstone bridge.", 15),
    (NEET_PHY, "NP_MAGCUR", "Moving Charges and Magnetism", "Magnetic force, Biot-Savart, Ampere's law, moving coil.", 16),
    (NEET_PHY, "NP_MAGMAT", "Magnetism and Matter", "Bar magnet, earth's magnetism, dia/para/ferromagnetism.", 17),
    (NEET_PHY, "NP_EMI", "Electromagnetic Induction", "Faraday's law, Lenz's law, eddy currents, inductance.", 18),
    (NEET_PHY, "NP_AC", "Alternating Current", "AC circuits, reactance, impedance, resonance, transformers.", 19),
    (NEET_PHY, "NP_EMWAVE", "Electromagnetic Waves", "Displacement current, EM spectrum, properties of EM waves.", 20),
    (NEET_PHY, "NP_DUAL", "Dual Nature of Radiation and Matter", "Photoelectric effect, photons, de Broglie waves.", 21),
    (NEET_PHY, "NP_ATOMS", "Atoms", "Rutherford & Bohr models, hydrogen spectrum, energy levels.", 22),
    (NEET_PHY, "NP_NUCLEI", "Nuclei", "Nuclear structure, mass-energy, radioactivity, fission/fusion.", 23),
    (NEET_PHY, "NP_SEMI", "Semiconductor Electronics", "Diodes, transistors, logic gates, rectifiers.", 24),

    # =====================================================================
    # NEET — Chemistry  (existing: Inorganic=1, Organic=2)
    # =====================================================================
    (NEET_CHEM, "NC_BASIC", "Some Basic Concepts of Chemistry", "Mole concept, stoichiometry, concentration terms.", 3),
    (NEET_CHEM, "NC_ATOM", "Structure of Atom", "Quantum numbers, orbitals, electronic configuration.", 4),
    (NEET_CHEM, "NC_STATES", "States of Matter: Gases and Liquids", "Gas laws, ideal/real gases, intermolecular forces.", 5),
    (NEET_CHEM, "NC_THERMO", "Thermodynamics", "Enthalpy, entropy, Gibbs energy, spontaneity, Hess's law.", 6),
    (NEET_CHEM, "NC_EQUIL", "Chemical Equilibrium", "Law of mass action, Kc/Kp, Le Chatelier's principle.", 7),
    (NEET_CHEM, "NC_IONIC", "Ionic Equilibrium", "Acids/bases, pH, buffers, solubility product, hydrolysis.", 8),
    (NEET_CHEM, "NC_REDOX", "Redox Reactions", "Oxidation number, balancing, redox titrations.", 9),
    (NEET_CHEM, "NC_SOLN", "Solutions", "Concentration, colligative properties, Raoult's law.", 10),
    (NEET_CHEM, "NC_ELCHEM", "Electrochemistry", "Electrochemical cells, Nernst equation, conductance, electrolysis.", 11),
    (NEET_CHEM, "NC_KINET", "Chemical Kinetics", "Rate laws, order, molecularity, Arrhenius equation.", 12),
    (NEET_CHEM, "NC_SOLID", "Solid State", "Crystal lattices, unit cells, packing, defects.", 13),
    (NEET_CHEM, "NC_PERIOD", "Classification of Elements and Periodicity", "Periodic table, periodic trends in properties.", 14),
    (NEET_CHEM, "NC_BOND", "Chemical Bonding and Molecular Structure", "Ionic/covalent bonds, VSEPR, hybridisation, MO theory.", 15),
    (NEET_CHEM, "NC_HYDRO", "Hydrogen", "Position, isotopes, hydrides, water, hydrogen peroxide.", 16),
    (NEET_CHEM, "NC_SBLOCK", "The s-Block Elements", "Alkali & alkaline earth metals, properties, compounds.", 17),
    (NEET_CHEM, "NC_PBLOCK", "The p-Block Elements", "Groups 13-18, trends, important compounds.", 18),
    (NEET_CHEM, "NC_DFBLOCK", "The d- and f-Block Elements", "Transition metals, lanthanoids, actinoids, properties.", 19),
    (NEET_CHEM, "NC_COORD", "Coordination Compounds", "Werner's theory, nomenclature, isomerism, bonding theories.", 20),
    (NEET_CHEM, "NC_GOC", "Organic Chemistry: Basic Principles & Techniques", "IUPAC naming, isomerism, electronic effects, mechanisms.", 21),
    (NEET_CHEM, "NC_HC", "Hydrocarbons", "Alkanes, alkenes, alkynes, aromatic hydrocarbons.", 22),
    (NEET_CHEM, "NC_HALO", "Haloalkanes and Haloarenes", "Preparation, reactions, nucleophilic substitution.", 23),
    (NEET_CHEM, "NC_ALCOHOL", "Alcohols, Phenols and Ethers", "Preparation, properties and reactions.", 24),
    (NEET_CHEM, "NC_CARBONYL", "Aldehydes, Ketones and Carboxylic Acids", "Preparation, nucleophilic addition, acidity.", 25),
    (NEET_CHEM, "NC_AMINE", "Amines", "Classification, preparation, basicity, diazonium salts.", 26),
    (NEET_CHEM, "NC_BIOMOL", "Biomolecules", "Carbohydrates, proteins, vitamins, nucleic acids, hormones.", 27),
    (NEET_CHEM, "NC_EVERYDAY", "Chemistry in Everyday Life", "Drugs, detergents, food chemistry, polymers.", 28),

    # =====================================================================
    # JEE Main — Physics  (existing: Mechanics=1, Thermodynamics=2, Electrostatics=3)
    # =====================================================================
    (JEE_PHY, "JP_UNITS", "Units, Dimensions and Measurement", "SI units, dimensional analysis, error analysis.", 4),
    (JEE_PHY, "JP_KINEM", "Kinematics", "Motion in 1D/2D, relative motion, projectile motion.", 5),
    (JEE_PHY, "JP_LAWS", "Laws of Motion", "Newton's laws, friction, circular dynamics.", 6),
    (JEE_PHY, "JP_WEP", "Work, Energy and Power", "Work-energy theorem, conservation laws, collisions.", 7),
    (JEE_PHY, "JP_ROT", "Rotational Motion", "Moment of inertia, torque, angular momentum, rolling.", 8),
    (JEE_PHY, "JP_GRAV", "Gravitation", "Gravitational field/potential, orbits, satellites.", 9),
    (JEE_PHY, "JP_MATTER", "Properties of Matter", "Elasticity, fluid statics & dynamics, surface tension.", 10),
    (JEE_PHY, "JP_SHM", "Oscillations and SHM", "Simple harmonic motion, springs, pendulums, resonance.", 11),
    (JEE_PHY, "JP_WAVES", "Waves and Sound", "Wave motion, superposition, beats, Doppler effect.", 12),
    (JEE_PHY, "JP_KTG", "Kinetic Theory of Gases", "Gas laws, kinetic theory, degrees of freedom.", 13),
    (JEE_PHY, "JP_CURRENT", "Current Electricity", "Ohm's law, circuits, Kirchhoff's laws, meters.", 14),
    (JEE_PHY, "JP_CAP", "Capacitance", "Capacitors, dielectrics, combinations, energy stored.", 15),
    (JEE_PHY, "JP_MAGNET", "Magnetic Effects of Current and Magnetism", "Biot-Savart, Ampere's law, magnetic materials.", 16),
    (JEE_PHY, "JP_EMI_AC", "Electromagnetic Induction and AC", "Faraday/Lenz laws, inductance, AC circuits, transformers.", 17),
    (JEE_PHY, "JP_EMWAVE", "Electromagnetic Waves", "Maxwell's equations, EM spectrum, properties.", 18),
    (JEE_PHY, "JP_RAYOPT", "Ray Optics", "Reflection, refraction, lenses, mirrors, optical instruments.", 19),
    (JEE_PHY, "JP_WAVEOPT", "Wave Optics", "Interference, diffraction, polarisation, Young's experiment.", 20),
    (JEE_PHY, "JP_DUAL", "Dual Nature of Matter and Radiation", "Photoelectric effect, de Broglie wavelength.", 21),
    (JEE_PHY, "JP_ATOM", "Atomic Physics", "Bohr model, hydrogen spectrum, X-rays.", 22),
    (JEE_PHY, "JP_NUCLEAR", "Nuclear Physics", "Radioactivity, binding energy, fission, fusion.", 23),
    (JEE_PHY, "JP_SEMI", "Semiconductor Electronics", "Diodes, transistors, logic gates, communication.", 24),
    (JEE_PHY, "JP_EXPT", "Experimental Skills and Error Analysis", "Vernier, screw gauge, instruments, error propagation.", 25),

    # =====================================================================
    # JEE Main — Chemistry  (existing: Physical=1, Organic=2)
    # =====================================================================
    (JEE_CHEM, "JC_BASIC", "Some Basic Concepts of Chemistry", "Mole concept, stoichiometry, empirical formulae.", 3),
    (JEE_CHEM, "JC_ATOM", "Atomic Structure", "Quantum numbers, orbitals, electronic configuration.", 4),
    (JEE_CHEM, "JC_BOND", "Chemical Bonding and Molecular Structure", "VSEPR, hybridisation, MO theory, bond parameters.", 5),
    (JEE_CHEM, "JC_STATES", "States of Matter", "Gas laws, real gases, liquids, intermolecular forces.", 6),
    (JEE_CHEM, "JC_THERMO", "Thermodynamics and Thermochemistry", "Laws, enthalpy, entropy, Gibbs energy, spontaneity.", 7),
    (JEE_CHEM, "JC_EQUIL", "Chemical and Ionic Equilibrium", "Kc/Kp, Le Chatelier, pH, buffers, solubility product.", 8),
    (JEE_CHEM, "JC_REDOX", "Redox Reactions", "Oxidation states, balancing redox equations.", 9),
    (JEE_CHEM, "JC_SOLN", "Solutions and Colligative Properties", "Concentration, Raoult's law, colligative properties.", 10),
    (JEE_CHEM, "JC_ELCHEM", "Electrochemistry", "Galvanic cells, Nernst equation, conductance, electrolysis.", 11),
    (JEE_CHEM, "JC_KINET", "Chemical Kinetics", "Rate laws, order, Arrhenius equation, catalysis.", 12),
    (JEE_CHEM, "JC_SOLID", "Solid State", "Crystal systems, unit cells, packing efficiency, defects.", 13),
    (JEE_CHEM, "JC_SURFACE", "Surface Chemistry", "Adsorption, colloids, catalysis, emulsions.", 14),
    (JEE_CHEM, "JC_PERIOD", "Classification of Elements and Periodicity", "Periodic table, periodic trends.", 15),
    (JEE_CHEM, "JC_SBLOCK", "Hydrogen and s-Block Elements", "Hydrogen, alkali and alkaline earth metals.", 16),
    (JEE_CHEM, "JC_PBLOCK", "p-Block Elements", "Groups 13-18, trends and important compounds.", 17),
    (JEE_CHEM, "JC_DFBLOCK", "d- and f-Block Elements", "Transition elements, lanthanoids, actinoids.", 18),
    (JEE_CHEM, "JC_COORD", "Coordination Compounds", "Nomenclature, isomerism, bonding, applications.", 19),
    (JEE_CHEM, "JC_METAL", "General Principles of Isolation of Elements", "Metallurgy, ore concentration, reduction, refining.", 20),
    (JEE_CHEM, "JC_HALO", "Haloalkanes and Haloarenes", "Preparation, substitution & elimination reactions.", 21),
    (JEE_CHEM, "JC_ALCOHOL", "Alcohols, Phenols and Ethers", "Preparation, properties and reactions.", 22),
    (JEE_CHEM, "JC_CARBONYL", "Aldehydes, Ketones and Carboxylic Acids", "Carbonyl chemistry, nucleophilic addition.", 23),
    (JEE_CHEM, "JC_AMINE", "Amines and Nitrogen Compounds", "Amines, diazonium salts, basicity.", 24),
    (JEE_CHEM, "JC_BIOPOLY", "Biomolecules and Polymers", "Carbohydrates, proteins, nucleic acids, polymers.", 25),
    (JEE_CHEM, "JC_EVERYDAY", "Chemistry in Everyday Life", "Drugs, detergents, food additives.", 26),

    # =====================================================================
    # JEE Main — Mathematics  (existing: Calculus=1, Coordinate Geometry=2)
    # =====================================================================
    (JEE_MATH, "JM_SETS", "Sets, Relations and Functions", "Sets, relations, types of functions, composition.", 3),
    (JEE_MATH, "JM_COMPLEX", "Complex Numbers and Quadratic Equations", "Argand plane, roots, nature of roots.", 4),
    (JEE_MATH, "JM_MATRIX", "Matrices and Determinants", "Operations, inverse, determinants, system of equations.", 5),
    (JEE_MATH, "JM_PNC", "Permutations and Combinations", "Counting principles, arrangements, selections.", 6),
    (JEE_MATH, "JM_BINOM", "Binomial Theorem", "General term, middle term, properties of coefficients.", 7),
    (JEE_MATH, "JM_SEQ", "Sequences and Series", "AP, GP, HP, special series, sum to n terms.", 8),
    (JEE_MATH, "JM_LIMITS", "Limits, Continuity and Differentiability", "Limits, continuity, differentiation rules.", 9),
    (JEE_MATH, "JM_AOD", "Applications of Derivatives", "Tangents, maxima/minima, rate of change, monotonicity.", 10),
    (JEE_MATH, "JM_INTEG", "Integrals", "Indefinite & definite integration, properties.", 11),
    (JEE_MATH, "JM_AOI", "Applications of Integrals", "Area under curves, area between curves.", 12),
    (JEE_MATH, "JM_DIFFEQ", "Differential Equations", "Order, degree, variable separable, linear DEs.", 13),
    (JEE_MATH, "JM_VECTOR", "Vector Algebra", "Vectors, dot/cross products, scalar triple product.", 14),
    (JEE_MATH, "JM_3D", "Three Dimensional Geometry", "Direction cosines, lines and planes in space.", 15),
    (JEE_MATH, "JM_TRIG", "Trigonometry", "Identities, equations, inverse functions, heights & distances.", 16),
    (JEE_MATH, "JM_PROB", "Probability", "Conditional probability, Bayes' theorem, distributions.", 17),
    (JEE_MATH, "JM_STAT", "Statistics", "Measures of central tendency and dispersion.", 18),
    (JEE_MATH, "JM_REASON", "Mathematical Reasoning", "Statements, logical connectives, tautologies.", 19),

    # =====================================================================
    # UPSC CSE — Polity  (existing: Indian Constitution=1, Governance=2)
    # =====================================================================
    (UPSC_POL, "UP_BACKGROUND", "Historical Background & Making of the Constitution", "Regulating Acts, Constituent Assembly, sources.", 3),
    (UPSC_POL, "UP_FEATURES", "Salient Features of the Constitution", "Borrowed features, federal/unitary balance, basic structure.", 4),
    (UPSC_POL, "UP_PREAMBLE", "Preamble", "Ideals, keywords, significance, amendability.", 5),
    (UPSC_POL, "UP_CITIZEN", "Union, Territory and Citizenship", "Articles 1-11, reorganisation of states, citizenship.", 6),
    (UPSC_POL, "UP_FR", "Fundamental Rights", "Articles 12-35, writs, reasonable restrictions.", 7),
    (UPSC_POL, "UP_DPSP", "Directive Principles and Fundamental Duties", "DPSP classification, Article 51A duties.", 8),
    (UPSC_POL, "UP_PARLIAMENT", "Parliament", "Composition, sessions, law-making, parliamentary committees.", 9),
    (UPSC_POL, "UP_EXEC", "Union Executive", "President, Vice-President, PM and Council of Ministers.", 10),
    (UPSC_POL, "UP_JUDICIARY", "Supreme Court and Judiciary", "Structure, jurisdiction, judicial review, PIL.", 11),
    (UPSC_POL, "UP_FEDERAL", "Federalism and Centre-State Relations", "Legislative, administrative and financial relations.", 12),
    (UPSC_POL, "UP_STATE", "State Government and Legislature", "Governor, CM, state legislature, special provisions.", 13),
    (UPSC_POL, "UP_LOCAL", "Local Government", "73rd & 74th amendments, Panchayati Raj, municipalities.", 14),
    (UPSC_POL, "UP_BODIES", "Constitutional and Statutory Bodies", "EC, UPSC, CAG, Finance Commission, NHRC, CIC.", 15),
    (UPSC_POL, "UP_ELECTION", "Elections and Electoral Reforms", "Election machinery, anti-defection, electoral reforms.", 16),
    (UPSC_POL, "UP_EMERGENCY", "Emergency Provisions", "National, state and financial emergencies.", 17),
    (UPSC_POL, "UP_AMEND", "Amendment of the Constitution", "Article 368, types of amendments, key amendments.", 18),

    # =====================================================================
    # UPSC CSE — History  (existing: Ancient India=1, Modern India=2)
    # =====================================================================
    (UPSC_HIS, "UH_MEDIEVAL", "Medieval India", "Delhi Sultanate, Mughals, Vijayanagara, Bhakti-Sufi.", 3),
    (UPSC_HIS, "UH_CULTURE", "Indian Art and Culture", "Architecture, painting, dance, music, literature.", 4),
    (UPSC_HIS, "UH_INDUS", "Indus Valley Civilisation", "Town planning, economy, decline of Harappan culture.", 5),
    (UPSC_HIS, "UH_VEDIC", "Vedic Age and Mahajanapadas", "Vedic society, religion, rise of states.", 6),
    (UPSC_HIS, "UH_EMPIRES", "Mauryan and Gupta Empires", "Administration, economy, golden age, art.", 7),
    (UPSC_HIS, "UH_SULTANATE", "Delhi Sultanate and Mughal Empire", "Dynasties, administration, society, economy.", 8),
    (UPSC_HIS, "UH_EUROPEAN", "Advent of Europeans and British Expansion", "Trading companies, Carnatic wars, conquest of Bengal.", 9),
    (UPSC_HIS, "UH_REFORM", "Socio-Religious Reform Movements", "Brahmo Samaj, Arya Samaj, reformers and impact.", 10),
    (UPSC_HIS, "UH_FREEDOM", "Indian National Movement (1885-1947)", "Congress, Gandhian phase, revolutionaries, partition.", 11),
    (UPSC_HIS, "UH_POSTIND", "Post-Independence Consolidation", "Integration of states, reorganisation, key developments.", 12),
    (UPSC_HIS, "UH_WORLD", "World History (Modern)", "Industrial revolution, world wars, decolonisation.", 13),

    # =====================================================================
    # UPSC CSE — Geography  (existing: Physical=1, Indian=2)
    # =====================================================================
    (UPSC_GEO, "UG_GEOMORPH", "Geomorphology", "Earth's interior, plate tectonics, landforms.", 3),
    (UPSC_GEO, "UG_CLIMAT", "Climatology", "Atmosphere, insolation, winds, precipitation, climate types.", 4),
    (UPSC_GEO, "UG_OCEAN", "Oceanography", "Ocean relief, currents, tides, salinity.", 5),
    (UPSC_GEO, "UG_INDPHYS", "Indian Physiography and Drainage", "Physiographic divisions, river systems.", 6),
    (UPSC_GEO, "UG_INDCLIM", "Indian Climate and Monsoon", "Monsoon mechanism, seasons, climatic regions.", 7),
    (UPSC_GEO, "UG_AGRI", "Indian Agriculture and Soils", "Cropping patterns, soil types, agricultural regions.", 8),
    (UPSC_GEO, "UG_RESOURCE", "Indian Industries and Resources", "Mineral, energy and industrial distribution.", 9),
    (UPSC_GEO, "UG_HUMAN", "Human Geography and Population", "Population, migration, settlements, urbanisation.", 10),
    (UPSC_GEO, "UG_ECON", "Economic Geography", "Resources, transport, trade, regional development.", 11),
    (UPSC_GEO, "UG_WORLD", "World Geography and Mapping", "World regions, map-based questions, location.", 12),

    # =====================================================================
    # UPSC CSE — Economy  (NEW subject)
    # =====================================================================
    (UPSC_ECO, "UE_BASICS", "Basics of Indian Economy and National Income", "Sectors, GDP/GNP, national income accounting.", 1),
    (UPSC_ECO, "UE_PLANNING", "Planning and Economic Development", "Five-year plans, NITI Aayog, development indicators.", 2),
    (UPSC_ECO, "UE_MONEY", "Money, Banking and Monetary Policy", "RBI, monetary policy tools, banking system, NPAs.", 3),
    (UPSC_ECO, "UE_FISCAL", "Fiscal Policy, Budget and Taxation", "Union budget, deficits, GST, FRBM Act.", 4),
    (UPSC_ECO, "UE_INFLATION", "Inflation and Unemployment", "Types, measurement (CPI/WPI), unemployment types.", 5),
    (UPSC_ECO, "UE_AGRI", "Agriculture and Food Security", "MSP, subsidies, food processing, PDS.", 6),
    (UPSC_ECO, "UE_INDUSTRY", "Industry, Infrastructure and Investment", "Industrial policy, FDI, PLI, infrastructure.", 7),
    (UPSC_ECO, "UE_EXTERNAL", "External Sector and International Trade", "BoP, exchange rate, trade policy, WTO.", 8),
    (UPSC_ECO, "UE_MARKETS", "Financial Markets and Institutions", "Money & capital markets, SEBI, financial inclusion.", 9),
    (UPSC_ECO, "UE_INCLUSIVE", "Inclusive Growth and Government Schemes", "Poverty, inequality, flagship welfare schemes.", 10),

    # =====================================================================
    # UPSC CSE — Environment & Ecology  (NEW subject)
    # =====================================================================
    (UPSC_ENV, "UV_ECOLOGY", "Ecology and Ecosystems", "Ecosystem structure, energy flow, food chains.", 1),
    (UPSC_ENV, "UV_BIODIV", "Biodiversity and Conservation", "Levels, hotspots, in-situ/ex-situ conservation.", 2),
    (UPSC_ENV, "UV_CLIMATE", "Climate Change and Global Warming", "Greenhouse effect, IPCC, mitigation & adaptation.", 3),
    (UPSC_ENV, "UV_POLLUTION", "Environmental Pollution", "Air, water, soil, noise pollution and control.", 4),
    (UPSC_ENV, "UV_LAWS", "Environmental Laws and Institutions", "EPA, NGT, CPCB, EIA, key environmental legislation.", 5),
    (UPSC_ENV, "UV_CONVENTION", "International Environmental Conventions", "UNFCCC, CBD, Ramsar, Montreal, Paris Agreement.", 6),
    (UPSC_ENV, "UV_WILDLIFE", "Protected Areas and Wildlife Conservation", "National parks, sanctuaries, conservation projects.", 7),
    (UPSC_ENV, "UV_SUSTAIN", "Sustainable Development and Renewable Energy", "SDGs, renewable energy, green initiatives.", 8),

    # =====================================================================
    # UPSC CSE — Science & Technology  (NEW subject)
    # =====================================================================
    (UPSC_SCT, "US_SPACE", "Space Technology", "ISRO missions, satellites, launch vehicles, applications.", 1),
    (UPSC_SCT, "US_DEFENCE", "Defence Technology", "Missiles, defence systems, indigenisation, DRDO.", 2),
    (UPSC_SCT, "US_BIOTECH", "Biotechnology and Health", "Genomics, vaccines, gene editing, biotech applications.", 3),
    (UPSC_SCT, "US_IT", "Information Technology and Computing", "AI, IoT, quantum & 5G, digital governance.", 4),
    (UPSC_SCT, "US_NUCLEAR", "Nuclear Technology", "Nuclear reactors, fuel cycle, civilian applications.", 5),
    (UPSC_SCT, "US_NANO", "Nanotechnology and New Materials", "Nanomaterials, applications, advanced materials.", 6),
    (UPSC_SCT, "US_ROBOTICS", "Robotics, AI and Emerging Technologies", "Robotics, automation, emerging tech trends.", 7),
    (UPSC_SCT, "US_POLICY", "Science & Technology Institutions and Policy", "Major institutions, STIP, R&D ecosystem.", 8),

    # =====================================================================
    # CAT — Quantitative Aptitude  (existing: Arithmetic=1, Algebra=2)
    # =====================================================================
    (CAT_QA, "CQ_NUMBER", "Number System", "Factors, divisibility, remainders, base systems.", 3),
    (CAT_QA, "CQ_GEOM", "Geometry and Mensuration", "Lines, triangles, circles, areas and volumes.", 4),
    (CAT_QA, "CQ_TRIG", "Trigonometry", "Ratios, identities, heights and distances.", 5),
    (CAT_QA, "CQ_PNC", "Permutation, Combination and Probability", "Counting, arrangements, probability.", 6),
    (CAT_QA, "CQ_SET", "Set Theory and Functions", "Venn diagrams, functions, graphs.", 7),
    (CAT_QA, "CQ_LOG", "Logarithms, Surds and Indices", "Laws of logarithms, surds, exponents.", 8),
    (CAT_QA, "CQ_PROG", "Progressions (Sequences and Series)", "AP, GP, HP and special series.", 9),

    # =====================================================================
    # CAT — Verbal Ability  (existing: Reading Comprehension=1, Grammar=2)
    # =====================================================================
    (CAT_VA, "CV_JUMBLE", "Para Jumbles", "Reordering sentences into a coherent paragraph.", 3),
    (CAT_VA, "CV_SUMMARY", "Para Summary", "Identifying the best summary of a passage.", 4),
    (CAT_VA, "CV_COMPLETE", "Sentence Completion and Insertion", "Sentence insertion and completion logic.", 5),
    (CAT_VA, "CV_CRITICAL", "Critical Reasoning", "Assumptions, inferences, strengthen/weaken arguments.", 6),
    (CAT_VA, "CV_VOCAB", "Vocabulary in Context", "Usage, synonyms/antonyms, idioms.", 7),
    (CAT_VA, "CV_ODDONE", "Verbal Logic and Odd Sentence Out", "Odd sentence out, logical coherence.", 8),

    # =====================================================================
    # CAT — Data Interpretation & LR  (existing: Data Interpretation=1)
    # =====================================================================
    (CAT_DILR, "CD_TABLES", "Data Interpretation — Tables and Graphs", "Tables, bar/line/pie charts, calculations.", 2),
    (CAT_DILR, "CD_CASELET", "Data Interpretation — Caselets", "Text-based data sets and mixed charts.", 3),
    (CAT_DILR, "CD_ARRANGE", "Logical Reasoning — Arrangements", "Linear, circular and matrix arrangements.", 4),
    (CAT_DILR, "CD_PUZZLE", "Logical Reasoning — Puzzles", "Grouping, distribution and selection puzzles.", 5),
    (CAT_DILR, "CD_GAMES", "Logical Reasoning — Games and Tournaments", "Scheduling, routes, networks, tournaments.", 6),
    (CAT_DILR, "CD_SUFFIC", "Data Sufficiency", "Judging sufficiency of given statements.", 7),
]


def _topic_id(index: int) -> str:
    return _tid(TOPIC_ID_BASE + index)


def upgrade() -> None:
    # 1. New UPSC subjects (Economy, Environment & Ecology, Science & Tech).
    for sid, eid, code, name, sort_order in NEW_SUBJECTS:
        op.execute(
            f"INSERT INTO {SCHEMA}.subjects (id, exam_id, code, name, sort_order) "
            f"VALUES ('{sid}', '{eid}', '{code}', $${name}$$, {sort_order}) "
            f"ON CONFLICT (exam_id, code) DO NOTHING"
        )

    # 2. Chapter-level topics. question_count=0 — chapters are catalogued
    #    but have no authored questions yet.
    for index, (sid, code, title, desc, sort_order) in enumerate(NEW_TOPICS):
        tid = _topic_id(index)
        op.execute(
            f"INSERT INTO {SCHEMA}.topics "
            f"(id, subject_id, code, title, description, question_count, sort_order) "
            f"VALUES ('{tid}', '{sid}', '{code}', "
            f"$${title}$$, $${desc}$$, 0, {sort_order}) "
            f"ON CONFLICT (subject_id, code) DO NOTHING"
        )


def downgrade() -> None:
    topic_ids = ", ".join(f"'{_topic_id(i)}'" for i in range(len(NEW_TOPICS)))
    subj_ids = ", ".join(f"'{s[0]}'" for s in NEW_SUBJECTS)
    op.execute(f"DELETE FROM {SCHEMA}.topics WHERE id IN ({topic_ids})")
    op.execute(f"DELETE FROM {SCHEMA}.subjects WHERE id IN ({subj_ids})")
