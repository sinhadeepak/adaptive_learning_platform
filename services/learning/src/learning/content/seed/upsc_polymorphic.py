"""UPSC polymorphic seed bank — 100 questions per active question type
across the six UPSC topics.

Built for end-to-end testing of the Phase 5 polymorphic engine:
authoring, type-aware grading, multi-parameter mastery, per-family
student renderers. The content is templated (not hand-crafted-unique)
because the goal is substrate stress-testing, not a publishable item
bank.

Active types covered (22; the six gated families are skipped):
  - Objective:   MCQ_SINGLE · MCQ_MULTI · TRUE_FALSE ·
                 ASSERTION_REASON · MULTI_STATEMENT
  - Numeric:     NUMERIC_INTEGER · NUMERIC_DECIMAL ·
                 NUMERIC_RANGE · FORMULA_INPUT
  - Matching:    MATCH_THE_FOLLOWING · SEQUENCING · CLASSIFICATION
  - Fill-in:     FILL_BLANK_SINGLE · FILL_BLANK_MULTI ·
                 CLOZE_PASSAGE · SHORT_TEXT
  - Subjective:  ESSAY · DESCRIPTIVE_LONG ·
                 CASE_STUDY · COMPREHENSION_LONG
  - Visual:      DIAGRAM_HOTSPOT · DIAGRAM_LABEL ·
                 MAP_LOCATION · PICTORIAL_IDENTIFY

Distribution: 100 questions per type, rotated across the six UPSC
topics so each topic gets ~16-17 questions per type. Determinism is
preserved at the migration layer via uuid5 over (type_id, topic_id,
idx) — re-running is safe.
"""

from __future__ import annotations

from typing import Any

ACTIVE_TYPES: tuple[str, ...] = (
    # Objective
    "MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE", "ASSERTION_REASON", "MULTI_STATEMENT",
    # Numeric
    "NUMERIC_INTEGER", "NUMERIC_DECIMAL", "NUMERIC_RANGE", "FORMULA_INPUT",
    # Matching
    "MATCH_THE_FOLLOWING", "SEQUENCING", "CLASSIFICATION",
    # Fill-in
    "FILL_BLANK_SINGLE", "FILL_BLANK_MULTI", "CLOZE_PASSAGE", "SHORT_TEXT",
    # Subjective
    "ESSAY", "DESCRIPTIVE_LONG", "CASE_STUDY", "COMPREHENSION_LONG",
    # Visual
    "DIAGRAM_HOTSPOT", "DIAGRAM_LABEL", "MAP_LOCATION", "PICTORIAL_IDENTIFY",
)

QUESTIONS_PER_TYPE = 100

# UPSC topics (id, code) — id matches catalog migration 007.
UPSC_TOPICS: tuple[tuple[str, str], ...] = (
    ("33333333-0000-0000-0000-000000000014", "CONST"),     # Indian Constitution
    ("33333333-0000-0000-0000-000000000015", "GOV"),       # Governance
    ("33333333-0000-0000-0000-000000000016", "ANCIENT"),   # Ancient India
    ("33333333-0000-0000-0000-000000000017", "MODERN"),    # Modern India
    ("33333333-0000-0000-0000-000000000018", "PHYS_GEO"),  # Physical Geography
    ("33333333-0000-0000-0000-000000000019", "IND_GEO"),   # Indian Geography
)

# ─────────────────────────────────────────────────────────────────────────
# Per-topic factual bank — used to compose realistic UPSC stems. Each
# entry is a (concept, fact_short, fact_long, distractor_pool[]) tuple.
# ─────────────────────────────────────────────────────────────────────────

