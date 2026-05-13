"""NEET polymorphic seed bank — 200 questions per active type
across the six NEET topics (Biology / Physics / Chemistry).

Topic codes match catalog migration 002 + 007:
  NEET Bio:    CELL · GEN
  NEET Phys:   MECH_NEET · OPT_NEET
  NEET Chem:   INORG_NEET · ORG_NEET
"""

from __future__ import annotations

from typing import Any

from learning.content.seed import polymorphic_engine

EXAM_CODE = "NEET"

TOPICS: tuple[tuple[str, str], ...] = (
    ("33333333-0000-0000-0000-000000000008", "CELL"),
    ("33333333-0000-0000-0000-000000000009", "GEN"),
    ("33333333-0000-0000-0000-000000000010", "MECH_NEET"),
    ("33333333-0000-0000-0000-000000000011", "OPT_NEET"),
    ("33333333-0000-0000-0000-000000000012", "INORG_NEET"),
    ("33333333-0000-0000-0000-000000000013", "ORG_NEET"),
)

BANK: dict[str, list[tuple[str, str, str, list[str]]]] = {
    "CELL": [
        ("Mitochondria", "powerhouse of the cell", "Mitochondria are double-membraned organelles where aerobic respiration produces ATP via oxidative phosphorylation.", ["Golgi apparatus", "endoplasmic reticulum", "lysosomes"]),
        ("Ribosomes", "site of protein synthesis", "Ribosomes are non-membranous organelles consisting of rRNA and proteins, organised into 70S (prokaryote) or 80S (eukaryote) units.", ["centrioles", "vacuoles", "peroxisomes"]),
        ("Nucleus", "controls cell activities", "The nucleus stores genetic material as chromatin and controls gene expression; it is bounded by a double-membraned envelope with pores.", ["chloroplast", "vesicle", "cytoplasm"]),
        ("Lysosomes", "digestive sacs", "Lysosomes contain hydrolytic enzymes (~50) operating at pH ~4.5, breaking down macromolecules and worn-out organelles.", ["mitochondria", "ribosomes", "cytoskeleton"]),
        ("Plasma membrane", "selective barrier", "The plasma membrane is a phospholipid bilayer with embedded proteins, regulating substance entry/exit per the fluid-mosaic model.", ["nuclear envelope", "cell wall", "endomembrane"]),
        ("Endoplasmic reticulum", "transport network", "The endoplasmic reticulum is a network of tubules; rough ER bears ribosomes for protein synthesis, smooth ER handles lipid synthesis.", ["Golgi", "lysosome", "peroxisome"]),
        ("Golgi apparatus", "packaging organelle", "The Golgi modifies, sorts and packages proteins/lipids from the ER into vesicles destined for secretion or lysosomes.", ["mitochondria", "ribosome", "nucleolus"]),
        ("Chloroplast", "site of photosynthesis", "Chloroplasts contain chlorophyll in thylakoid membranes; they capture light energy to synthesise glucose from CO₂ and water.", ["mitochondria", "ER", "vacuole"]),
        ("Cell wall", "rigid plant outer layer", "The plant cell wall is composed mainly of cellulose; it provides structural support and protection against osmotic lysis.", ["cuticle", "phospholipid bilayer", "cytoskeleton"]),
        ("Cytoskeleton", "microtubule scaffold", "The cytoskeleton is a network of microtubules, microfilaments and intermediate filaments giving the cell shape and intracellular transport tracks.", ["nucleolus", "centriole", "peroxisome"]),
    ],
    "GEN": [
        ("DNA double helix", "Watson-Crick base pairing", "DNA is a double-helical molecule of antiparallel strands held by hydrogen bonds between A-T (2 H-bonds) and G-C (3 H-bonds).", ["RNA hairpin", "protein folding", "lipid bilayer"]),
        ("Mendel's law of segregation", "alleles separate at gamete formation", "Mendel's first law: allele pairs separate during meiosis so each gamete carries only one allele per gene locus.", ["independent assortment", "epistasis", "linkage"]),
        ("Mendel's law of independent assortment", "genes assort independently", "Mendel's second law: alleles of different genes assort independently during gamete formation, yielding a 9:3:3:1 dihybrid ratio.", ["co-dominance", "polygenic inheritance", "linkage"]),
        ("Codominance", "both alleles expressed", "In codominance both alleles contribute to the phenotype simultaneously, e.g. AB blood group expresses both A and B antigens.", ["incomplete dominance", "epistasis", "lethality"]),
        ("Sex-linked inheritance", "X-linked recessive disorders", "Sex-linked traits like haemophilia and colour-blindness are carried on the X chromosome and predominantly expressed in males.", ["autosomal dominant", "Y-linked", "mitochondrial"]),
        ("Mitosis", "produces two diploid cells", "Mitosis is the equational division producing two genetically identical diploid daughter cells; key in growth and repair.", ["meiosis", "binary fission", "amitosis"]),
        ("Meiosis", "produces four haploid gametes", "Meiosis is the reductional division producing four genetically distinct haploid gametes from one diploid parent cell.", ["mitosis", "fission", "budding"]),
        ("Chromosomes", "23 pairs in humans", "Human somatic cells carry 23 chromosome pairs (46 total): 22 autosomal pairs + 1 sex-chromosome pair (XX or XY).", ["46 pairs", "12 pairs", "20 pairs"]),
        ("Genetic code", "triplet, degenerate, universal", "The genetic code is a non-overlapping triplet code: 64 codons for 20 amino acids — degenerate but unambiguous and nearly universal.", ["doublet code", "quadruplet code", "binary code"]),
        ("DNA replication", "semi-conservative", "DNA replication is semi-conservative: each daughter helix retains one parental strand and synthesises one new strand (Meselson-Stahl 1958).", ["conservative", "dispersive", "fragmentary"]),
    ],
    "MECH_NEET": [
        ("Newton's first law", "law of inertia", "Newton's first law states that a body remains at rest or in uniform motion unless acted upon by an external unbalanced force.", ["second law", "third law", "Hooke's law"]),
        ("Newton's second law", "F = m·a", "Newton's second law: net force on a body equals mass times acceleration (F = ma); valid in inertial frames at v << c.", ["first law", "third law", "law of gravitation"]),
        ("Newton's third law", "action-reaction pairs", "Newton's third law: for every action there is an equal and opposite reaction; the forces act on different bodies.", ["first law", "second law", "Coulomb's law"]),
        ("Conservation of momentum", "p_initial = p_final", "Linear momentum of an isolated system is conserved in the absence of external forces; key to collision analysis.", ["energy conservation", "angular momentum only", "charge conservation"]),
        ("Simple harmonic motion", "F = -kx", "Simple harmonic motion arises when restoring force is proportional to and opposite displacement; period T = 2π√(m/k).", ["damped oscillation", "circular motion only", "uniform motion"]),
        ("Sound waves", "longitudinal waves", "Sound is a longitudinal mechanical wave propagating through compressions and rarefactions; speed in air ≈ 343 m/s at 20 °C.", ["transverse only", "EM wave", "stationary wave"]),
        ("Doppler effect", "frequency shift with motion", "The Doppler effect describes the apparent frequency change when source and observer have relative motion along the line of sight.", ["interference", "diffraction", "polarisation"]),
        ("Centripetal force", "F = mv²/r", "An object moving in a circle of radius r at speed v experiences centripetal force F = mv²/r directed towards the centre.", ["centrifugal force", "tangential force", "drag force"]),
        ("Friction", "opposes relative motion", "Friction opposes relative motion or its tendency between contact surfaces; static friction ≤ μ_s N, kinetic friction = μ_k N.", ["normal force", "tension", "weight"]),
        ("Work-energy theorem", "W = ΔKE", "The total work done on a body equals its change in kinetic energy: W_net = ½m(v² − u²).", ["impulse-momentum", "Bernoulli", "Stefan's law"]),
    ],
    "OPT_NEET": [
        ("Reflection law", "θ_i = θ_r", "Law of reflection: angle of incidence equals angle of reflection, with both measured from the normal to the surface.", ["Snell's law", "Brewster's law", "Malus' law"]),
        ("Snell's law", "n₁ sin θ₁ = n₂ sin θ₂", "Snell's law of refraction: ratio of sines of angles equals inverse ratio of refractive indices across the interface.", ["reflection", "diffraction", "polarisation"]),
        ("Convex lens", "converging lens", "A convex (biconvex) lens converges parallel rays to a focal point; image properties depend on object distance vs focal length.", ["concave lens", "plane mirror", "diffuser"]),
        ("Total internal reflection", "above critical angle", "When light moves from denser to rarer medium and exceeds the critical angle, it undergoes total internal reflection — basis of optical fibres.", ["refraction only", "diffraction", "scattering"]),
        ("Dispersion", "splits white light", "Dispersion through a prism splits white light into the visible spectrum because refractive index depends on wavelength.", ["diffraction", "interference", "polarisation"]),
        ("Diffraction", "bending around obstacles", "Diffraction is the bending of light around edges or through narrow slits, producing interference patterns when obstacles are wavelength-scale.", ["reflection", "refraction only", "absorption"]),
        ("Polarisation", "transverse-wave property", "Light is a transverse EM wave; polarisation orients the electric vector to a single plane, achievable via Polaroid sheets or Brewster's angle.", ["dispersion", "diffraction only", "scattering"]),
        ("Photoelectric effect", "Einstein 1905", "Light incident on a metal surface ejects electrons if photon energy hν ≥ work function; demonstrated quantum nature of light.", ["Compton effect", "Raman effect", "Doppler effect"]),
        ("Compound microscope", "two-lens system", "A compound microscope uses an objective + eyepiece; magnification ≈ (L/f_o)(D/f_e), enabling small-object visualisation.", ["telescope", "spectrometer", "periscope"]),
        ("Eye lens", "biconvex, accommodating", "The human eye lens is biconvex and adjusts focal length via ciliary-muscle tension to focus near and far objects on the retina.", ["plano-concave", "spherical mirror", "prism"]),
    ],
    "INORG_NEET": [
        ("Periodic table", "Mendeleev 1869", "The periodic table arranges elements by increasing atomic number; periodicity reflects valence-electron configuration.", ["random table", "alphabetical", "mass-only ranking"]),
        ("s-block", "Groups 1 & 2", "s-block elements include alkali metals (Group 1) and alkaline-earth metals (Group 2) with valence electrons in s-orbitals.", ["p-block", "d-block", "f-block"]),
        ("p-block", "Groups 13-18", "p-block elements (Groups 13-18) include carbon, nitrogen, oxygen, halogens and noble gases with valence in p-orbitals.", ["s-block", "d-block", "f-block"]),
        ("Ionic bond", "electron transfer", "Ionic bonds form by transfer of electrons between metal and non-metal, e.g. NaCl, MgO, KBr.", ["covalent", "metallic", "hydrogen"]),
        ("Covalent bond", "electron sharing", "Covalent bonds form when atoms share electron pairs; described by VSEPR, hybridisation and MO theory.", ["ionic", "metallic", "ionic crystal"]),
        ("Hydrogen bonding", "F-H, O-H, N-H", "Hydrogen bonds form when H is bonded to highly electronegative atoms (F, O, N), giving water its anomalously high boiling point.", ["covalent", "ionic", "metallic"]),
        ("Coordination compound", "central metal + ligands", "Coordination compounds consist of a central metal atom/ion bonded to ligands via coordinate (dative) bonds; key in catalysis and biology.", ["alloy", "salt only", "mixture"]),
        ("Oxidation number", "formal charge in compound", "Oxidation number reflects formal electron count vs the neutral atom; balances redox reactions and assigns species' oxidation states.", ["mass number", "atomic number", "valence"]),
        ("Acid", "proton donor (Brønsted)", "A Brønsted-Lowry acid donates a proton (H⁺); strong acids dissociate completely in water (HCl, HNO₃, H₂SO₄).", ["base", "salt", "oxidant"]),
        ("Base", "proton acceptor", "A Brønsted-Lowry base accepts a proton; strong bases include hydroxides of group 1 and 2 metals (NaOH, KOH, Ba(OH)₂).", ["acid", "salt", "reductant"]),
    ],
    "ORG_NEET": [
        ("Alkanes", "saturated CₙH₂ₙ₊₂", "Alkanes contain only single C-C bonds; general formula CₙH₂ₙ₊₂; relatively unreactive except via combustion and substitution.", ["alkenes", "alkynes", "arenes"]),
        ("Alkenes", "C=C double bonds", "Alkenes contain at least one C=C double bond; general formula CₙH₂ₙ; undergo addition reactions (e.g. hydrogenation, halogenation).", ["alkanes", "alkynes", "alcohols"]),
        ("Alkynes", "C≡C triple bonds", "Alkynes contain at least one C≡C triple bond; general formula CₙH₂ₙ₋₂; ethyne (acetylene) is the simplest.", ["alkenes", "alcohols", "ketones"]),
        ("Aldehyde", "-CHO functional group", "Aldehydes have the -CHO group at the end of the carbon chain; reduce Tollens' and Fehling's reagents.", ["ketone", "carboxylic acid", "ester"]),
        ("Ketone", "C=O between carbons", "Ketones have a carbonyl group (C=O) flanked by two carbon atoms; do not reduce Fehling's solution; key building blocks in synthesis.", ["aldehyde", "ester", "ether"]),
        ("Carboxylic acid", "-COOH group", "Carboxylic acids contain the -COOH group; weak acids that form salts with bases and esters with alcohols.", ["alcohol", "amine", "ether"]),
        ("Alcohol", "-OH group", "Alcohols contain the hydroxyl (-OH) functional group; classified as primary, secondary, or tertiary based on the carbon to which OH attaches.", ["ether", "phenol", "ester"]),
        ("Amine", "-NH₂ derivatives", "Amines are organic derivatives of ammonia; primary R-NH₂, secondary R₂NH, tertiary R₃N; basic and nucleophilic.", ["amide", "alcohol", "alkene"]),
        ("Benzene", "aromatic ring C₆H₆", "Benzene (C₆H₆) is the prototypical aromatic compound — planar hexagonal ring with delocalised π-electrons (Hückel rule 4n+2).", ["cyclohexane", "naphthalene", "ethyne"]),
        ("Esterification", "acid + alcohol → ester + H₂O", "Esterification is the acid-catalysed condensation of a carboxylic acid with an alcohol producing an ester and water.", ["hydrolysis", "saponification", "neutralisation"]),
    ],
}


NUMERIC_POOL: dict[str, list[tuple[int, str]]] = {
    "CELL":       [(46, "How many chromosomes are there in a human somatic cell?"),
                   (23, "How many pairs of chromosomes are there in a human somatic cell?"),
                   (50, "Approximately how many hydrolytic enzymes do lysosomes contain?")],
    "GEN":        [(64, "How many codons are there in the standard genetic code?"),
                   (20, "How many amino acids are encoded by the standard genetic code?"),
                   (3, "How many H-bonds form between G and C in DNA?")],
    "MECH_NEET":  [(343, "Speed of sound in air at 20°C in m/s (rounded)?"),
                   (10, "Approximate value of g (m/s²) at sea level (rounded)?"),
                   (9, "How many planets are recognised in the solar system today (incl. dwarf)?")],
    "OPT_NEET":   [(1, "Refractive index of vacuum?"),
                   (90, "Critical angle for water-air interface (degrees, approx)?"),
                   (380, "Lower bound of visible light wavelength in nm?")],
    "INORG_NEET": [(118, "Number of elements in the modern periodic table?"),
                   (8, "Number of groups in the s+p main-group block?"),
                   (7, "Number of periods in the periodic table?")],
    "ORG_NEET":   [(6, "Number of carbons in benzene?"),
                   (4, "Number of bonds carbon typically forms?"),
                   (2, "Number of carbons in ethane?")],
}