_BANK: dict[str, list[tuple[str, str, str, list[str]]]] = {
    "CONST": [
        ("Article 14",  "right to equality",          "Article 14 of the Constitution guarantees equality before the law and equal protection of the laws within the territory of India.", ["right to property", "right to freedom of religion", "right to constitutional remedies"]),
        ("Article 19",  "six fundamental freedoms",   "Article 19 protects six freedoms including speech, assembly, association, movement, residence, and profession.", ["abolition of untouchability", "protection of monuments", "uniform civil code"]),
        ("Article 21",  "right to life and liberty",  "Article 21 declares that no person shall be deprived of life or personal liberty except according to procedure established by law.", ["right to vote", "right to property", "right to information"]),
        ("Article 32",  "constitutional remedies",    "Article 32 confers the right to approach the Supreme Court for enforcement of fundamental rights and is itself a fundamental right.", ["directive principles", "fundamental duties", "amendment procedure"]),
        ("Article 44",  "uniform civil code (DPSP)",  "Article 44 directs the State to endeavour to secure for citizens a Uniform Civil Code throughout the territory of India.", ["right to education", "free legal aid", "village panchayats"]),
        ("Article 51A", "fundamental duties",         "Article 51A enumerates eleven fundamental duties of every citizen, added by the 42nd Amendment.", ["President's emergency powers", "judicial review", "election commission"]),
        ("Preamble",    "secular socialist republic", "The Preamble declares India to be a sovereign, socialist, secular, democratic republic, with the words 'socialist' and 'secular' added by the 42nd Amendment in 1976.", ["limited monarchy", "federation of states", "presidential democracy"]),
        ("42nd Amend.", "mini-constitution",          "The 42nd Amendment of 1976, called the 'mini-Constitution', added the words socialist, secular and integrity to the Preamble and inserted Fundamental Duties.", ["1st Amendment", "73rd Amendment", "104th Amendment"]),
        ("73rd Amend.", "Panchayati Raj",             "The 73rd Constitutional Amendment of 1992 institutionalised Panchayati Raj across India through Part IX and the 11th Schedule.", ["GST Council", "abolition of privy purses", "anti-defection law"]),
        ("Schedule X",  "anti-defection law",         "The Tenth Schedule, inserted by the 52nd Amendment in 1985, contains provisions to disqualify legislators on the ground of defection.", ["distribution of seats", "language list", "tribal area administration"]),
    ],
    "GOV": [
        ("PM",            "head of council of ministers",     "The Prime Minister is the head of the Union Council of Ministers and the principal advisor to the President.", ["Chief Justice", "Speaker", "Comptroller and Auditor General"]),
        ("LokSabha",      "lower house, max 552 members",     "The Lok Sabha is the lower house of Parliament with a maximum strength of 552 members; its term is five years.", ["upper house", "states' chamber", "permanent body"]),
        ("RajyaSabha",    "upper house, permanent body",      "The Rajya Sabha is a permanent body that is not subject to dissolution; one-third of its members retire every two years.", ["dissolved every five years", "directly elected", "presided by President"]),
        ("UPSC",          "constitutional Article 315",       "The Union Public Service Commission is a constitutional body established under Article 315 of the Constitution.", ["statutory body", "executive body", "advisory body"]),
        ("ECI",           "Election Commission Article 324",  "The Election Commission of India is a permanent constitutional body set up under Article 324 to conduct free and fair elections.", ["Article 280", "Article 148", "Article 76"]),
        ("CAG",           "Article 148, audits accounts",     "The Comptroller and Auditor General is appointed under Article 148 and audits the accounts of the Union and State Governments.", ["NITI Aayog", "Finance Commission", "Lokpal"]),
        ("FinanceComm",   "Article 280, every 5 years",       "The Finance Commission is constituted by the President every five years under Article 280 to recommend devolution of taxes.", ["Article 263", "Article 312", "Article 365"]),
        ("NITIAayog",     "policy think tank, est. 2015",     "NITI Aayog replaced the Planning Commission in 2015 as the premier policy think tank of the Government of India.", ["statutory body", "constitutional body", "ministry"]),
        ("Lokpal",        "anti-corruption ombudsman 2014",   "The Lokpal and Lokayuktas Act 2013 came into force on 16 January 2014 to set up an anti-corruption ombudsman at the central level.", ["1988", "1991", "2002"]),
        ("Governor",      "appointed by President",           "The Governor of a state is appointed by the President and serves as the constitutional head of the state.", ["elected by MLAs", "appointed by Chief Minister", "elected directly"]),
    ],
    "ANCIENT": [
        ("IndusValley",   "urban civilisation 2500 BCE",      "The Indus Valley Civilisation flourished around 2500-1900 BCE with planned cities like Harappa and Mohenjo-daro.", ["Vedic period", "Mauryan empire", "Gupta empire"]),
        ("Mauryans",      "Chandragupta to Ashoka",           "The Mauryan empire (322-185 BCE) was founded by Chandragupta Maurya and reached its peak under Ashoka.", ["Gupta dynasty", "Cholas", "Mughals"]),
        ("Ashoka",        "Kalinga War, Dhamma policy",       "Emperor Ashoka adopted Buddhism after the Kalinga War (261 BCE) and propagated Dhamma through rock and pillar edicts.", ["Akbar", "Harsha", "Samudragupta"]),
        ("Gupta",         "golden age, 320-550 CE",           "The Gupta period (320-550 CE) is considered the Golden Age of India for its achievements in science, mathematics, art, and literature.", ["Mauryan", "Mughal", "Vijayanagar"]),
        ("Aryabhata",     "decimal system, zero",             "Aryabhata (476 CE) was the first to clearly state that the earth rotates on its axis daily and gave approximations of pi.", ["Brahmagupta", "Bhaskara II", "Varahamihira"]),
        ("VedicTexts",    "Rigveda is oldest",                "The Rigveda is the oldest of the four Vedas, composed in ancient Sanskrit between c. 1500-1000 BCE.", ["Samaveda", "Yajurveda", "Atharvaveda"]),
        ("Buddhism",      "founded by Gautama Buddha",        "Buddhism was founded by Siddhartha Gautama (Buddha) in the 6th century BCE, with the first sermon delivered at Sarnath.", ["Vasubandhu", "Mahavira", "Adi Shankara"]),
        ("Jainism",       "Mahavira 24th tirthankara",        "Jainism was reformed by Mahavira (599-527 BCE), the 24th and last tirthankara, emphasising non-violence and asceticism.", ["Siddhartha Gautama", "Parshvanatha", "Buddha"]),
        ("Cholas",        "south Indian maritime empire",     "The Chola dynasty (9th-13th c.) was a south Indian maritime power famous for naval expeditions to Southeast Asia under Rajaraja and Rajendra Chola.", ["Pallavas", "Pandyas", "Cheras"]),
        ("Harsha",        "7th century, capital Kannauj",     "Harshavardhana (606-647 CE) ruled north India from Kannauj; the Chinese pilgrim Xuanzang visited his court.", ["Samudragupta", "Chandragupta II", "Pulakesin"]),
    ],
    "MODERN": [
        ("BattleOfPlassey",   "1757, Robert Clive",            "The Battle of Plassey (23 June 1757) marked the beginning of British political dominance in Bengal under Robert Clive.", ["Battle of Buxar 1764", "Third Carnatic War 1763", "Battle of Wandiwash 1760"]),
        ("BattleOfBuxar",     "1764, decisive victory",        "The Battle of Buxar (22 October 1764) was a decisive British victory over the combined forces of Bengal, Awadh, and the Mughal emperor.", ["Plassey 1757", "First Anglo-Maratha War", "Battle of Talikota"]),
        ("FirstWar1857",      "Sepoy Mutiny / First Independence", "The Revolt of 1857, called the First War of Independence, began at Meerut on 10 May and was suppressed by mid-1858.", ["Quit India Movement", "Champaran Satyagraha", "Bardoli Satyagraha"]),
        ("INC1885",           "Indian National Congress",      "The Indian National Congress was founded in 1885 by Allan Octavian Hume; the first session was held in Bombay under WC Bonnerjee.", ["1857", "1905", "1920"]),
        ("Partition1905",     "Bengal partition by Curzon",    "The Partition of Bengal in 1905 by Lord Curzon led to the Swadeshi Movement and was annulled in 1911.", ["1857", "1947", "1919"]),
        ("Gandhi-Champaran",  "1917 first satyagraha",         "The Champaran Satyagraha of 1917 was Gandhi's first civil-disobedience experiment in India, against the indigo planters.", ["Kheda 1918", "Bardoli 1928", "Salt March 1930"]),
        ("DandiMarch",        "Salt March 1930",               "The Dandi March (12 March - 6 April 1930), led by Gandhi, started the Civil Disobedience Movement by violating the salt law.", ["Khilafat 1919", "Quit India 1942", "Round Table 1931"]),
        ("QuitIndia1942",     "August Kranti",                 "The Quit India Movement was launched on 8 August 1942 with the slogan 'Do or Die', leading to mass arrests of Congress leaders.", ["1930", "1947", "1919"]),
        ("Independence",      "15 August 1947",                "India gained independence from British rule on 15 August 1947 following the Indian Independence Act 1947.", ["26 January 1950", "26 November 1949", "2 October 1947"]),
        ("Republic",          "26 January 1950",               "India became a sovereign democratic republic on 26 January 1950, when the Constitution adopted on 26 November 1949 came into force.", ["15 August 1947", "26 November 1949", "1 July 1948"]),
    ],
    "PHYS_GEO": [
        ("TropicCancer",  "23.5°N latitude",                  "The Tropic of Cancer lies at approximately 23.5° N latitude and passes through eight Indian states.", ["Equator", "Tropic of Capricorn", "Arctic Circle"]),
        ("Monsoon",       "south-west monsoon June-Sep",      "The south-west monsoon brings rainfall to most of India from June to September, accounting for ~75% of annual precipitation.", ["western disturbance", "north-east monsoon", "trade winds"]),
        ("Himalayas",     "young fold mountains",             "The Himalayas are young fold mountains formed by the collision of the Indian and Eurasian plates, still rising by ~5 mm/year.", ["block mountains", "volcanic mountains", "residual mountains"]),
        ("Peninsular",    "ancient stable craton",            "The Peninsular plateau is part of the ancient Gondwana stable craton with rocks dating back to 3.6 billion years.", ["fold mountain belt", "subduction zone", "rift valley"]),
        ("Coriolis",      "deflects winds, Earth rotation",   "The Coriolis effect deflects winds to the right in the Northern Hemisphere and to the left in the Southern Hemisphere.", ["centripetal force", "magnetic deflection", "geostrophic balance"]),
        ("ENSO",          "El Niño, Southern Oscillation",    "ENSO is a coupled ocean-atmosphere phenomenon in the equatorial Pacific that influences Indian monsoon strength.", ["IOD only", "Walker Cell only", "NAO"]),
        ("WesternGhats",  "biodiversity hotspot",             "The Western Ghats are a UNESCO World Heritage site and one of the world's eight 'hottest' biodiversity hotspots.", ["Eastern Ghats", "Aravallis", "Vindhyas"]),
        ("ThorDesert",    "north-western India",              "The Thar Desert covers the north-western part of India spanning Rajasthan, Gujarat, Punjab, and Haryana.", ["Deccan plateau", "Indo-Gangetic plain", "Sundarbans"]),
        ("Sundarbans",    "world's largest mangrove",         "The Sundarbans, in the delta of the Ganges-Brahmaputra-Meghna, is the world's largest contiguous mangrove forest and a UNESCO World Heritage site.", ["Western Ghats", "Andamans", "Lakshadweep"]),
        ("KrishnaRiver",  "peninsular river east-flowing",    "The Krishna river originates near Mahabaleshwar in Maharashtra and flows east into the Bay of Bengal.", ["west-flowing", "Himalayan", "endorheic"]),
    ],
    "IND_GEO": [
        ("Ganga",         "longest Indian river 2525 km",     "The Ganga, India's longest river at ~2525 km, originates from the Gangotri glacier and drains into the Bay of Bengal.", ["Indus", "Brahmaputra", "Godavari"]),
        ("Brahmaputra",   "trans-boundary river",             "The Brahmaputra rises in Tibet (as Yarlung Tsangpo), flows through India and Bangladesh, and joins the Ganga in the Sundarbans.", ["Ganga", "Mahanadi", "Krishna"]),
        ("StatesCount",   "28 states + 8 UTs",                "India consists of 28 states and 8 union territories as of 2026, the most recent change being the bifurcation of J&K in 2019.", ["29 states + 7 UTs", "27 states + 9 UTs", "30 states + 6 UTs"]),
        ("BlackSoil",     "regur, Deccan trap",               "Black soil (regur) is found mainly on the Deccan trap and is well-suited for cotton cultivation.", ["alluvial soil", "laterite soil", "red soil"]),
        ("AlluvialSoil",  "Indo-Gangetic plain",              "Alluvial soil covers about 40% of India's land area and is the most fertile and intensively cultivated soil type.", ["red soil", "black soil", "saline soil"]),
        ("LateriteSoil",  "western coast and hills",          "Laterite soil forms in tropical regions with alternating wet and dry seasons; common in the Western Ghats and parts of Odisha.", ["alluvial soil", "desert soil", "mountain soil"]),
        ("MumbaiPort",    "Maharashtra, west coast",          "Mumbai (Bombay) is India's busiest container port on the west coast and the financial capital of the country.", ["Chennai", "Kandla", "Visakhapatnam"]),
        ("DeccanPlateau", "south-central India",              "The Deccan Plateau covers most of south-central India and is bounded by the Western and Eastern Ghats.", ["Indo-Gangetic plain", "Thar desert", "Himalayan foothills"]),
        ("KaziNP",        "Assam, one-horned rhino",          "Kaziranga National Park in Assam, a UNESCO World Heritage site, hosts two-thirds of the world's one-horned rhinoceros population.", ["Sundarbans", "Gir", "Ranthambore"]),
        ("CoralIslands",  "Lakshadweep group",                "Lakshadweep is India's only coral atoll group, lying off the Kerala coast in the Arabian Sea.", ["Andaman Islands", "Sundarbans", "Diu"]),
    ],
}


def _topic_for(idx: int) -> tuple[str, str]:
    """Round-robin topic assignment so every topic gets ~equal share."""
    return UPSC_TOPICS[idx % len(UPSC_TOPICS)]


def _bank_entry(topic_code: str, idx: int) -> tuple[str, str, str, list[str]]:
    """Pick a fact entry from the topic bank, rotating with idx."""
    entries = _BANK[topic_code]
    return entries[idx % len(entries)]


def _difficulty(idx: int) -> float:
    """Spread difficulty across the [-1.5, 1.5] band."""
    return -1.5 + (idx % 7) * 0.5


# ─────────────────────────────────────────────────────────────────────────
# Per-type generators. Each returns a dict with stem + (legacy MCQ-shape
# fields) + payload (None for MCQ_SINGLE; populated otherwise).
# ─────────────────────────────────────────────────────────────────────────


def _gen_mcq_single(idx: int, topic_code: str, concept: str, fact: str, _long: str, distractors: list[str]) -> dict[str, Any]:
    correct = fact
    choices = [correct] + distractors[:3]
    correct_idx = 0
    return {
        "stem": f"[UPSC {topic_code} #{idx + 1}] With reference to {concept}, which of the following is correct?",
        "choices": choices,
        "correct_idx": correct_idx,
        "payload": None,
    }