DECIMAL_POOL: dict[str, list[tuple[float, float, str, str]]] = {
    "CELL":       [(7.4, 0.1, "pH", "Approximate intracellular cytosol pH?"),
                   (4.5, 0.2, "pH", "Approximate lysosomal pH?")],
    "GEN":        [(0.5, 0.05, "ratio", "Probability of producing a male offspring (approx)?")],
    "MECH_NEET":  [(9.81, 0.05, "m/s²", "Standard acceleration due to gravity at Earth's surface?"),
                   (343.0, 1.0, "m/s",  "Speed of sound in dry air at 20°C?")],
    "OPT_NEET":   [(1.33, 0.02, "n", "Refractive index of water?"),
                   (1.50, 0.05, "n", "Refractive index of common crown glass?")],
    "INORG_NEET": [(1.008, 0.01, "u", "Atomic mass of hydrogen?"),
                   (35.5, 0.1,  "u", "Atomic mass of chlorine (average)?")],
    "ORG_NEET":   [(78.0, 1.0, "g/mol", "Molecular mass of benzene?"),
                   (46.0, 1.0, "g/mol", "Molecular mass of ethanol?")],
}

RANGE_POOL: dict[str, list[tuple[float, float, str, str]]] = {
    "CELL":       [(20, 30, "μm", "Typical diameter range of an animal cell? Provide range.")],
    "GEN":        [(0, 1, "ratio", "Probability bounds for any genetic event?")],
    "MECH_NEET":  [(330, 350, "m/s", "Speed of sound in air across 0-30°C? Provide range.")],
    "OPT_NEET":   [(380, 700, "nm", "Visible-light wavelength range?")],
    "INORG_NEET": [(0, 14, "pH", "Standard pH scale range?")],
    "ORG_NEET":   [(78, 80, "°C", "Boiling-point range of benzene at 1 atm?")],
}