def _gen_mcq_multi(idx: int, topic_code: str, concept: str, fact: str, _long: str, distractors: list[str]) -> dict[str, Any]:
    # Two correct options out of four — represents "select all that apply".
    choices = [fact, distractors[0], f"{concept} is enshrined in the Indian Constitution.", distractors[1]]
    correct_ids = ["A", "C"]
    return {
        "stem": f"[UPSC {topic_code} #{idx + 1}] Regarding {concept}, which of the following statements are correct? (Select all that apply)",
        "choices": choices,
        "correct_idx": 0,  # legacy field; real answer in payload
        "payload": {
            "options": [
                {"id": "A", "text": choices[0]},
                {"id": "B", "text": choices[1]},
                {"id": "C", "text": choices[2]},
                {"id": "D", "text": choices[3]},
            ],
            "correct_ids": correct_ids,
            "partial_credit": True,
        },
    }


def _gen_true_false(idx: int, topic_code: str, concept: str, _fact: str, long: str, _distractors: list[str]) -> dict[str, Any]:
    is_true = idx % 2 == 0
    statement = long if is_true else f"It is widely held that {concept} was abolished by the 42nd Amendment of 1976."
    return {
        "stem": f"[UPSC {topic_code} #{idx + 1}] True or False — {statement}",
        "choices": ["True", "False"],
        "correct_idx": 0 if is_true else 1,
        "payload": {"statement": statement, "correct": is_true},
    }


def _gen_assertion_reason(idx: int, topic_code: str, concept: str, _fact: str, long: str, distractors: list[str]) -> dict[str, Any]:
    # Classic UPSC pattern: assertion + reason; pick which describes the
    # relationship (both true + R explains A; both true + R doesn't; A
    # true R false; A false R true).
    cycle = idx % 4
    options = [
        "Both A and R are true and R is the correct explanation of A.",
        "Both A and R are true but R is NOT the correct explanation of A.",
        "A is true but R is false.",
        "A is false but R is true.",
    ]
    return {
        "stem": (
            f"[UPSC {topic_code} #{idx + 1}] "
            f"Assertion (A): {long} "
            f"Reason (R): {concept} relates to {distractors[0]}. "
            f"Choose the correct option:"
        ),
        "choices": options,
        "correct_idx": cycle,
        "payload": {
            "assertion": long,
            "reason": f"{concept} relates to {distractors[0]}.",
            "options": [{"id": chr(65 + i), "text": t} for i, t in enumerate(options)],
            "correct_id": chr(65 + cycle),
        },
    }


def _gen_multi_statement(idx: int, topic_code: str, concept: str, _fact: str, long: str, distractors: list[str]) -> dict[str, Any]:
    # Three numbered statements; ask which combination is correct.
    statements = [
        long,
        f"{concept} was first introduced through a constitutional amendment in 1976.",
        f"{concept} can be modified only by a special majority of both houses of Parliament.",
    ]
    correct_combo = [1, 3]  # statements 1 and 3 are correct; 2 is the distractor
    options = [
        "1 and 2 only",
        "1 and 3 only",
        "2 and 3 only",
        "1, 2 and 3",
    ]
    return {
        "stem": (
            f"[UPSC {topic_code} #{idx + 1}] Consider the following statements regarding {concept}:\n"
            f"1. {statements[0]}\n2. {statements[1]}\n3. {statements[2]}\n"
            f"Which of the statements given above are correct?"
        ),
        "choices": options,
        "correct_idx": 1,
        "payload": {
            "statements": [{"id": i + 1, "text": s} for i, s in enumerate(statements)],
            "options": [{"id": chr(65 + i), "text": o} for i, o in enumerate(options)],
            "correct_id": "B",
            "correct_statement_ids": correct_combo,
        },
    }


def _gen_numeric_integer(idx: int, topic_code: str, _concept: str, _fact: str, _long: str, _distractors: list[str]) -> dict[str, Any]:
    # Use idx to vary year/count answers across topics.
    bank = {
        "CONST":    [(1949, "In which year was the Indian Constitution adopted?"),
                     (1950, "In which year did the Indian Constitution come into force?"),
                     (395,  "How many articles were originally in the Constitution of India?")],
        "GOV":      [(552,  "What is the maximum strength of the Lok Sabha?"),
                     (250,  "What is the maximum strength of the Rajya Sabha?"),
                     (5,    "How often is the Finance Commission constituted (in years)?")],
        "ANCIENT":  [(322,  "In which BCE year did Chandragupta Maurya found the Mauryan empire? (Year BCE)"),
                     (261,  "In which BCE year was the Kalinga War fought? (Year BCE)"),
                     (24,   "Mahavira was the how many-th tirthankara of Jainism?")],
        "MODERN":   [(1857, "In which year did the First War of Indian Independence begin?"),
                     (1885, "In which year was the Indian National Congress founded?"),
                     (1947, "In which year did India attain independence?")],
        "PHYS_GEO": [(8,    "Through how many Indian states does the Tropic of Cancer pass?"),
                     (75,   "Approximately what percent of India's annual rainfall comes from the south-west monsoon?"),
                     (5,    "By approximately how many millimetres per year are the Himalayas still rising?")],
        "IND_GEO":  [(28,   "How many states are there in India as of 2026?"),
                     (8,    "How many Union Territories does India have as of 2026?"),
                     (2525, "What is the approximate length of the Ganga river in kilometres?")],
    }
    pool = bank[topic_code]
    answer, prompt = pool[idx % len(pool)]
    return {
        "stem": f"[UPSC {topic_code} #{idx + 1}] {prompt}",
        "choices": [str(answer)],
        "correct_idx": 0,
        "payload": {"answer": answer, "unit": None},
    }


def _gen_numeric_decimal(idx: int, topic_code: str, concept: str, _fact: str, _long: str, _distractors: list[str]) -> dict[str, Any]:
    # Tolerance-based decimal answers (latitudes, ratios, percentages).
    pool = [
        (23.5, 0.1, "°N", f"At what latitude (°N) does the Tropic of Cancer pass through India? (related to {concept})"),
        (66.5, 0.1, "°N", f"What is the latitude of the Arctic Circle? (related to {concept})"),
        (75.0, 1.0, "%",  f"South-west monsoon contributes approximately what percent of India's annual rainfall? (related to {concept})"),
    ]
    answer, tol, unit, prompt = pool[idx % len(pool)]
    return {
        "stem": f"[UPSC {topic_code} #{idx + 1}] {prompt}",
        "choices": [f"{answer} {unit}"],
        "correct_idx": 0,
        "payload": {"answer": answer, "tolerance": tol, "unit": unit},
    }


def _gen_numeric_range(idx: int, topic_code: str, concept: str, _fact: str, _long: str, _distractors: list[str]) -> dict[str, Any]:
    pool = [
        (1500, 1000, "BCE", f"Approximately when (in BCE) was the Rigveda composed? Provide a range. ({concept})"),
        (322,  185,  "BCE", f"During which years (BCE) did the Mauryan empire rule? Provide a range. ({concept})"),
        (320,  550,  "CE",  f"During which years (CE) did the Gupta empire rule? Provide a range. ({concept})"),
    ]
    high, low, era, prompt = pool[idx % len(pool)]
    return {
        "stem": f"[UPSC {topic_code} #{idx + 1}] {prompt}",
        "choices": [f"{low}-{high} {era}"],
        "correct_idx": 0,
        "payload": {"low": low, "high": high, "unit": era},
    }


def _gen_formula_input(idx: int, topic_code: str, _concept: str, _fact: str, _long: str, _distractors: list[str]) -> dict[str, Any]:
    # CSAT-style formulas (simple algebra).
    pool = [
        ("(P*R*T)/100", "Write the formula for simple interest, where P = principal, R = rate per annum (%), T = time (years)."),
        ("(D/T)",        "Write the formula for speed, where D = distance and T = time taken."),
        ("100*(N-O)/O",  "Write the formula for percentage change, where N = new value and O = old value."),
    ]
    expr, prompt = pool[idx % len(pool)]
    return {
        "stem": f"[UPSC {topic_code} CSAT #{idx + 1}] {prompt}",
        "choices": [expr],
        "correct_idx": 0,
        "payload": {"canonical_expr": expr, "variables": ["P", "R", "T", "D", "N", "O"]},
    }


def _gen_match_following(idx: int, topic_code: str, concept: str, _fact: str, _long: str, distractors: list[str]) -> dict[str, Any]:
    # Build pairs from the topic bank itself: List I = concept names,
    # List II = facts. Pick 4 entries.
    entries = _BANK[topic_code]
    chosen = [entries[(idx + k) % len(entries)] for k in range(4)]
    pairs = [{"left": c[0], "right": c[1]} for c in chosen]
    return {
        "stem": (
            f"[UPSC {topic_code} #{idx + 1}] Match List I with List II "
            f"(related to {concept}):"
        ),
        "choices": [f"{p['left']} ↔ {p['right']}" for p in pairs],
        "correct_idx": 0,
        "payload": {"pairs": pairs},
    }


def _gen_sequencing(idx: int, topic_code: str, concept: str, _fact: str, _long: str, _distractors: list[str]) -> dict[str, Any]:
    # Use historical events for chronological sequencing.
    pool = {
        "MODERN": [
            ["Battle of Plassey (1757)", "Battle of Buxar (1764)", "Revolt of 1857", "Indian National Congress (1885)", "Quit India (1942)", "Independence (1947)"],
            ["Champaran Satyagraha (1917)", "Jallianwala Bagh (1919)", "Dandi March (1930)", "Quit India (1942)", "Cabinet Mission (1946)"],
        ],
        "ANCIENT": [
            ["Indus Valley", "Vedic period", "Mauryan empire", "Gupta empire", "Harsha"],
            ["Buddha (6th c. BCE)", "Ashoka (3rd c. BCE)", "Chandragupta II (4th c. CE)", "Harsha (7th c. CE)"],
        ],
        "CONST":     [["Cabinet Mission 1946", "Constituent Assembly first session 1946", "Constitution adopted 1949", "Constitution effective 1950", "First Amendment 1951"]],
        "GOV":       [["Election Commission established", "First general election", "Anti-defection law 1985", "73rd Amendment 1992", "Lokpal Act 2014"]],
        "PHYS_GEO":  [["Formation of Gondwana", "Break-up of Gondwana", "Indian plate northward drift", "Collision with Eurasia", "Himalayan uplift"]],
        "IND_GEO":   [["Reorganisation Act 1956", "Goa annexation 1961", "Telangana formation 2014", "Bifurcation of J&K 2019"]],
    }
    sequences = pool[topic_code]
    seq = sequences[idx % len(sequences)]
    return {
        "stem": f"[UPSC {topic_code} #{idx + 1}] Arrange the following in chronological order ({concept}):",
        "choices": seq,
        "correct_idx": 0,
        "payload": {"items": seq},
    }