FORMULA_POOL: list[tuple[str, str]] = [
    ("v=u+a*t",     "Equation of motion (final velocity)."),
    ("F=m*a",       "Newton's second law."),
    ("PV=nRT",      "Ideal gas equation."),
    ("E=h*f",       "Photon energy."),
    ("c**2=a**2+b**2", "Pythagoras for right triangle."),
]

SEQUENCING_POOL: dict[str, list[list[str]]] = {
    "CELL":       [["G1", "S phase (DNA replication)", "G2", "Mitosis"]],
    "GEN":        [["DNA replication", "Transcription", "Translation", "Post-translational modification"]],
    "MECH_NEET":  [["At rest", "Apply force", "Acceleration", "Constant velocity"]],
    "OPT_NEET":   [["Incidence", "Refraction", "Total internal reflection", "Emergence"]],
    "INORG_NEET": [["s-block", "p-block", "d-block", "f-block"]],
    "ORG_NEET":   [["Alkane", "Alkene", "Alkyne", "Arene"]],
}

CLASSIFICATION_POOL: dict[str, dict] = {
    "CELL":       {"categories": ["Membranous", "Non-membranous"],
                   "items": [{"text": "Mitochondria", "category": "Membranous"},
                             {"text": "ER", "category": "Membranous"},
                             {"text": "Ribosome", "category": "Non-membranous"},
                             {"text": "Centriole", "category": "Non-membranous"}]},
    "GEN":        {"categories": ["Dominant", "Recessive"],
                   "items": [{"text": "Brown eye gene", "category": "Dominant"},
                             {"text": "Blue eye gene", "category": "Recessive"},
                             {"text": "Tongue-rolling", "category": "Dominant"},
                             {"text": "Cystic-fibrosis allele", "category": "Recessive"}]},
    "MECH_NEET":  {"categories": ["Vector", "Scalar"],
                   "items": [{"text": "Velocity", "category": "Vector"},
                             {"text": "Force", "category": "Vector"},
                             {"text": "Mass", "category": "Scalar"},
                             {"text": "Energy", "category": "Scalar"}]},
    "OPT_NEET":   {"categories": ["Converging", "Diverging"],
                   "items": [{"text": "Convex lens", "category": "Converging"},
                             {"text": "Concave mirror", "category": "Converging"},
                             {"text": "Concave lens", "category": "Diverging"},
                             {"text": "Convex mirror", "category": "Diverging"}]},
    "INORG_NEET": {"categories": ["Metal", "Non-metal"],
                   "items": [{"text": "Sodium", "category": "Metal"},
                             {"text": "Iron", "category": "Metal"},
                             {"text": "Sulphur", "category": "Non-metal"},
                             {"text": "Chlorine", "category": "Non-metal"}]},
    "ORG_NEET":   {"categories": ["Saturated", "Unsaturated"],
                   "items": [{"text": "Methane", "category": "Saturated"},
                             {"text": "Ethane", "category": "Saturated"},
                             {"text": "Ethene", "category": "Unsaturated"},
                             {"text": "Ethyne", "category": "Unsaturated"}]},
}