def _gen_classification(idx: int, topic_code: str, concept: str, _fact: str, _long: str, _distractors: list[str]) -> dict[str, Any]:
    pool = {
        "IND_GEO":   {
            "categories": ["Himalayan", "Peninsular"],
            "items": [
                {"text": "Ganga", "category": "Himalayan"},
                {"text": "Brahmaputra", "category": "Himalayan"},
                {"text": "Indus", "category": "Himalayan"},
                {"text": "Krishna", "category": "Peninsular"},
                {"text": "Godavari", "category": "Peninsular"},
                {"text": "Kaveri", "category": "Peninsular"},
            ],
        },
        "PHYS_GEO":  {
            "categories": ["Fold mountain", "Block mountain"],
            "items": [
                {"text": "Himalayas", "category": "Fold mountain"},
                {"text": "Andes", "category": "Fold mountain"},
                {"text": "Vosges", "category": "Block mountain"},
                {"text": "Sierra Nevada", "category": "Block mountain"},
            ],
        },
        "CONST":     {
            "categories": ["Fundamental Right", "Directive Principle"],
            "items": [
                {"text": "Right to Equality (Art 14-18)", "category": "Fundamental Right"},
                {"text": "Right to Constitutional Remedies (Art 32)", "category": "Fundamental Right"},
                {"text": "Uniform Civil Code (Art 44)", "category": "Directive Principle"},
                {"text": "Free legal aid (Art 39A)", "category": "Directive Principle"},
            ],
        },
        "GOV":       {
            "categories": ["Constitutional body", "Statutory body"],
            "items": [
                {"text": "Election Commission (Art 324)", "category": "Constitutional body"},
                {"text": "Finance Commission (Art 280)", "category": "Constitutional body"},
                {"text": "NITI Aayog", "category": "Statutory body"},
                {"text": "Lokpal", "category": "Statutory body"},
            ],
        },
        "ANCIENT":   {
            "categories": ["Hindu dynasty", "Buddhist patron"],
            "items": [
                {"text": "Gupta", "category": "Hindu dynasty"},
                {"text": "Chola", "category": "Hindu dynasty"},
                {"text": "Mauryan (under Ashoka)", "category": "Buddhist patron"},
                {"text": "Kushan (under Kanishka)", "category": "Buddhist patron"},
            ],
        },
        "MODERN":    {
            "categories": ["Pre-1857", "Post-1857"],
            "items": [
                {"text": "Battle of Plassey", "category": "Pre-1857"},
                {"text": "Battle of Buxar", "category": "Pre-1857"},
                {"text": "Revolt of 1857", "category": "Post-1857"},
                {"text": "INC founding 1885", "category": "Post-1857"},
                {"text": "Quit India 1942", "category": "Post-1857"},
            ],
        },
    }
    bank = pool[topic_code]
    return {
        "stem": f"[UPSC {topic_code} #{idx + 1}] Classify each of the following ({concept}):",
        "choices": [f"{i['text']} → {i['category']}" for i in bank["items"]],
        "correct_idx": 0,
        "payload": bank,
    }


def _gen_fill_blank_single(idx: int, topic_code: str, concept: str, _fact: str, long: str, _distractors: list[str]) -> dict[str, Any]:
    # Hide one key word from the long form.
    target = concept.split()[0]
    template = long.replace(target, "[BLANK]", 1)
    return {
        "stem": f"[UPSC {topic_code} #{idx + 1}] Fill in the blank: {template}",
        "choices": [target],
        "correct_idx": 0,
        "payload": {"template": template, "accepted": [[target, target.lower()]]},
    }


def _gen_fill_blank_multi(idx: int, topic_code: str, concept: str, _fact: str, long: str, distractors: list[str]) -> dict[str, Any]:
    template = (
        f"The article {concept} appears in [BLANK] of the Indian Constitution and was "
        f"discussed during the [BLANK] period of the Constituent Assembly debates."
    )
    return {
        "stem": f"[UPSC {topic_code} #{idx + 1}] Complete the statement (related to: {long[:80]}…):",
        "choices": ["Part III · 1948-1949"],
        "correct_idx": 0,
        "payload": {
            "template": template,
            "accepted": [
                ["Part III", "Chapter III", "Fundamental Rights chapter"],
                ["1948-1949", "1948-49", "second reading"],
            ],
        },
    }


def _gen_cloze(idx: int, topic_code: str, _concept: str, _fact: str, _long: str, _distractors: list[str]) -> dict[str, Any]:
    pool = {
        "MODERN": (
            "The Indian National Congress was founded in [BLANK] by [BLANK]; the first "
            "session was held in [BLANK] under the presidency of [BLANK].",
            [["1885"], ["Allan Octavian Hume", "A.O. Hume"], ["Bombay", "Mumbai"], ["WC Bonnerjee", "Bonnerjee"]],
        ),
        "CONST": (
            "The Constitution of India was adopted on [BLANK] and came into force on "
            "[BLANK]. The 42nd Amendment of [BLANK] added the words [BLANK] to the Preamble.",
            [["26 November 1949", "1949"], ["26 January 1950", "1950"], ["1976"], ["socialist secular"]],
        ),
        "ANCIENT": (
            "The Indus Valley Civilisation flourished around [BLANK] BCE; major sites "
            "included [BLANK] and [BLANK]. The script remains [BLANK] till date.",
            [["2500-1900", "2500"], ["Harappa"], ["Mohenjo-daro"], ["undeciphered"]],
        ),
        "GOV": (
            "The President of India is elected by an electoral college consisting of "
            "[BLANK] and [BLANK]. The term of office is [BLANK] years.",
            [["elected MPs"], ["elected MLAs of states"], ["five", "5"]],
        ),
        "PHYS_GEO": (
            "The south-west monsoon arrives in India around [BLANK] and accounts for "
            "approximately [BLANK]% of annual rainfall, withdrawing by [BLANK].",
            [["June 1", "1 June"], ["75"], ["September", "October"]],
        ),
        "IND_GEO": (
            "India has [BLANK] states and [BLANK] union territories. The longest river "
            "is the [BLANK] at approximately [BLANK] km.",
            [["28"], ["8"], ["Ganga"], ["2525", "2500"]],
        ),
    }
    template, accepted = pool[topic_code]
    return {
        "stem": f"[UPSC {topic_code} CSAT #{idx + 1}] Complete the cloze passage:",
        "choices": [template[:60] + "…"],
        "correct_idx": 0,
        "payload": {"template": template, "accepted": accepted},
    }