CLOZE_POOL: dict[str, tuple[str, list[list[str]]]] = {
    "CELL":       ("The mitochondrion is bounded by [BLANK] membranes; ATP is generated via [BLANK] phosphorylation in the [BLANK].",
                   [["two", "double", "2"], ["oxidative"], ["matrix", "inner membrane"]]),
    "GEN":        ("DNA is composed of two antiparallel strands held by [BLANK] bonds between bases; A pairs with [BLANK] and G with [BLANK].",
                   [["hydrogen"], ["T", "thymine"], ["C", "cytosine"]]),
    "MECH_NEET":  ("Newton's second law states that force equals [BLANK] times [BLANK]; acceleration is measured in [BLANK].",
                   [["mass"], ["acceleration"], ["m/s²", "metres per second squared"]]),
    "OPT_NEET":   ("Refractive index of a medium is the ratio of speed of light in [BLANK] to that in the [BLANK]; for water it is approximately [BLANK].",
                   [["vacuum"], ["medium"], ["1.33", "1.34"]]),
    "INORG_NEET": ("The modern periodic table arranges elements by increasing [BLANK]; it has [BLANK] periods and [BLANK] groups.",
                   [["atomic number"], ["7", "seven"], ["18", "eighteen"]]),
    "ORG_NEET":   ("Benzene is a [BLANK]-membered aromatic ring with [BLANK] delocalised π-electrons obeying Hückel's rule [BLANK].",
                   [["six", "6"], ["six", "6"], ["4n+2"]]),
}

MAP_POOL: list[tuple[str, float, float]] = [
    ("AIIMS New Delhi", 28.57, 77.21),
    ("AIIMS Bhopal", 23.21, 77.43),
    ("JIPMER Puducherry", 11.92, 79.81),
    ("PGIMER Chandigarh", 30.76, 76.78),
    ("KGMU Lucknow", 26.87, 80.93),
    ("CMC Vellore", 12.92, 79.13),
    ("MAMC New Delhi", 28.64, 77.23),
    ("BHU Varanasi", 25.27, 82.99),
]


def all_questions() -> list[dict[str, Any]]:
    return polymorphic_engine.build_questions(
        exam_code=EXAM_CODE,
        topics=TOPICS,
        bank=BANK,
        numeric_pool=NUMERIC_POOL,
        decimal_pool=DECIMAL_POOL,
        range_pool=RANGE_POOL,
        formula_pool=FORMULA_POOL,
        sequencing_pool=SEQUENCING_POOL,
        classification_pool=CLASSIFICATION_POOL,
        cloze_pool=CLOZE_POOL,
        map_pool=MAP_POOL,
    )


if __name__ == "__main__":  # pragma: no cover
    rows = all_questions()
    print(f"Generated {len(rows)} {EXAM_CODE} questions across {len(polymorphic_engine.ACTIVE_TYPES)} types.")