def _gen_short_text(idx: int, topic_code: str, concept: str, fact: str, _long: str, _distractors: list[str]) -> dict[str, Any]:
    return {
        "stem": f"[UPSC {topic_code} #{idx + 1}] In one sentence (≤30 words), explain what is meant by '{concept}'.",
        "choices": [fact],
        "correct_idx": 0,
        "payload": {
            "expected_word_count_range": [10, 30],
            "model_answer": fact,
            "rubric": [
                {"criterion": "factual_accuracy", "weight": 60, "description": f"Mentions {concept} accurately."},
                {"criterion": "concision",        "weight": 40, "description": "Stays within the 30-word limit."},
            ],
        },
    }


def _gen_essay(idx: int, topic_code: str, concept: str, _fact: str, long: str, _distractors: list[str]) -> dict[str, Any]:
    return {
        "stem": (
            f"[UPSC Mains {topic_code} Essay #{idx + 1}] "
            f"Discuss in 250 words: {long} "
            f"Critically examine the contemporary relevance of {concept}."
        ),
        "choices": ["See rubric for evaluation criteria."],
        "correct_idx": 0,
        "payload": {
            "expected_word_count_range": [200, 300],
            "model_answer_outline": [
                "Introduction defining " + concept,
                "Historical context",
                "Current relevance with two examples",
                "Conclusion balancing critique with value",
            ],
            "rubric": [
                {"criterion": "structure",         "weight": 20, "description": "Intro / body / conclusion structure."},
                {"criterion": "factual_grounding", "weight": 30, "description": "Cites at least 2 supporting facts."},
                {"criterion": "analytical_depth",  "weight": 30, "description": "Goes beyond description to analysis."},
                {"criterion": "language",          "weight": 20, "description": "Clarity, grammar, register."},
            ],
        },
    }


def _gen_descriptive_long(idx: int, topic_code: str, concept: str, _fact: str, long: str, _distractors: list[str]) -> dict[str, Any]:
    return {
        "stem": (
            f"[UPSC Mains {topic_code} Long #{idx + 1}] "
            f"In approximately 1000-1500 words, examine: {long} "
            f"Substantiate with evidence and counter-arguments."
        ),
        "choices": ["See rubric for evaluation criteria."],
        "correct_idx": 0,
        "payload": {
            "expected_word_count_range": [800, 1500],
            "model_answer_outline": [
                f"Introduction — context of {concept}",
                "Historical background and evolution",
                "Major arguments in favour",
                "Critiques and counter-arguments",
                "Comparative international perspective",
                "Way forward",
            ],
            "rubric": [
                {"criterion": "depth_of_analysis", "weight": 35, "description": "Depth and originality of analysis."},
                {"criterion": "balance",            "weight": 25, "description": "Balance between affirmative and critical view."},
                {"criterion": "evidence",           "weight": 25, "description": "Use of facts, judgments, examples."},
                {"criterion": "structure_language", "weight": 15, "description": "Structure, clarity, grammar."},
            ],
        },
    }


def _gen_case_study(idx: int, topic_code: str, concept: str, _fact: str, _long: str, _distractors: list[str]) -> dict[str, Any]:
    return {
        "stem": (
            f"[UPSC GS-IV Ethics {topic_code} Case #{idx + 1}] "
            f"You are a District Magistrate in a backward district. "
            f"A long-pending project related to {concept} is finally cleared. "
            f"However, you discover that powerful local groups are pressuring "
            f"junior officials to manipulate beneficiary lists. Some district "
            f"officials may have already accepted hospitality from these groups. "
            f"\n\n(a) Identify the ethical issues in this case (~150 words)."
            f"\n(b) Outline the options available to you and your preferred "
            f"course of action with reasons (~250 words)."
            f"\n(c) Discuss what systemic measures could prevent recurrence (~150 words)."
        ),
        "choices": ["See rubric for evaluation criteria."],
        "correct_idx": 0,
        "payload": {
            "case_facts": f"Long-pending {concept}-related project; pressure from local groups; junior officials at risk.",
            "sub_questions": [
                {"id": "a", "prompt": "Identify the ethical issues.", "expected_word_count_range": [120, 200]},
                {"id": "b", "prompt": "Options and preferred course.", "expected_word_count_range": [200, 300]},
                {"id": "c", "prompt": "Systemic measures.",            "expected_word_count_range": [120, 200]},
            ],
            "rubric": [
                {"criterion": "ethical_clarity", "weight": 30, "description": "Names ethical issues correctly."},
                {"criterion": "decision_quality","weight": 35, "description": "Course of action defensible and lawful."},
                {"criterion": "systemic_view",   "weight": 20, "description": "Goes beyond the immediate to systemic measures."},
                {"criterion": "language",        "weight": 15, "description": "Clarity, grammar, register."},
            ],
        },
    }


def _gen_comprehension(idx: int, topic_code: str, concept: str, _fact: str, long: str, _distractors: list[str]) -> dict[str, Any]:
    passage = (
        f"{long} The interpretation of {concept} has evolved over decades. "
        f"Critics argue that its scope is too narrow; proponents counter that "
        f"a broader reading would invite judicial overreach. Recent judgments "
        f"have leaned towards a purposive interpretation, though commentators "
        f"differ on whether this strengthens or undermines constitutional "
        f"discipline."
    )
    return {
        "stem": (
            f"[UPSC CSAT {topic_code} RC #{idx + 1}] Read the passage and answer:\n\n{passage}\n\n"
            f"(1) State the central argument of the passage in 50 words.\n"
            f"(2) What do critics and proponents argue?\n"
            f"(3) Which interpretive approach is implied to be dominant?"
        ),
        "choices": ["See rubric for evaluation criteria."],
        "correct_idx": 0,
        "payload": {
            "passage": passage,
            "sub_questions": [
                {"id": "1", "prompt": "Central argument (≤50 words)."},
                {"id": "2", "prompt": "Critics' vs proponents' position."},
                {"id": "3", "prompt": "Dominant interpretive approach."},
            ],
            "rubric": [
                {"criterion": "comprehension", "weight": 60, "description": "Captures author's argument accurately."},
                {"criterion": "concision",     "weight": 25, "description": "Within word limits."},
                {"criterion": "language",      "weight": 15, "description": "Clarity, grammar."},
            ],
        },
    }


def _gen_diagram_hotspot(idx: int, topic_code: str, concept: str, _fact: str, _long: str, _distractors: list[str]) -> dict[str, Any]:
    return {
        "stem": f"[UPSC {topic_code} Map #{idx + 1}] On the India outline map, click on the location associated with '{concept}'.",
        "choices": ["See diagram canvas."],
        "correct_idx": 0,
        "payload": {
            "image_url": f"/seed-media/upsc-india-outline-{topic_code.lower()}-{idx % 10}.svg",
            "shapes": [
                {"id": "target", "kind": "circle", "cx": 300 + (idx % 10) * 5, "cy": 250 + (idx % 7) * 4, "radius": 28},
            ],
            "tolerance_px": 30,
            "concept": concept,
        },
    }


def _gen_diagram_label(idx: int, topic_code: str, _concept: str, _fact: str, _long: str, _distractors: list[str]) -> dict[str, Any]:
    return {
        "stem": f"[UPSC {topic_code} Diagram #{idx + 1}] Drag each label to its correct location on the diagram.",
        "choices": ["See diagram canvas."],
        "correct_idx": 0,
        "payload": {
            "image_url": f"/seed-media/upsc-{topic_code.lower()}-diagram-{idx % 10}.svg",
            "markers": [
                {"id": "m1", "x": 120, "y": 80,  "label": "Northern boundary"},
                {"id": "m2", "x": 200, "y": 220, "label": "Central plateau"},
                {"id": "m3", "x": 320, "y": 360, "label": "Southern coast"},
            ],
            "tolerance_px": 25,
        },
    }


def _gen_map_location(idx: int, topic_code: str, concept: str, _fact: str, _long: str, _distractors: list[str]) -> dict[str, Any]:
    # Geographic coordinates for some Indian landmarks (rough).
    pool = [
        ("Delhi",       28.61, 77.21),
        ("Mumbai",      19.08, 72.88),
        ("Kolkata",     22.57, 88.36),
        ("Chennai",     13.08, 80.27),
        ("Bengaluru",   12.97, 77.59),
        ("Lucknow",     26.85, 80.95),
        ("Jaipur",      26.91, 75.79),
        ("Bhubaneswar", 20.30, 85.82),
    ]
    name, lat, lng = pool[idx % len(pool)]
    return {
        "stem": f"[UPSC {topic_code} Map #{idx + 1}] Locate '{name}' on the map of India ({concept}).",
        "choices": [f"{name} ({lat:.2f}°N, {lng:.2f}°E)"],
        "correct_idx": 0,
        "payload": {
            "target_lat": lat,
            "target_lng": lng,
            "tolerance_deg": 0.5,
            "label": name,
        },
    }


def _gen_pictorial(idx: int, topic_code: str, concept: str, _fact: str, _long: str, distractors: list[str]) -> dict[str, Any]:
    choices = [concept] + distractors[:3]
    return {
        "stem": f"[UPSC {topic_code} Image #{idx + 1}] Identify the personality / monument / artefact shown in the image.",
        "choices": choices,
        "correct_idx": 0,
        "payload": {
            "image_url": f"/seed-media/upsc-{topic_code.lower()}-pic-{idx % 10}.jpg",
            "options": [{"id": chr(65 + i), "text": c} for i, c in enumerate(choices)],
            "correct_id": "A",
        },
    }


_GENERATORS: dict[str, Any] = {
    "MCQ_SINGLE":            _gen_mcq_single,
    "MCQ_MULTI":             _gen_mcq_multi,
    "TRUE_FALSE":            _gen_true_false,
    "ASSERTION_REASON":      _gen_assertion_reason,
    "MULTI_STATEMENT":       _gen_multi_statement,
    "NUMERIC_INTEGER":       _gen_numeric_integer,
    "NUMERIC_DECIMAL":       _gen_numeric_decimal,
    "NUMERIC_RANGE":         _gen_numeric_range,
    "FORMULA_INPUT":         _gen_formula_input,
    "MATCH_THE_FOLLOWING":   _gen_match_following,
    "SEQUENCING":            _gen_sequencing,
    "CLASSIFICATION":        _gen_classification,
    "FILL_BLANK_SINGLE":     _gen_fill_blank_single,
    "FILL_BLANK_MULTI":      _gen_fill_blank_multi,
    "CLOZE_PASSAGE":         _gen_cloze,
    "SHORT_TEXT":            _gen_short_text,
    "ESSAY":                 _gen_essay,
    "DESCRIPTIVE_LONG":      _gen_descriptive_long,
    "CASE_STUDY":            _gen_case_study,
    "COMPREHENSION_LONG":    _gen_comprehension,
    "DIAGRAM_HOTSPOT":       _gen_diagram_hotspot,
    "DIAGRAM_LABEL":         _gen_diagram_label,
    "MAP_LOCATION":          _gen_map_location,
    "PICTORIAL_IDENTIFY":    _gen_pictorial,
}


def all_questions() -> list[dict[str, Any]]:
    """Yield 100 questions for each of the 24 active types, distributed
    round-robin across the six UPSC topics. Each entry carries the
    fields needed to insert into content_schema.questions:

      type_id, topic_id, idx, stem, choices (list[str]), correct_idx,
      difficulty_b, payload (dict | None).
    """
    out: list[dict[str, Any]] = []
    for type_id in ACTIVE_TYPES:
        gen = _GENERATORS[type_id]
        for idx in range(QUESTIONS_PER_TYPE):
            topic_id, topic_code = _topic_for(idx)
            concept, fact, long, distractors = _bank_entry(topic_code, idx)
            base = gen(idx, topic_code, concept, fact, long, distractors)
            out.append(
                {
                    "type_id": type_id,
                    "topic_id": topic_id,
                    "idx": idx,
                    "stem": base["stem"],
                    "choices": base["choices"],
                    "correct_idx": base["correct_idx"],
                    "difficulty_b": _difficulty(idx),
                    "payload": base["payload"],
                }
            )
    return out


if __name__ == "__main__":  # pragma: no cover
    rows = all_questions()
    print(f"Generated {len(rows)} questions across {len(ACTIVE_TYPES)} types.")
    by_type: dict[str, int] = {}
    for r in rows:
        by_type[r["type_id"]] = by_type.get(r["type_id"], 0) + 1
    for t in ACTIVE_TYPES:
        print(f"  {t:<22} {by_type.get(t, 0)}")
