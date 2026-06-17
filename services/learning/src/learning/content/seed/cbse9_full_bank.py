"""CBSE Class 9 — full-syllabus concept bank for end-to-end testing.

The user wants ~100 PUBLISHED questions per chapter across every Class
9 subject so they can exercise the full app (browse → start →
adaptive → mock → analytics) without running out of content. Hand-
authoring 8,000+ unique MCQs is months of work; this module instead
gives every chapter a small concept set + 6 templates and a
deterministic generator that produces 100 MCQs per chapter.

Each chapter's concept entries are tuples of:
    (name, definition, [examples...], [counter-examples / distractors...])

The generator (see ``generate_for_topic``) produces:
    • 1 definition MCQ per concept
    • 1 recognition (positive example) MCQ per concept × example
    • 1 counter (negative example) MCQ per concept
    • 1 property MCQ per concept (rephrased definition as a true claim)
    • 1 disambiguation MCQ per concept pair
    • 1 association MCQ per concept

Total per chapter ≈ 100 from 5–7 concepts. Difficulty rotates over
[-1.5, -0.5, 0, 0.5, 1.5] so the IRT engine has a useful spread.

Topic codes match catalog migrations 017 / 019 / 020.
"""

from __future__ import annotations

import hashlib
from typing import NamedTuple


class Concept(NamedTuple):
    """A single concept within a chapter. Compact, hand-authorable.

    `examples` provides positive instances (used in recognition tests).
    `distractors` provides plausible-but-wrong items (used as wrong
    options in MCQs and as negative examples in counter tests).
    """
    name: str
    definition: str
    examples: tuple[str, ...]
    distractors: tuple[str, ...]


# ─── Generic distractor pool — used when a concept's own distractor
# list is exhausted. Picked to be plausibly-wrong without being
# obviously off-topic. The generator hashes the question idx into
# this pool to vary distractors across questions deterministically.
_GLOBAL_DISTRACTORS: tuple[str, ...] = (
    "An unrelated concept",
    "A historical artefact",
    "A geographical feature",
    "A measurement tool",
    "A literary device",
    "A mathematical fallacy",
    "A linguistic exception",
    "A scientific anomaly",
    "An unrelated definition",
    "A common misconception",
    "An unrelated theorem",
    "A discarded hypothesis",
    "A coincidental association",
    "A different framework",
    "A contradicting principle",
)


# ─── CONCEPT BANK — keyed by topic_code from catalog migrations ─────
# Per-chapter terseness over per-question quality is intentional: the
# goal is testing-grade volume across all 75+ Class 9 chapters.

CONCEPTS: dict[str, list[Concept]] = {
    # ============================================================
    # Class 9 — Maths (12 chapters)
    # ============================================================
    "C9_NUM": [
        Concept("Rational number",
                "A number expressible as p/q where p, q are integers and q ≠ 0.",
                ("3/4", "−7/2", "0.333…", "5"),
                ("Imaginary unit i", "A vector", "An angle", "A matrix")),
        Concept("Irrational number",
                "A real number that cannot be written as p/q with integer p, q.",
                ("√2", "π", "e", "√3"),
                ("4/9", "0.5", "−2", "1.25")),
        Concept("Real number",
                "Any number on the number line, rational or irrational.",
                ("1", "−2.5", "√5", "π"),
                ("3i", "An ordered pair", "A complex root only", "A boolean")),
        Concept("Surd",
                "An irrational root expression like √n, where n is not a perfect square.",
                ("√7", "√11", "∛20", "√50"),
                ("√4", "√9", "√25", "An integer")),
        Concept("Laws of exponents",
                "Rules describing how exponents combine: aᵐ · aⁿ = aᵐ⁺ⁿ etc.",
                ("a³·a²=a⁵", "(2³)²=2⁶", "5⁰=1", "a⁻¹=1/a"),
                ("aᵐ+aⁿ=aᵐ⁺ⁿ", "(a+b)²=a²+b²", "Wrong distribution", "False identity")),
    ],
    "C9_POLY": [
        Concept("Polynomial",
                "An algebraic expression of non-negative integer powers of a variable.",
                ("x²+3x+1", "5", "2x", "x³"),
                ("1/x+1", "√x", "x^(1/2)", "sin x")),
        Concept("Degree of a polynomial",
                "The highest power of the variable in a polynomial.",
                ("x³+2 has degree 3", "Constant has degree 0", "5x has degree 1", "x⁴ has degree 4"),
                ("Number of terms", "Coefficient sum", "Constant term", "Number of zeros")),
        Concept("Factor theorem",
                "(x − a) is a factor of p(x) iff p(a) = 0.",
                ("x²−1 has factor (x−1)", "x²+x has factor x", "x³−8 has factor (x−2)", "x²+2x has factor x"),
                ("Always true", "Only for quadratics", "Requires real roots", "Needs derivative")),
        Concept("Identity (a+b)²",
                "Expansion: (a+b)² = a² + 2ab + b².",
                ("(x+1)² = x²+2x+1", "(2+y)² = 4+4y+y²", "(x+y)² = x²+2xy+y²", "(p+1)² = p²+2p+1"),
                ("Equals a²+b²", "Equals a²−2ab+b²", "Sum of cubes", "Linear identity")),
        Concept("Identity a²−b²",
                "Difference of squares: a² − b² = (a+b)(a−b).",
                ("x²−4=(x+2)(x−2)", "9−y²=(3+y)(3−y)", "x²−1=(x+1)(x−1)", "16−p²=(4+p)(4−p)"),
                ("(a−b)²", "a²+b²", "Sum of cubes", "Doesn't factorise over reals")),
    ],
    "C9_TRI": [
        Concept("Congruent triangles",
                "Two triangles with the same shape and size; sides + angles all equal.",
                ("SSS", "SAS", "ASA", "RHS"),
                ("AAA only", "Different angles", "Different sides", "Mirror but unequal")),
        Concept("Isosceles triangle",
                "A triangle with two equal sides and equal base angles.",
                ("Two equal sides", "Two equal angles", "Equilateral as special case", "Symmetric"),
                ("All sides different", "Right angle required", "All angles 60°", "No equal sides")),
        Concept("Pythagoras' theorem",
                "In a right triangle, hypotenuse² = leg₁² + leg₂².",
                ("3-4-5", "5-12-13", "8-15-17", "7-24-25"),
                ("Sine rule", "Cosine rule", "Heron's formula", "Trig identity")),
        Concept("Triangle inequality",
                "Sum of any two sides of a triangle is greater than the third side.",
                ("3+4>5", "5+12>13", "Sides 2,3,4 valid", "Sides 7,8,12 valid"),
                ("Sides 1,1,5 valid", "Always equal", "Independent of sides", "Reverse holds")),
        Concept("Median of triangle",
                "Line from a vertex to the midpoint of the opposite side.",
                ("Three medians per triangle", "Meet at centroid", "Centroid divides 2:1", "Always inside triangle"),
                ("Always perpendicular", "Equal to altitude", "Bisects the angle", "Lies outside triangle")),
    ],
    "C9M_COORD": [
        Concept("Cartesian plane",
                "A 2D plane with two perpendicular axes (x, y) intersecting at origin.",
                ("(0,0) is origin", "(3,2) in Q1", "(-2,1) in Q2", "(0,5) on y-axis"),
                ("Single axis", "Polar plane", "3D space", "Random points")),
        Concept("Quadrants",
                "Four regions of the Cartesian plane: I (+,+), II (-,+), III (-,-), IV (+,-).",
                ("(2,3) in Q1", "(-1,4) in Q2", "(-3,-5) in Q3", "(4,-2) in Q4"),
                ("All same sign", "Origin is a quadrant", "Five regions", "Three regions only")),
        Concept("Abscissa and ordinate",
                "Abscissa = x-coordinate; ordinate = y-coordinate.",
                ("In (3,5), abscissa = 3", "In (3,5), ordinate = 5", "Y-coord on y-axis", "X-coord on x-axis"),
                ("Reversed meaning", "Both same", "Tangent values", "Polar radii")),
        Concept("Axes",
                "X-axis is horizontal; y-axis is vertical; meet at origin (0,0).",
                ("Equation y=0 is x-axis", "Equation x=0 is y-axis", "Origin has zero coordinates", "Perpendicular"),
                ("Always parallel", "Random angle", "Same line", "Curved axes")),
    ],
    "C9M_LIN2": [
        Concept("Linear equation in 2 variables",
                "Equation of form ax + by + c = 0, where a, b are not both zero.",
                ("x + y = 5", "2x − 3y = 6", "y = 4", "x + 0·y = 1"),
                ("x² + y = 0", "xy = 5", "Cubic equation", "sin x + y = 0")),
        Concept("Solution of linear equation",
                "An ordered pair (x, y) that satisfies the equation.",
                ("(2,3) for x+y=5", "(0,5) for x+y=5", "(1,1) for x+y=2", "(3,2) for x+y=5"),
                ("Single number", "Function pointer", "Vector field", "Random pair")),
        Concept("Graph of linear equation",
                "The set of all solutions plotted is a straight line.",
                ("y = x is a straight line", "x + y = 0 passes origin", "Always linear", "Has slope and intercept"),
                ("Always parabolic", "Random shape", "Circular", "Discrete points only")),
        Concept("Equation of axes",
                "x-axis: y = 0; y-axis: x = 0.",
                ("y=0 ↔ x-axis", "x=0 ↔ y-axis", "Both pass origin", "Perpendicular lines"),
                ("Both same equation", "Diagonal", "Curved", "Random")),
    ],
    "C9M_EUCL": [
        Concept("Axiom",
                "A statement accepted as true without proof, used as a basis for reasoning.",
                ("Equals added to equals are equal", "Whole > part", "Things equal to same thing are equal", "Existence postulates"),
                ("A theorem", "A proof", "An example", "A guess")),
        Concept("Theorem",
                "A statement proven true using axioms and previously-proven theorems.",
                ("Pythagoras' theorem", "Triangle angle sum = 180°", "Vertically opposite angles", "Mid-point theorem"),
                ("An axiom", "An untested guess", "A definition only", "A postulate")),
        Concept("Postulate",
                "A statement assumed true within a specific system of geometry.",
                ("Euclid's 5 postulates", "Two points determine a line", "Right angles are equal", "Through a point not on a line, exactly one parallel"),
                ("A counterexample", "A theorem", "A computation", "A formula")),
        Concept("Proof",
                "Logical sequence of steps demonstrating a theorem from axioms.",
                ("Direct proof", "Proof by contradiction", "Mathematical induction", "Geometric construction"),
                ("A guess", "A diagram", "A definition", "A postulate restatement")),
    ],
    "C9M_LA": [
        Concept("Adjacent angles",
                "Two angles sharing a common arm and vertex.",
                ("90° + 90° around a corner", "Two angles at a junction", "Common ray + vertex", "Side by side"),
                ("Vertically opposite", "Random pair", "Far apart", "Different vertex")),
        Concept("Linear pair",
                "Two adjacent angles whose non-common arms form a straight line; sum = 180°.",
                ("60°+120°", "90°+90°", "75°+105°", "45°+135°"),
                ("Sum 90°", "Sum 360°", "Always equal", "Sum 270°")),
        Concept("Vertically opposite angles",
                "Two angles formed when two lines intersect; vertically opposite are equal.",
                ("Equal pair across intersection", "Always equal", "Sum 360° around point", "Linear pairs are supplementary"),
                ("Sum 180° (linear pair)", "Sum 90°", "Always different", "Random")),
        Concept("Parallel lines",
                "Two lines in the same plane that never meet.",
                ("Train tracks", "Sides of rectangle", "Always equidistant", "No intersection"),
                ("Concurrent lines", "Intersecting lines", "Skew lines", "Curved lines")),
        Concept("Angle sum of triangle",
                "Sum of interior angles of any triangle = 180°.",
                ("60°+60°+60°", "90°+45°+45°", "30°+60°+90°", "Always 180°"),
                ("Sum 360°", "Sum 90°", "Sum 270°", "Varies by size")),
    ],
    "C9M_QUAD": [
        Concept("Quadrilateral",
                "A polygon with four sides, four vertices, four angles.",
                ("Square", "Rectangle", "Rhombus", "Trapezium"),
                ("Triangle", "Pentagon", "Circle", "Hexagon")),
        Concept("Parallelogram",
                "A quadrilateral with both pairs of opposite sides parallel.",
                ("Opposite sides equal", "Diagonals bisect each other", "Opposite angles equal", "Sum of adjacent angles 180°"),
                ("All sides equal (rhombus only)", "All angles 90° (rectangle only)", "Diagonals perpendicular", "Random")),
        Concept("Rhombus",
                "A parallelogram with all four sides equal.",
                ("All sides equal", "Diagonals bisect each other at right angles", "Parallelogram property", "Symmetry"),
                ("Right angles required", "Sides unequal", "Trapezium", "Kite without parallels")),
        Concept("Trapezium",
                "A quadrilateral with exactly one pair of parallel sides.",
                ("Two parallel sides", "Non-parallel sides may be equal (isosceles)", "One pair parallel only", "Common in geometry"),
                ("Both pairs parallel (parallelogram)", "All sides equal", "All angles 90°", "Random")),
        Concept("Mid-point theorem",
                "The line segment joining mid-points of two sides of a triangle is parallel to and half the third side.",
                ("Half the length", "Parallel to third side", "Joins midpoints", "Useful construction"),
                ("Twice the length", "Perpendicular", "Random direction", "Cuts third side")),
    ],
    "C9M_CIRC": [
        Concept("Circle",
                "Set of all points in a plane at a fixed distance (radius) from a fixed point (centre).",
                ("Round shape", "Locus", "Radius constant", "Constant distance from centre"),
                ("Ellipse", "Polygon", "Spiral", "Open curve")),
        Concept("Chord",
                "A line segment whose endpoints lie on the circle.",
                ("Connects two points on circle", "Diameter is longest chord", "Through interior", "Two endpoints on boundary"),
                ("Tangent (one point)", "Secant (line, not segment)", "Outside circle", "Random line")),
        Concept("Diameter",
                "A chord passing through the centre; longest chord of a circle.",
                ("Twice the radius", "Through centre", "Longest chord", "Bisects circle"),
                ("Half the radius", "Random chord", "Tangent", "Outside circle")),
        Concept("Arc",
                "A continuous portion of the circumference.",
                ("Minor arc", "Major arc", "Semi-circle is half-arc", "Subtends angle at centre"),
                ("Straight line", "Chord", "Radius", "Diameter")),
        Concept("Cyclic quadrilateral",
                "A quadrilateral whose all four vertices lie on a circle.",
                ("Opposite angles supplementary", "All vertices on circle", "Sum of opposite angles 180°", "Inscribed in circle"),
                ("Opposite angles equal", "Sum 360° (always true for any quad)", "Random property", "Just a square")),
    ],
    "C9M_HER": [
        Concept("Heron's formula",
                "Triangle area = √[s(s−a)(s−b)(s−c)], where s = (a+b+c)/2.",
                ("Sides 3,4,5 → area 6", "Uses sides only", "No height needed", "Equilateral 6 → area = 9√3"),
                ("Needs height", "Half base × height (also valid but different)", "Wrong formula", "Pythagoras")),
        Concept("Semi-perimeter",
                "Half the perimeter of a polygon, used in Heron's formula.",
                ("s = (a+b+c)/2", "Half of perimeter", "Used as parameter", "Always positive"),
                ("Equal to perimeter", "Sum of sides", "Random value", "Negative")),
        Concept("Equilateral triangle area",
                "Area = (√3/4) · a², where a is the side length.",
                ("a=2 → √3", "a=4 → 4√3", "Equal sides", "All angles 60°"),
                ("Half base × height (general formula but different form)", "πr²", "Square area formula", "Wrong constant")),
    ],
    "C9M_SAV": [
        Concept("Cuboid",
                "A 3D solid with six rectangular faces, twelve edges, eight vertices.",
                ("Volume = l·b·h", "Surface area = 2(lb+bh+hl)", "Box shape", "Rectangular faces"),
                ("Sphere", "Cylinder", "Cube only", "Pyramid")),
        Concept("Cube",
                "A cuboid with all sides equal.",
                ("Volume = a³", "Surface area = 6a²", "All edges equal", "All faces squares"),
                ("Sphere", "Cuboid (general)", "Cone", "Pyramid")),
        Concept("Cylinder (right circular)",
                "A 3D solid with two parallel circular bases.",
                ("Volume = πr²h", "Curved SA = 2πrh", "Total SA = 2πr(r+h)", "Circular cross-section"),
                ("Sphere formula", "Cone formula", "Pyramid formula", "Cube formula")),
        Concept("Cone (right circular)",
                "A 3D solid with a circular base and a single apex.",
                ("Volume = (1/3)πr²h", "Curved SA = πrl", "Total SA = πr(r+l)", "Apex over centre"),
                ("Cylinder formula", "Sphere formula", "Cuboid formula", "Wrong constant")),
        Concept("Sphere",
                "Set of all points in 3D space equidistant from a fixed centre.",
                ("Volume = (4/3)πr³", "Surface area = 4πr²", "All points equidistant", "Round in 3D"),
                ("Circle (2D)", "Disc", "Cylinder", "Cone")),
    ],
    "C9M_STAT": [
        Concept("Mean",
                "Sum of observations divided by their count.",
                ("Mean of 2,4,6 = 4", "Average value", "Sensitive to outliers", "Used in central tendency"),
                ("Median", "Mode", "Range", "Variance")),
        Concept("Median",
                "Middle value when observations are arranged in order.",
                ("For odd n: middle value", "For even n: average of two middle", "Less affected by outliers", "Splits data 50:50"),
                ("Mean", "Mode", "Maximum", "Minimum")),
        Concept("Mode",
                "The most frequently occurring observation.",
                ("Mode of 2,3,3,5 = 3", "May not exist", "Multiple modes possible", "Categorical use"),
                ("Mean", "Median", "Range", "Last value")),
        Concept("Range",
                "Difference between maximum and minimum values.",
                ("Range of 1..10 = 9", "Simple measure of spread", "Always non-negative", "Sensitive to outliers"),
                ("Variance", "Mean", "Median", "Mode")),
        Concept("Frequency distribution",
                "Tabular summary of how often each value or class occurs.",
                ("Class intervals", "Frequencies summed = total observations", "Used for histograms", "Continuous and discrete"),
                ("Single number", "Random listing", "Always sorted", "Normal distribution only")),
    ],

    # ============================================================
    # Class 9 — Science (12 chapters)
    # ============================================================
    "C9_MATTER": [
        Concept("Matter",
                "Anything that has mass and occupies space.",
                ("Solid", "Liquid", "Gas", "Plasma"),
                ("Light", "Heat", "Sound", "Vacuum")),
        Concept("States of matter",
                "Solid, liquid, gas — distinguished by particle spacing and motion.",
                ("Ice (solid)", "Water (liquid)", "Steam (gas)", "Fixed shape vs flow"),
                ("Idea", "Time", "Charge", "Field")),
        Concept("Diffusion",
                "Spontaneous movement of particles from high to low concentration.",
                ("Perfume spreading", "Gas in room", "Faster in gases", "Mixing of liquids over time"),
                ("Filtration", "Crystallisation", "Centrifugation", "Distillation")),
        Concept("Sublimation",
                "Direct change of solid to gas without becoming liquid.",
                ("Iodine", "Camphor", "Naphthalene", "Dry ice"),
                ("Boiling", "Melting", "Freezing", "Condensation")),
        Concept("Latent heat",
                "Heat absorbed or released during a phase change without temperature change.",
                ("Latent heat of fusion (ice→water)", "Latent heat of vaporisation (water→steam)", "Constant T during phase change", "Hidden heat"),
                ("Sensible heat", "Specific heat", "Friction heat", "Radiant heat")),
    ],
    "C9S_PURE": [
        Concept("Pure substance",
                "Substance composed of only one kind of particle (element or compound).",
                ("Distilled water", "Pure gold", "Hydrogen", "Sodium chloride"),
                ("Brass", "Sea water", "Air", "Soil")),
        Concept("Mixture",
                "Combination of two or more substances in any proportion.",
                ("Salt water (homogeneous)", "Sand + water (heterogeneous)", "Air", "Fruit salad"),
                ("Pure water", "Diamond", "Pure copper", "Element")),
        Concept("Solution",
                "A homogeneous mixture of a solute dissolved in a solvent.",
                ("Salt in water", "Sugar in water", "Brass (alloy)", "Air"),
                ("Sand in water", "Oil + water", "Insoluble mix", "Suspension")),
        Concept("Colloid",
                "Heterogeneous mixture where particles are intermediate in size; show Tyndall effect.",
                ("Milk", "Fog", "Smoke", "Whipped cream"),
                ("Pure water", "True solution", "Pure salt", "Distilled water")),
        Concept("Distillation",
                "Separation method using differences in boiling points.",
                ("Salt + water → distilled water", "Petroleum refining", "Boiling + condensing", "Volatile vs non-volatile"),
                ("Filtration", "Sedimentation", "Decantation", "Centrifugation")),
    ],
    "C9S_ATOM": [
        Concept("Atom",
                "Smallest particle of an element retaining its chemical identity.",
                ("Hydrogen atom", "Carbon atom", "Indivisible chemically", "Basic unit"),
                ("Molecule (2+ atoms)", "Mixture", "Compound", "Ion (charged)")),
        Concept("Molecule",
                "Group of two or more atoms chemically bonded.",
                ("H₂", "O₂", "H₂O", "CO₂"),
                ("Single atom", "Element only", "Mixture", "Ion only")),
        Concept("Mole",
                "Amount of substance containing 6.022 × 10²³ entities (Avogadro's number).",
                ("12 g of carbon = 1 mol", "1 mol of any gas at STP = 22.4 L", "Avogadro's number", "Counting unit"),
                ("Mass unit", "Volume only", "Random number", "Frequency")),
        Concept("Atomic mass unit",
                "1/12 the mass of a carbon-12 atom; symbol u.",
                ("H ≈ 1 u", "O ≈ 16 u", "C-12 = exactly 12 u", "Relative scale"),
                ("Kilogram", "Gram", "Pound", "Newton")),
        Concept("Law of conservation of mass",
                "Mass is neither created nor destroyed in a chemical reaction.",
                ("Reactants mass = products mass", "Lavoisier's law", "Universal in chemical reactions", "Foundation of stoichiometry"),
                ("Mass changes", "Energy law only", "Volume conserved", "False in nuclear reactions actually")),
    ],
    "C9S_STRUC": [
        Concept("Electron",
                "Negatively-charged subatomic particle.",
                ("Negative charge", "Light mass", "Discovered by J.J. Thomson", "Outside nucleus"),
                ("Proton (positive)", "Neutron (neutral)", "Photon", "Quark")),
        Concept("Proton",
                "Positively-charged subatomic particle in the nucleus.",
                ("Positive charge", "Mass ≈ 1 u", "In nucleus", "Determines atomic number"),
                ("Electron (negative)", "Neutron (neutral)", "Photon", "Antiparticle")),
        Concept("Neutron",
                "Electrically-neutral subatomic particle in the nucleus.",
                ("No charge", "Mass ≈ 1 u", "In nucleus", "Discovered by Chadwick"),
                ("Electron (negative)", "Proton (positive)", "Photon", "Has charge")),
        Concept("Atomic number",
                "Number of protons in an atom's nucleus; defines the element.",
                ("Hydrogen Z=1", "Oxygen Z=8", "Carbon Z=6", "Iron Z=26"),
                ("Mass number", "Total electrons + protons", "Random number", "Number of neutrons")),
        Concept("Mass number",
                "Total protons + neutrons in an atom's nucleus.",
                ("Carbon-12 has A=12", "Mass ≈ A in u", "A = Z + N", "Whole number"),
                ("Same as atomic number", "Number of electrons only", "Random", "Always = atomic number")),
        Concept("Isotopes",
                "Atoms of same element with different mass numbers.",
                ("¹H, ²H, ³H", "Carbon-12 vs Carbon-14", "Same Z, different A", "Same chemistry"),
                ("Different elements", "Different Z, same A (isobars)", "Random", "Same A and Z")),
    ],
    "C9S_CELL": [
        Concept("Cell",
                "Basic structural and functional unit of life.",
                ("Plant cells", "Animal cells", "Bacterial cells", "Single-celled organisms"),
                ("Atom", "Molecule", "Tissue (group of cells)", "Organism")),
        Concept("Cell theory",
                "All living things are made of cells; cell is the unit of life; cells come from cells.",
                ("Schleiden + Schwann", "Virchow's addition", "Foundational in biology", "Universal"),
                ("Atomic theory", "Germ theory only", "Endosymbiotic theory only", "Big bang")),
        Concept("Plasma membrane",
                "Selectively permeable boundary of a cell.",
                ("Phospholipid bilayer", "Selectively permeable", "Controls entry/exit", "Around all cells"),
                ("Cell wall (rigid, plants only)", "Nuclear membrane", "Mitochondrial membrane", "Capsule")),
        Concept("Cell wall",
                "Rigid outer covering of plant cells (and bacteria, fungi).",
                ("Made of cellulose in plants", "Provides shape", "Protects cell", "Plants, fungi, bacteria"),
                ("Animal cells (no wall)", "Made of fat", "Selectively permeable", "Fluid")),
        Concept("Nucleus",
                "Membrane-bound organelle containing DNA; control centre of the cell.",
                ("Holds chromatin", "Controls cell activities", "Discovered by Robert Brown", "Eukaryotic feature"),
                ("Mitochondrion", "Lysosome", "Ribosome", "Vacuole")),
        Concept("Mitochondrion",
                "Powerhouse of the cell; produces ATP via cellular respiration.",
                ("ATP production", "Double membrane", "Has own DNA", "Cellular respiration"),
                ("Photosynthesis (chloroplast)", "Protein synthesis (ribosome)", "Storage (vacuole)", "Cell wall")),
    ],
    "C9S_TIS": [
        Concept("Meristematic tissue",
                "Plant tissue capable of continuous division and growth.",
                ("Apical meristem (tip growth)", "Lateral meristem (girth)", "Intercalary meristem", "Active division"),
                ("Permanent tissue (no division)", "Animal tissue", "Xylem mature cells", "Phloem mature cells")),
        Concept("Xylem",
                "Plant vascular tissue that transports water + minerals upward.",
                ("Tracheids", "Vessels", "Dead at maturity", "Upward transport"),
                ("Phloem (food, downward)", "Cambium", "Cortex", "Epidermis only")),
        Concept("Phloem",
                "Plant vascular tissue that transports food (sugars) bidirectionally.",
                ("Sieve tubes", "Companion cells", "Living at maturity", "Translocation"),
                ("Xylem (water)", "Cambium only", "Bark only", "Roots only")),
        Concept("Epithelial tissue",
                "Animal tissue that covers body surfaces and lines cavities.",
                ("Skin epidermis", "Lining of blood vessels", "Tightly packed cells", "Protective barrier"),
                ("Connective tissue", "Muscle tissue", "Nervous tissue", "Plant tissue")),
        Concept("Connective tissue",
                "Animal tissue connecting and supporting body parts; cells in matrix.",
                ("Bone", "Cartilage", "Blood", "Adipose tissue"),
                ("Epithelial (sheets)", "Muscle (contractile)", "Nervous (signalling)", "Plant tissue")),
        Concept("Muscle tissue",
                "Animal tissue specialised for contraction.",
                ("Skeletal muscle", "Cardiac muscle", "Smooth muscle", "Voluntary vs involuntary"),
                ("Bone (connective)", "Skin (epithelial)", "Plant tissue", "Phloem")),
        Concept("Nervous tissue",
                "Animal tissue specialised for transmitting electrical signals.",
                ("Neurons", "Brain tissue", "Spinal cord", "Reflex arc"),
                ("Muscle (contractile)", "Bone (support)", "Skin (covering)", "Xylem")),
    ],
    "C9_MOTION": [
        Concept("Distance",
                "Total path length traversed by an object; scalar.",
                ("10 m walked back and forth = 10 m", "Always positive", "No direction", "Scalar quantity"),
                ("Displacement (vector)", "Velocity", "Acceleration", "Force")),
        Concept("Displacement",
                "Shortest straight-line distance from start to end with direction; vector.",
                ("0 if return to start", "Vector quantity", "Has direction", "Length of arrow start→end"),
                ("Distance (scalar)", "Speed", "Time", "Mass")),
        Concept("Speed",
                "Rate of change of distance with time; scalar.",
                ("v = d/t", "m/s, km/h", "Scalar", "Always positive"),
                ("Velocity (vector)", "Acceleration", "Force", "Power")),
        Concept("Velocity",
                "Rate of change of displacement; vector.",
                ("v = s/t with direction", "m/s east", "Can be negative", "Vector quantity"),
                ("Speed (scalar)", "Distance only", "Time", "Mass")),
        Concept("Acceleration",
                "Rate of change of velocity; vector.",
                ("a = (v-u)/t", "m/s²", "Free fall ≈ 9.8 m/s²", "Negative = deceleration"),
                ("Velocity itself", "Distance covered", "Force/mass relation only", "Energy")),
        Concept("Equations of motion (uniform acceleration)",
                "v=u+at; s=ut+½at²; v²=u²+2as.",
                ("Three equations", "Constant acceleration", "Free fall", "Linear motion"),
                ("Apply to circular motion", "Apply when force changes randomly", "Always exact for any motion", "Wrong forms")),
    ],
    "C9S_FORCE": [
        Concept("Force",
                "An interaction that, when unbalanced, changes the motion of an object.",
                ("Push", "Pull", "Gravity", "Friction"),
                ("Energy", "Power", "Velocity", "Mass")),
        Concept("Newton's first law",
                "An object remains at rest or moves with uniform velocity unless acted on by an unbalanced force.",
                ("Law of inertia", "Seatbelt example", "Coin on card trick", "Object continues unless pushed"),
                ("F=ma", "Action-reaction", "Conservation of momentum", "Universal gravitation")),
        Concept("Newton's second law",
                "Force = mass × acceleration; F = ma.",
                ("F = ma", "Heavier object needs more force for same a", "1 N = 1 kg·m/s²", "Vector equation"),
                ("Inertia law", "Action-reaction", "Energy conservation", "Wrong proportionality")),
        Concept("Newton's third law",
                "For every action there is an equal and opposite reaction.",
                ("Walking (push ground)", "Rocket propulsion", "Recoil of gun", "Swimming"),
                ("Inertia", "F=ma", "Friction definition", "Centripetal")),
        Concept("Momentum",
                "Product of mass and velocity; vector quantity.",
                ("p = mv", "kg·m/s", "Conservation in collisions", "Vector"),
                ("Energy (scalar)", "Force × distance", "mass alone", "Velocity alone")),
        Concept("Inertia",
                "Tendency of an object to resist change in its state of motion.",
                ("More mass → more inertia", "Object at rest stays at rest", "Object in motion stays in motion", "Property of mass"),
                ("Force itself", "Acceleration only", "Velocity", "Energy")),
    ],
    "C9_GRAV": [
        Concept("Gravitation",
                "Universal attractive force between any two masses.",
                ("Earth-Moon", "Apple falling", "Tides", "Newton's universal law"),
                ("Magnetism", "Electric force only", "Friction", "Buoyancy alone")),
        Concept("Universal law of gravitation",
                "F = G·m₁·m₂/r²; G ≈ 6.67×10⁻¹¹ N·m²/kg².",
                ("Inverse square", "Attractive only", "Newton 1687", "Universal"),
                ("Direct square", "Repulsive in some cases", "Linear in distance", "Wrong constant")),
        Concept("Acceleration due to gravity (g)",
                "Acceleration caused by Earth's gravity; ≈ 9.8 m/s² at surface.",
                ("g ≈ 9.8 m/s²", "Decreases with altitude", "Same for all masses (free fall)", "Vector pointing down"),
                ("g = G", "g is mass", "g is constant everywhere in universe", "Wrong value")),
        Concept("Mass vs weight",
                "Mass: amount of matter (kg); Weight: gravitational force on mass (N), W = mg.",
                ("Mass invariant across planets", "Weight varies with g", "kg vs N", "W = mg"),
                ("Same thing", "Both vary similarly", "Mass changes with location", "Weight measured in kg")),
        Concept("Buoyancy / Archimedes' principle",
                "Object immersed in fluid experiences upthrust = weight of fluid displaced.",
                ("Boats float", "Hot air balloon", "Eureka story", "Upthrust = displaced fluid weight"),
                ("Random force", "Always sinks", "Independent of fluid", "Wrong equation")),
    ],
    "C9S_WE": [
        Concept("Work",
                "W = F·s·cosθ; force times displacement in direction of force.",
                ("Lifting a box", "Pushing block on floor", "Joules", "Scalar"),
                ("Force alone", "Distance alone", "Power", "Vector quantity")),
        Concept("Energy",
                "Capacity to do work; scalar; Joules.",
                ("Kinetic", "Potential", "Conservation of energy", "Different forms convertible"),
                ("Force × time only", "Mass × velocity", "Charge", "Random")),
        Concept("Kinetic energy",
                "Energy of motion; KE = ½mv².",
                ("KE = (1/2)mv²", "Moving car", "Doubled mass = 2× KE", "Doubled speed = 4× KE"),
                ("Mass alone", "PE = mgh", "Random expression", "Wrong proportional")),
        Concept("Potential energy (gravitational)",
                "Energy stored due to position; PE = mgh.",
                ("Book on shelf", "Water in dam", "Increases with height", "PE = mgh"),
                ("KE = ½mv²", "Friction", "Tension only", "Wrong formula")),
        Concept("Power",
                "Rate of doing work; P = W/t; Watts.",
                ("Watt = J/s", "P = W/t", "Horsepower", "Energy per second"),
                ("Energy itself", "Force × distance only", "Mass × velocity", "Random")),
    ],
    "C9S_SOUND": [
        Concept("Sound",
                "Mechanical longitudinal wave produced by vibrations propagating through a medium.",
                ("Vibration of vocal cords", "Travels in air", "Needs medium", "Compressions and rarefactions"),
                ("Light (EM wave)", "Heat (random kinetic)", "Travels in vacuum", "Transverse mechanical")),
        Concept("Frequency",
                "Number of vibrations per second; Hz.",
                ("Pitch depends on frequency", "Hertz (cycles/s)", "Higher = higher pitch", "Audible 20 Hz–20 kHz"),
                ("Wavelength alone", "Amplitude", "Speed", "Random")),
        Concept("Wavelength",
                "Distance between two consecutive crests or compressions.",
                ("λ measured in metres", "Inverse to frequency for fixed speed", "v = f·λ", "Spatial period"),
                ("Frequency", "Amplitude only", "Time period only", "Phase")),
        Concept("Speed of sound",
                "≈ 343 m/s in dry air at 20°C; faster in solids.",
                ("Faster in steel than air", "Slower in cold air", "Depends on medium", "v = f·λ"),
                ("Always 3×10⁸ m/s (light)", "Constant in all media", "Same as light speed", "Independent of medium")),
        Concept("Echo",
                "Reflected sound heard distinctly after reflection from a surface.",
                ("Reflection of sound", "Needs ≥17 m to reflector (in air)", "Distinct repetition", "Used in SONAR"),
                ("Refraction", "Diffraction only", "Same as original sound", "Always heard")),
        Concept("Ultrasound",
                "Sound waves above 20 kHz; inaudible to humans.",
                ("Bat navigation", "Medical imaging", "SONAR", "Industrial cleaning"),
                ("Audible range", "Light", "Below 20 Hz (infrasound)", "Random EM wave")),
    ],
    "C9S_FOOD": [
        Concept("Crop production",
                "Growing food plants for human + animal consumption.",
                ("Rice", "Wheat", "Maize", "Pulses"),
                ("Animal husbandry only", "Fish farming only", "Hunting", "Industrial production")),
        Concept("Manure vs fertiliser",
                "Manure: organic; Fertiliser: chemical compounds providing N, P, K.",
                ("Cow dung manure", "Urea fertiliser", "NPK", "Soil enrichment"),
                ("Same thing", "Always harmful", "Manure has high N only", "Fertiliser is organic")),
        Concept("Animal husbandry",
                "Scientific management of livestock for milk, meat, eggs, fibre.",
                ("Cattle", "Poultry", "Fish", "Bees (apiculture)"),
                ("Crop only", "Wild hunting", "Forestry only", "Industry")),
        Concept("Hybridisation",
                "Crossing two genetically different varieties to combine desirable traits.",
                ("HYV seeds", "Disease-resistant cattle", "Higher milk yield", "Selective breeding"),
                ("Cloning only", "Random mutation", "Single parent", "No genetic change")),
    ],

    # ============================================================
    # Class 9 — Social Science (20 chapters)
    # ============================================================
    "C9H_FRENCH": [
        Concept("French Revolution",
                "1789–1799 political upheaval in France that abolished monarchy.",
                ("Storming of the Bastille", "Estates-General convened", "Reign of Terror", "Declaration of Rights of Man"),
                ("Russian Revolution (1917)", "American Revolution (1776)", "Industrial Revolution", "Glorious Revolution")),
        Concept("Bastille",
                "Fortress-prison in Paris stormed on 14 July 1789 — symbolic start of Revolution.",
                ("Symbol of royal tyranny", "Stormed by Parisians", "14 July anniversary", "Triggered revolution"),
                ("A palace (Versailles)", "A church", "A treasury", "A library")),
        Concept("Estates-General",
                "Assembly representing the three estates (clergy, nobility, commoners) of France.",
                ("Convened 1789", "Voted by estate", "Third estate broke away", "Pre-revolution governance"),
                ("Single chamber", "Equal representation", "Modern parliament (post-revolution)", "Religious court")),
        Concept("Declaration of Rights of Man",
                "Foundational 1789 document proclaiming liberty, equality, fraternity.",
                ("Liberty", "Equality before law", "Fraternity", "Influenced UN Declaration"),
                ("Magna Carta (1215)", "Bill of Rights (US)", "Constitution alone", "Treaty")),
        Concept("Reign of Terror",
                "1793–94 period of mass executions under Robespierre.",
                ("Robespierre", "Guillotine", "Mass executions", "Internal purges"),
                ("Peaceful era", "Restoration", "Diplomatic period", "Industrial era")),
    ],
    "C9H_RUSSIA": [
        Concept("Russian Revolution",
                "1917 revolutions overthrowing Tsar and bringing Bolsheviks to power.",
                ("February + October revolutions", "Lenin", "Bolsheviks", "USSR formation"),
                ("French Revolution", "Chinese Revolution", "Industrial Revolution", "Indian Independence")),
        Concept("Bolsheviks",
                "Radical Marxist faction led by Lenin; took power in October 1917.",
                ("Led by Lenin", "Seized power 1917", "Communist faction", "Anti-monarchy"),
                ("Mensheviks (moderate)", "Tsarists", "Liberals", "Conservatives")),
        Concept("Lenin",
                "Leader of Bolsheviks; first head of Soviet government.",
                ("Bolshevik leader", "First Soviet head", "Author of theory", "Returned 1917"),
                ("Stalin (later)", "Trotsky", "Tsar Nicholas II", "Kerensky")),
        Concept("Tsar Nicholas II",
                "Last emperor of Russia; abdicated 1917; executed 1918.",
                ("Last Tsar", "Abdicated 1917", "Romanov dynasty", "Executed 1918"),
                ("Lenin", "Stalin", "Trotsky", "Kerensky")),
        Concept("Collectivisation",
                "State-led consolidation of small farms into collective ones under Stalin.",
                ("Stalin's policy", "1930s", "Forced peasants", "Caused famines"),
                ("Lenin's NEP (private)", "Free market", "Tsarist policy", "Capitalist")),
    ],
    "C9H_NAZI": [
        Concept("Nazism",
                "Extreme fascist ideology of Germany under Hitler (1933–45).",
                ("Aryan supremacy", "Anti-Semitism", "Totalitarianism", "Lebensraum"),
                ("Liberal democracy", "Communism", "Monarchy only", "Anarchism")),
        Concept("Hitler",
                "Leader of Nazi Germany 1933–1945.",
                ("Chancellor 1933", "Mein Kampf", "World War II", "Suicide 1945"),
                ("Stalin", "Lenin", "Mussolini (Italy)", "Churchill")),
        Concept("Weimar Republic",
                "Democratic German government 1919–1933, replaced by Nazi rule.",
                ("Post-WWI Germany", "Hyperinflation 1923", "Collapsed 1933", "Treaty of Versailles era"),
                ("Nazi era", "Imperial Germany", "East Germany", "Modern Germany")),
        Concept("Holocaust",
                "Systematic genocide of ~6 million Jews and others by Nazi regime.",
                ("Concentration camps", "Auschwitz", "Final Solution", "Six million Jews"),
                ("Pogrom only", "Random", "Recent event", "Single incident")),
        Concept("Treaty of Versailles",
                "1919 treaty ending WWI, blamed by Germans for harsh terms.",
                ("1919", "Ended WWI", "Reparations on Germany", "Article 231"),
                ("Treaty of Brest-Litovsk", "Locarno", "Munich Agreement", "Treaty of Paris (1763)")),
    ],
    "C9H_FOREST": [
        Concept("Scientific forestry",
                "Colonial-era systematic management of forests prioritising commercial timber.",
                ("Plantation of single species", "Reservation of forest", "Restriction on local use", "Brandis (India)"),
                ("Indigenous forestry", "Random felling", "No management", "Wildlife sanctuary only")),
        Concept("Indian Forest Act",
                "Series of colonial-era laws regulating forest use; 1878 + 1927.",
                ("1878 first major", "1927 amendment", "Restricted villager rights", "Reserved/protected/village forests"),
                ("Indian Penal Code", "Constitution", "RTI Act", "Wildlife Act 1972")),
        Concept("Bastar rebellion",
                "1910 uprising of Bastar tribals against colonial forest laws.",
                ("1910", "Tribal-led", "Against forest laws", "Bastar (Chhattisgarh)"),
                ("Munda rebellion (1899)", "Santhal rebellion (1855)", "Sepoy mutiny (1857)", "Quit India (1942)")),
        Concept("Shifting cultivation",
                "Slash-and-burn farming on small plots for short periods.",
                ("Jhum", "Tropical practice", "Short rotation", "Tribal practice"),
                ("Permanent agriculture", "Plantation", "Industrial farming", "Aquaculture")),
    ],
    "C9H_PASTOR": [
        Concept("Pastoralists",
                "Communities that herd livestock as primary livelihood, often nomadic.",
                ("Gujjars", "Bakarwals", "Maasai", "Raika"),
                ("Sedentary farmers", "Industrialists", "Urban dwellers", "Fishermen only")),
        Concept("Maasai",
                "East African pastoralist community in Kenya/Tanzania.",
                ("Cattle herders", "East Africa", "Tribal society", "Nomadic"),
                ("Indian tribe", "European farmers", "Urban Americans", "Asian fishers")),
        Concept("Gujjar Bakarwals",
                "Pastoralists of Jammu & Kashmir who migrate seasonally.",
                ("J&K", "Seasonal migration", "Goat + sheep herding", "High-altitude pastures"),
                ("Coastal fishermen", "Plain farmers", "Urban traders", "Rajasthani only")),
        Concept("Wasteland Rules",
                "Colonial laws declaring uncultivated land 'waste' to be redistributed.",
                ("Mid-19th century", "Reduced grazing land", "Affected pastoralists", "Tax revenue motivation"),
                ("Revenue Settlement (different)", "Indian Forest Act (different)", "Permanent Settlement (zamindari)", "Land Reforms (post-1947)")),
    ],
    "C9G_LOC": [
        Concept("Latitude",
                "Imaginary lines parallel to Equator measuring N/S position.",
                ("Equator 0°", "Tropic of Cancer 23.5°N", "Arctic Circle 66.5°N", "North Pole 90°N"),
                ("Longitude (E/W)", "Altitude", "Elevation", "Random")),
        Concept("Longitude",
                "Imaginary lines connecting poles measuring E/W position.",
                ("Prime Meridian 0°", "IST 82.5°E", "International Date Line ~180°", "Greenwich"),
                ("Latitude (N/S)", "Equator", "Pole only", "Random")),
        Concept("Tropic of Cancer",
                "Latitude 23.5° N passing through central India.",
                ("23.5°N", "Through India", "Sun overhead on 21 June", "Demarcates tropics"),
                ("Equator", "Tropic of Capricorn (S)", "Arctic Circle", "Antarctic Circle")),
        Concept("Indian Standard Time",
                "Time zone based on 82.5°E meridian, 5h 30min ahead of UTC.",
                ("82.5°E", "+5:30 UTC", "Through Mirzapur (UP)", "Single zone"),
                ("UTC", "Multiple zones in India", "67.5°E", "90°E")),
        Concept("Indian neighbours",
                "Pakistan, China, Nepal, Bhutan, Bangladesh, Myanmar, Sri Lanka, Maldives.",
                ("Pakistan (W)", "China (N)", "Bangladesh (E)", "Sri Lanka (S, sea)"),
                ("Russia direct neighbour", "Saudi Arabia direct neighbour", "Indonesia direct neighbour", "Iran direct neighbour")),
    ],
    "C9G_PHY": [
        Concept("Himalayas",
                "Highest mountain range in the world; northern boundary of India.",
                ("Mount Everest", "Three ranges (Greater, Lesser, Outer)", "Source of major rivers", "Young fold mountain"),
                ("Aravalli (oldest)", "Western Ghats", "Eastern Ghats", "Vindhyas")),
        Concept("Northern plains",
                "Fertile alluvial plains formed by Ganga + Indus + Brahmaputra rivers.",
                ("Indo-Gangetic", "Highly fertile", "Densely populated", "Flat topography"),
                ("Plateau", "Desert", "Mountain", "Coastline only")),
        Concept("Peninsular plateau",
                "Triangular plateau south of Vindhyas; ancient + stable.",
                ("Deccan plateau", "Old rocks", "Mineral-rich", "Western and Eastern Ghats border"),
                ("Northern plains", "Himalayas", "Coastal plains", "Thar Desert")),
        Concept("Thar Desert",
                "India's largest hot desert in Rajasthan.",
                ("Rajasthan", "Hot arid", "Sand dunes", "Camel breeding"),
                ("Cold desert", "Mountain", "Rainforest", "Coastal area")),
        Concept("Coastal plains",
                "Narrow strips along Arabian Sea (W) and Bay of Bengal (E).",
                ("Western coast (Konkan, Malabar)", "Eastern coast (Northern Circars, Coromandel)", "Lakes/lagoons", "Major ports"),
                ("Plateau", "Desert", "Himalayas", "Plains only")),
    ],
    "C9G_DRAIN": [
        Concept("Himalayan rivers",
                "Perennial rivers fed by glaciers + monsoon (Ganga, Indus, Brahmaputra).",
                ("Perennial", "Glacier-fed + monsoon", "Long courses", "Flooding common"),
                ("Seasonal only", "Peninsular rivers", "Stagnant", "Underground only")),
        Concept("Peninsular rivers",
                "Seasonal rivers flowing east or west into seas (Godavari, Krishna, Narmada).",
                ("Seasonal", "Rain-fed", "Shorter than Himalayan", "Westward (Narmada/Tapi) or Eastward (Godavari/Krishna)"),
                ("Glacier-fed only", "Himalayan", "Always perennial", "Underground")),
        Concept("Ganga",
                "Major Himalayan river of India + Bangladesh; sacred + densely-settled basin.",
                ("Source: Gangotri", "Mouth: Sundarbans (Bay of Bengal)", "Main tributary: Yamuna", "Sacred to Hindus"),
                ("Indus (Pakistan)", "Brahmaputra (eastward)", "Godavari (peninsular)", "Cauvery (peninsular)")),
        Concept("Brahmaputra",
                "Major river through Tibet, India (Assam), Bangladesh.",
                ("Tibet → Arunachal → Assam", "Joins Ganga in Bangladesh", "Heavy rainfall", "Flood-prone"),
                ("Ganga", "Indus", "Krishna", "Cauvery")),
        Concept("Lakes",
                "Inland water bodies: natural (e.g., Wular) or man-made (e.g., Govind Sagar).",
                ("Wular (natural, J&K)", "Dal (J&K)", "Govind Sagar (man-made)", "Sambhar (salt)"),
                ("Always artificial", "Always saline", "Same as river", "Same as wetland")),
    ],
    "C9G_CLIM": [
        Concept("Monsoon",
                "Seasonal reversal of winds bringing rainfall; SW summer + NE winter monsoon.",
                ("SW (June–Sep)", "NE (Oct–Dec)", "Reverse with seasons", "Drives Indian agriculture"),
                ("Constant winds", "Random storms", "Single direction", "Independent of seasons")),
        Concept("Mawsynram",
                "Wettest place in the world (Meghalaya).",
                ("Meghalaya", "World's wettest", "Khasi hills", "Heavy monsoon"),
                ("Driest (e.g., Leh)", "Cherrapunji (close second)", "Mumbai (high but not highest)", "Random")),
        Concept("Loo",
                "Hot dry wind in northern India during summer.",
                ("North India", "Summer (May/June)", "Hot dry", "Heat-stroke risk"),
                ("Cold wind", "Mountain breeze", "Moist breeze", "Tropical storm")),
        Concept("Mango showers",
                "Pre-monsoon rains in Kerala/Karnataka helping mango ripening.",
                ("Pre-monsoon", "Kerala/Karnataka", "Help mango ripening", "April–May"),
                ("Winter rains", "Cyclones", "Snow", "Monsoon proper")),
    ],
    "C9G_VEG": [
        Concept("Tropical evergreen",
                "Dense forest in heavy rainfall (>200cm) regions; never bare.",
                ("Western Ghats", "Andaman", "Northeastern hills", "Mahogany, ebony"),
                ("Deciduous", "Thorn forest", "Tundra", "Mangrove only")),
        Concept("Tropical deciduous",
                "Most widespread Indian forest type; sheds leaves in dry season.",
                ("Sal", "Teak", "Most of India", "Moist + dry"),
                ("Evergreen only", "Tundra", "Rainforest", "Mangrove")),
        Concept("Mangrove",
                "Saline swamp forests on coastlines (Sundarbans).",
                ("Sundarbans (W. Bengal)", "Tidal/saline", "Roots above water", "Bengal tiger habitat"),
                ("Mountain forest", "Desert", "Tundra", "Tropical evergreen only")),
        Concept("Wildlife sanctuary",
                "Protected area for wildlife conservation.",
                ("Project Tiger", "Bandipur", "Kaziranga", "Govt-protected"),
                ("Open hunting", "Industrial zone", "Urban park", "Random forest")),
    ],
    "C9G_POP": [
        Concept("Census",
                "Decennial enumeration of population.",
                ("Conducted every 10 years", "All-India", "Counts demographics", "Govt of India"),
                ("Annual", "Sample only", "Local only", "Voluntary")),
        Concept("Population density",
                "Number of people per square km.",
                ("People per sq.km", "India ~382/km²", "Bihar high density", "Arunachal low density"),
                ("Total population", "Birth rate only", "Random", "Sex ratio")),
        Concept("Sex ratio",
                "Females per 1000 males.",
                ("F per 1000 M", "Indicator of gender equality", "Kerala high", "Haryana lower"),
                ("Total population", "Birth rate", "Density", "Random")),
        Concept("Literacy rate",
                "% of population (7+) who can read + write + understand.",
                ("% literate", "Kerala high (>90%)", "National goal", "7+ age group"),
                ("Birth rate", "Sex ratio", "Density", "Random")),
    ],
    "C9P_DEMO": [
        Concept("Democracy",
                "Government in which rulers are elected by the people.",
                ("Free + fair elections", "Universal adult franchise", "Rule of law", "India is a democracy"),
                ("Monarchy", "Dictatorship", "Theocracy", "Aristocracy")),
        Concept("Universal adult franchise",
                "Right of all adult citizens (18+) to vote regardless of caste/class/sex.",
                ("18+ in India", "All citizens", "No discrimination", "Constitutional right"),
                ("Property qualification", "Only men", "Only literate", "Religious test")),
        Concept("Free and fair elections",
                "Elections where voters choose freely without coercion + with secret ballot.",
                ("Secret ballot", "Multiple candidates", "Independent commission", "No fraud"),
                ("Single candidate", "Coerced voting", "Public ballot only", "Indirectly chosen")),
    ],
    "C9P_CONST": [
        Concept("Indian Constitution",
                "Supreme law of India; adopted 26 Nov 1949; effective 26 Jan 1950.",
                ("Adopted 26 Nov 1949", "Effective 26 Jan 1950", "Drafted by Constituent Assembly", "Largest written constitution"),
                ("US Constitution", "Magna Carta", "UK constitution (unwritten)", "Russian")),
        Concept("Preamble",
                "Introductory statement of values + objectives of the Constitution.",
                ("Sovereign socialist secular democratic republic", "Justice, liberty, equality, fraternity", "We the people", "Sets goals"),
                ("Schedule", "Article 1 only", "Amendment process", "Random text")),
        Concept("Constituent Assembly",
                "Body that drafted India's Constitution; chaired in drafting by Ambedkar.",
                ("Ambedkar drafting head", "Rajendra Prasad chairman", "1946–1949", "Contains experts"),
                ("Parliament", "Supreme Court", "Cabinet", "President alone")),
        Concept("Fundamental Rights",
                "Constitutionally guaranteed rights (Part III) of Indian citizens.",
                ("Right to Equality", "Right to Freedom", "Right against Exploitation", "Right to Constitutional Remedies"),
                ("Directive Principles (non-justiciable)", "Fundamental Duties", "President's privileges", "Random")),
    ],
    "C9P_ELEC": [
        Concept("Election Commission",
                "Independent body that conducts elections in India.",
                ("Article 324", "Conducts elections", "Independent of government", "Chief Election Commissioner"),
                ("Parliament", "Supreme Court only", "President alone", "Cabinet")),
        Concept("Constituency",
                "Geographical area whose voters elect a representative.",
                ("Lok Sabha (parliamentary)", "Vidhan Sabha (assembly)", "Voter base", "Drawn by Delimitation"),
                ("Single state", "Whole country", "Random group", "Cohort")),
        Concept("First past the post",
                "Electoral system where candidate with most votes wins.",
                ("Plurality system", "India uses FPTP", "Simple majority", "UK uses too"),
                ("Proportional representation", "Cumulative voting", "Single transferable vote", "Block voting")),
        Concept("Reservation in elections",
                "Reserved seats for SC/ST in legislatures.",
                ("Constitutional", "SC/ST seats reserved", "Proportional to population", "Periodic review"),
                ("No reservation", "Caste-only voting", "Random", "Religious reservation")),
    ],
    "C9P_INST": [
        Concept("Parliament",
                "Legislative body of India: President + Lok Sabha + Rajya Sabha.",
                ("Lok Sabha (lower)", "Rajya Sabha (upper)", "President's role", "Bicameral"),
                ("Single house", "Executive only", "Judiciary", "President alone")),
        Concept("Prime Minister",
                "Head of government; leader of majority in Lok Sabha.",
                ("Heads cabinet", "Lok Sabha leader", "Real executive head", "Appointed by President"),
                ("President", "Chief Justice", "Speaker", "Governor")),
        Concept("President",
                "Head of state; ceremonial executive.",
                ("Ceremonial head", "Article 52", "Elected by electoral college", "Acts on PM's advice"),
                ("PM (real head)", "Speaker", "CJI", "Random")),
        Concept("Supreme Court",
                "Apex court of India; final interpreter of Constitution.",
                ("Apex court", "Final interpreter", "CJI heads", "Article 124"),
                ("High Court (state)", "District court", "Tribunal", "Cabinet")),
    ],
    "C9P_RIGHTS": [
        Concept("Right to Equality",
                "Article 14–18: equality before law and prohibition of discrimination.",
                ("Article 14", "No discrimination on caste/sex/religion", "Equal protection", "Equality of opportunity"),
                ("Right to property only", "Religious privilege", "Random", "Article 19 (Freedom)")),
        Concept("Right to Freedom",
                "Article 19–22: speech, assembly, association, movement, profession.",
                ("Article 19", "Six freedoms", "Speech + expression", "Subject to reasonable restrictions"),
                ("Right against exploitation", "Right to property", "Article 14", "Article 32")),
        Concept("Right against Exploitation",
                "Article 23–24: prohibits trafficking, forced labour, child labour.",
                ("Article 23", "Article 24", "Anti-trafficking", "Anti-child-labour"),
                ("Right to property", "Article 19", "Article 32", "Religious right")),
        Concept("Right to Constitutional Remedies",
                "Article 32: lets citizens move courts to enforce Fundamental Rights.",
                ("Article 32", "Heart and soul (Ambedkar)", "Writs", "Move SC/HC"),
                ("Right to property", "Religious right", "Cultural", "Random")),
    ],
    "C9E_PALAM": [
        Concept("Factors of production",
                "Land, labour, capital, enterprise — inputs that produce goods and services.",
                ("Land", "Labour", "Physical capital", "Human capital"),
                ("Output", "Profit only", "Tax", "Subsidy")),
        Concept("MSP (Minimum Support Price)",
                "Price at which government buys crops to protect farmers.",
                ("Govt-set", "Protects farmers", "Buffer stock", "Wheat + rice"),
                ("Market price only", "Maximum price", "Random", "Wholesale only")),
        Concept("HYV seeds",
                "High-yielding-variety seeds developed during Green Revolution.",
                ("Higher yield", "Disease-resistant", "Need fertiliser/water", "Punjab/Haryana"),
                ("Traditional seeds only", "Wild varieties", "Sterile", "Random")),
        Concept("Multiple cropping",
                "Growing more than one crop on the same land in a year.",
                ("Higher productivity", "Used in Punjab", "Two or more crops", "HYV + irrigation"),
                ("Single crop only", "Crop rotation only", "Wild farming", "No cropping")),
    ],
    "C9E_PEOP": [
        Concept("Human capital",
                "Stock of skill + knowledge embodied in people.",
                ("Education", "Health", "Skill training", "Stock of human productive capacity"),
                ("Physical capital", "Natural capital", "Money only", "Land")),
        Concept("Unemployment",
                "Situation where willing workers cannot find jobs.",
                ("Disguised", "Seasonal", "Open", "Educated unemployed"),
                ("Full employment", "Random", "Always voluntary", "Self-employment only")),
        Concept("Disguised unemployment",
                "Apparent employment where workers are surplus to need.",
                ("Common in agriculture", "Marginal productivity zero", "More workers than needed", "Hidden joblessness"),
                ("Open unemployment", "Voluntary", "Always seasonal", "Always urban")),
    ],
    "C9E_POV": [
        Concept("Poverty line",
                "Income/consumption level below which a person is considered poor.",
                ("Calorie norm", "Consumption-based", "Tendulkar/Rangarajan", "Govt-defined"),
                ("Wealth alone", "Random", "Profit", "Tax")),
        Concept("Vulnerable groups",
                "Communities at higher risk of poverty (SC, ST, landless labourers).",
                ("SC/ST", "Landless labourers", "Casual workers", "Female-headed households"),
                ("Industrialists", "Salaried govt employees", "Urban professionals", "Public sector")),
        Concept("MGNREGA",
                "Scheme guaranteeing 100 days of wage employment per rural household.",
                ("100 days/year", "Rural", "Demand-driven", "Right-based"),
                ("Industrial scheme", "Random", "PDS only", "PMJDY (banking)")),
    ],
    "C9E_FOOD": [
        Concept("Food security",
                "Availability + accessibility + affordability of food for all.",
                ("Three dimensions", "Public Distribution System", "Buffer stocks", "Right to food"),
                ("Single dimension", "Random", "Industrial only", "Imports only")),
        Concept("PDS (Public Distribution System)",
                "Govt programme distributing essential food grains at subsidised prices.",
                ("Ration shops", "Subsidised wheat/rice", "BPL/APL cards", "FCI manages stocks"),
                ("Open market only", "Industrial supply", "Random", "Private retail")),
        Concept("Buffer stock",
                "Stock of food grains held by Food Corporation of India for emergencies.",
                ("FCI", "Wheat/rice", "Procurement at MSP", "Used in shortages"),
                ("Industrial reserve", "Random", "Private stock", "Foreign reserve")),
        Concept("Antyodaya Anna Yojana",
                "Scheme providing food at lowest prices to the poorest.",
                ("Targets poorest", "Subsidised food", "Below BPL", "Specific PDS variant"),
                ("Wealthy targeted", "Industrial scheme", "Random", "PMJDY")),
    ],
    "C9_ENG": [
        Concept("Beehive prose",
                "Main NCERT prose anthology for Class 9 English.",
                ("The Fun They Had", "The Sound of Music", "My Childhood (Kalam)", "A Truly Beautiful Mind (Einstein)"),
                ("Hindi poetry", "Maths chapter", "Sanskrit text", "Science article")),
        Concept("Beehive poetry",
                "Main NCERT poetry section for Class 9 English.",
                ("The Road Not Taken (Frost)", "Wind (Bharati)", "No Men Are Foreign", "The Lake Isle of Innisfree"),
                ("Prose only", "Drama", "Hindi poems", "Sanskrit shlokas")),
        Concept("Moments stories",
                "Supplementary NCERT story collection for Class 9 English.",
                ("The Lost Child (Mulk Raj Anand)", "Iswaran the Storyteller", "In the Kingdom of Fools", "A House Is Not a Home"),
                ("Beehive prose", "Beehive poetry", "Hindi", "Sanskrit")),
        Concept("Reading comprehension",
                "Skill of understanding + analysing a written passage.",
                ("Skim for gist", "Scan for facts", "Inference questions", "Vocabulary in context"),
                ("Memorising", "Random reading", "Listening only", "Speaking")),
    ],
    "C9_GRAMMAR_E": [
        Concept("Tenses",
                "Forms of verbs indicating time of action.",
                ("Present", "Past", "Future", "Continuous + perfect aspects"),
                ("Mood", "Voice", "Number", "Person only")),
        Concept("Modals",
                "Auxiliary verbs (can, may, should, must) expressing possibility/necessity.",
                ("Can/could", "May/might", "Must/should", "Will/would"),
                ("Lexical verbs only", "Articles", "Conjunctions", "Prepositions only")),
        Concept("Active vs Passive Voice",
                "Active: subject does the action; Passive: subject receives.",
                ("Active: She wrote a book", "Passive: A book was written by her", "Object → subject in passive", "Used for emphasis"),
                ("Same construction", "Tense change unnecessary", "Random", "Only past tense")),
        Concept("Reported speech",
                "Indirect rendering of someone's words; tense backshift + pronoun changes.",
                ("Direct: He said, 'I am tired'", "Indirect: He said he was tired", "Tense backshift", "Quotation removal"),
                ("Same as direct", "No changes", "Always present tense", "Random")),
    ],

    # ============================================================
    # Class 9 — Hindi (14 chapters from migration 020)
    # ============================================================
    "C9H_KS_DOPAHAR": [
        Concept("दोपहर का भोजन",
                "अमरकांत की कहानी; मध्यवर्गीय परिवार के दोपहर के भोजन का चित्रण.",
                ("मध्यवर्गीय परिवार", "स्त्री-पुरुष भूमिकाएँ", "अमरकांत की कहानी", "सामाजिक यथार्थ"),
                ("नागार्जुन की कविता", "रहीम के दोहे", "रैदास के पद", "प्रेमचंद के फटे जूते")),
        Concept("मुख्य पात्र",
                "सिद्धेश्वरी और उसके बच्चे — कहानी के केंद्रीय पात्र.",
                ("सिद्धेश्वरी", "मोहन", "रामचंद्र", "मध्यवर्गीय गृहस्थी"),
                ("राजा-रानी", "औद्योगिक जगत", "विदेशी पात्र", "ऐतिहासिक चरित्र")),
    ],
    "C9H_KS_KIBLA": [
        Concept("मेरे बचपन के दिन",
                "महादेवी वर्मा की आत्मकथात्मक रचना.",
                ("बचपन की स्मृतियाँ", "महादेवी वर्मा", "आत्मकथा", "महिला शिक्षा"),
                ("रहीम के दोहे", "नागार्जुन की कविता", "प्रेमचंद कहानी", "रैदास")),
        Concept("महादेवी वर्मा",
                "छायावाद की प्रमुख कवयित्री; गद्य लेखिका भी.",
                ("छायावाद", "कविता + गद्य", "स्त्री शिक्षा प्रचारक", "ज्ञानपीठ पुरस्कार"),
                ("रहीम (पुरुष)", "तुलसीदास", "कबीर", "जयशंकर प्रसाद")),
    ],
    "C9H_KS_SAVALE": [
        Concept("साँवले सपनों की याद",
                "जाबिर हुसैन की रचना; सलीम अली के पक्षी-प्रेम की याद.",
                ("जाबिर हुसैन", "सलीम अली", "पक्षी विज्ञानी", "स्मरण-निबंध"),
                ("रहीम", "नागार्जुन", "महादेवी वर्मा", "प्रेमचंद")),
        Concept("सलीम अली",
                "भारत के प्रसिद्ध पक्षी विज्ञानी (1896–1987).",
                ("Birdman of India", "पक्षी विज्ञान", "पद्म विभूषण", "Bombay Natural History"),
                ("कवि", "उपन्यासकार", "वैज्ञानिक भौतिकी", "इतिहासकार")),
    ],
    "C9H_KS_PREMVAND": [
        Concept("प्रेमचंद के फटे जूते",
                "हरिशंकर परसाई का व्यंग्यात्मक निबंध.",
                ("हरिशंकर परसाई", "व्यंग्य", "प्रेमचंद का चित्र", "जीवन-दर्शन"),
                ("कविता", "नाटक", "वैज्ञानिक लेख", "कहानी")),
        Concept("हरिशंकर परसाई",
                "हिंदी के प्रसिद्ध व्यंग्यकार.",
                ("व्यंग्य लेखक", "हिंदी", "20वीं सदी", "ज्ञानपीठ"),
                ("रहीम", "तुलसी", "महादेवी", "नागार्जुन")),
    ],
    "C9H_KS_MERA_GHAR": [
        Concept("मेरा छोटा सा निजी पुस्तकालय",
                "गुणाकर मुले का संस्मरण-निबंध.",
                ("गुणाकर मुले", "पुस्तक प्रेम", "व्यक्तिगत पुस्तकालय", "लेखक की यात्रा"),
                ("रहीम", "महादेवी", "नागार्जुन", "रैदास")),
    ],
    "C9H_KS_RAIDAS": [
        Concept("रैदास के पद",
                "संत रैदास की भक्ति-काव्य रचनाएँ.",
                ("भक्तिकाल", "निर्गुण भक्ति", "समता संदेश", "कबीर के समकालीन"),
                ("रीतिकाल", "आधुनिक काल", "छायावाद", "प्रगतिवाद")),
        Concept("निर्गुण भक्ति",
                "निराकार ईश्वर की उपासना.",
                ("कबीर", "रैदास", "नानक", "निर्गुण संत"),
                ("सगुण भक्ति (राम-कृष्ण)", "तुलसी", "सूरदास", "मीरा")),
    ],
    "C9H_KS_RAHIM": [
        Concept("रहीम के दोहे",
                "अब्दुर्रहीम खानखाना के नीति-दोहे.",
                ("रहीम", "मुगल काल", "नीति-दोहे", "जीवन-व्यवहार"),
                ("कबीर के दोहे (अलग)", "तुलसी की चौपाई", "बिहारी के दोहे", "सूरदास के पद")),
        Concept("दोहा",
                "दो पंक्तियों का छंद, 13+11 मात्राओं का.",
                ("दो पंक्तियाँ", "मात्रा-छंद", "13+11", "प्राचीन हिंदी छंद"),
                ("सॉनेट (अंग्रेज़ी)", "गज़ल (दो पंक्तियों का अलग छंद)", "हाइकू (जापानी)", "मुक्तक")),
    ],
    "C9H_KS_NAGARJUN": [
        Concept("नागार्जुन",
                "बाबा नागार्जुन — हिंदी के प्रगतिशील कवि.",
                ("असली नाम वैद्यनाथ मिश्र", "मैथिली + हिंदी कवि", "प्रगतिवादी", "20वीं सदी"),
                ("रहीम (मध्यकाल)", "तुलसी", "कबीर", "रैदास")),
        Concept("प्रगतिशील काव्य",
                "सामाजिक यथार्थ और शोषितों की पीड़ा को व्यक्त करने वाली कविता.",
                ("समाज-यथार्थ", "श्रमिक-संघर्ष", "मार्क्सवादी प्रभाव", "20वीं सदी का आंदोलन"),
                ("भक्तिकाल", "रीतिकाल", "छायावाद", "रहस्यवाद")),
    ],
    "C9H_KS_SUMITRA": [
        Concept("सुमित्रानंदन पंत",
                "छायावाद के स्तंभ; प्रकृति के सुकुमार कवि.",
                ("छायावाद", "प्रकृति-कवि", "ज्ञानपीठ", "हिमवंती कविता"),
                ("भक्तिकाल कवि", "रहीम", "रैदास", "तुलसी")),
        Concept("ग्राम श्री",
                "पंत की कविता; गाँव की प्राकृतिक सुंदरता का चित्रण.",
                ("ग्राम चित्रण", "प्रकृति-वर्णन", "सुमित्रानंदन पंत", "छायावाद"),
                ("रहीम के दोहे", "नागार्जुन की प्रगतिवादी रचना", "रैदास", "कबीर")),
    ],
    "C9H_KS_KEDARNATH": [
        Concept("केदारनाथ अग्रवाल",
                "प्रगतिशील हिंदी कवि; प्रकृति + ग्रामीण जीवन का चित्रण.",
                ("प्रगतिवादी", "ग्राम-कवि", "प्रकृति प्रेमी", "20वीं सदी"),
                ("भक्तिकाल", "मध्यकालीन", "रहीम", "तुलसी")),
        Concept("चंद्र गहना से लौटती बेर",
                "केदारनाथ अग्रवाल की कविता; ग्रामीण लौटती हुई संध्या.",
                ("ग्रामीण दृश्य", "केदारनाथ अग्रवाल", "प्रकृति-वर्णन", "संध्या समय"),
                ("रहीम के दोहे", "रैदास", "महादेवी", "नागार्जुन")),
    ],
    "C9H_KR_IS_JAL": [
        Concept("इस जल प्रलय में",
                "फणीश्वर नाथ रेणु का संस्मरण; बिहार बाढ़ 1975.",
                ("रेणु", "1975 बाढ़", "बिहार", "संस्मरण"),
                ("रहीम के दोहे", "महादेवी", "नागार्जुन", "रैदास")),
    ],
    "C9H_KR_MERE_HAM": [
        Concept("मेरे संग की औरतें",
                "मृदुला गर्ग का संस्मरण; जीवन में आई स्त्रियों पर.",
                ("मृदुला गर्ग", "स्त्री-केंद्रित", "संस्मरण", "स्त्री विमर्श"),
                ("रहीम", "महादेवी (अलग)", "नागार्जुन", "रैदास")),
    ],
    "C9H_KR_REEDH": [
        Concept("रीढ़ की हड्डी",
                "जगदीशचंद्र माथुर का एकांकी; दहेज पर तीखा प्रहार.",
                ("एकांकी", "जगदीशचंद्र माथुर", "दहेज विरोधी", "नाट्य-रचना"),
                ("कविता", "उपन्यास", "कहानी", "निबंध")),
    ],
    "C9H_KR_KIS_TARAH": [
        Concept("किस तरह आख़िरकार मैं हिंदी में आया",
                "शमशेर बहादुर सिंह का संस्मरण; भाषा-यात्रा.",
                ("शमशेर बहादुर सिंह", "भाषा-यात्रा", "हिंदी अपनाने की कहानी", "संस्मरण"),
                ("रहीम के दोहे", "महादेवी", "नागार्जुन", "रैदास")),
    ],

    # ============================================================
    # Class 9 — Sanskrit (8 chapters from migration 020)
    # ============================================================
    "C9S_BHARATIVAM": [
        Concept("भारतीवम्",
                "भारत की सांस्कृतिक धरोहर का गुणगान करने वाला संस्कृत पाठ.",
                ("संस्कृत श्लोक", "भारत-स्तुति", "सांस्कृतिक धरोहर", "श्रीधर भास्कर वर्णेकर"),
                ("हिंदी कविता", "अंग्रेज़ी निबंध", "अरबी कविता", "लातिनी पाठ")),
    ],
    "C9S_SVARNA": [
        Concept("स्वर्णकाकः",
                "सुनहरा कौआ — हितोपदेश शैली की नीति कथा.",
                ("कौआ", "नीति कथा", "हितोपदेश शैली", "नैतिक शिक्षा"),
                ("भौगोलिक पाठ", "वैज्ञानिक लेख", "गणितीय सूत्र", "ऐतिहासिक तथ्य")),
    ],
    "C9S_GOLI": [
        Concept("गोली ही गोली",
                "आधुनिक संस्कृत कथा; डॉक्टर की करुणा का चित्रण.",
                ("आधुनिक संस्कृत", "डॉक्टर", "करुणा", "कथा"),
                ("प्राचीन वैदिक श्लोक", "हिंदी कहानी", "अंग्रेज़ी निबंध", "नाटक")),
    ],
    "C9S_KALOSI": [
        Concept("कालोऽसि कालोऽसि कालोऽसि",
                "हास्य-संवाद, व्याकरण के विरोधाभास सिखाने वाला.",
                ("हास्य-संवाद", "व्याकरण-विरोधाभास", "लघु-नाट्य", "शिक्षाप्रद"),
                ("गंभीर निबंध", "वैज्ञानिक", "लयात्मक काव्य", "महाकाव्य")),
    ],
    "C9S_SUKTI": [
        Concept("सूक्ति मञ्जरी",
                "संस्कृत सुभाषितों का संग्रह.",
                ("सुभाषित संग्रह", "नीति-वचन", "श्लोक", "जीवन-शिक्षा"),
                ("कथा", "नाटक", "व्याकरण-पाठ", "वैज्ञानिक लेख")),
        Concept("सुभाषित",
                "नीति, ज्ञान, जीवन-व्यवहार की लघु संस्कृत उक्तियाँ.",
                ("लघु श्लोक", "नीति-शिक्षा", "जीवन-व्यवहार", "स्मरणीय"),
                ("लंबी कथा", "नाटक", "उपन्यास", "वैज्ञानिक नियम")),
    ],
    "C9S_BHAGEEr": [
        Concept("भागीरथ प्रवृत्तम्",
                "भगीरथ द्वारा गंगा को धरती पर लाने की पौराणिक कथा.",
                ("भगीरथ", "गंगा अवतरण", "पौराणिक कथा", "महायज्ञ"),
                ("ऐतिहासिक तथ्य", "वैज्ञानिक प्रयोग", "आधुनिक कथा", "व्याकरण-पाठ")),
    ],
    "C9S_PRARYAA": [
        Concept("पर्यावरणम्",
                "पर्यावरण के महत्व पर संस्कृत श्लोक.",
                ("पर्यावरण-महत्त्व", "वृक्षारोपण", "जल-संरक्षण", "प्रकृति-स्तुति"),
                ("युद्ध वर्णन", "हास्य कथा", "गणितीय सूत्र", "व्याकरण")),
    ],
    "C9S_VYANJANA": [
        Concept("व्यंजन वर्ण",
                "संस्कृत के व्यंजन — स्वर के साथ मिलकर ध्वनि बनाने वाले.",
                ("क, ख, ग, घ", "स्वर के साथ", "उच्चारण आधारित वर्गीकरण", "33 व्यंजन"),
                ("स्वर (अ, आ, इ)", "मात्रा", "विसर्ग", "अनुस्वार")),
    ],
}


# ─── TEMPLATE GENERATOR ────────────────────────────────────────────


def _det_pick(seed: str, pool: tuple[str, ...] | list[str], k: int) -> list[str]:
    """Deterministic pick of k items from pool, hashed by seed.

    Lets the same (topic, idx, template) always pick the same
    distractors so re-running the seed is idempotent and the question
    bank stays stable across docker restarts.
    """
    if not pool:
        return []
    h = int(hashlib.md5(seed.encode()).hexdigest(), 16)
    out: list[str] = []
    poollist = list(pool)
    for i in range(k):
        idx = (h >> (i * 8)) % len(poollist)
        out.append(poollist[idx])
        poollist[idx] = poollist[-1]
        poollist.pop()
        if not poollist:
            break
    return out


def _difficulty_for(idx: int) -> float:
    """Spread difficulty across [-1.5, 1.5] in a stable rotation."""
    return [-1.5, -0.5, 0.0, 0.5, 1.0, 1.5, -1.0][idx % 7]


def generate_for_topic(
    topic_code: str, target: int = 100
) -> list[dict]:
    """Generate up to `target` MCQs for a topic from its concept bank.

    Returns rows ready for INSERT into ``content_schema.questions``:
        {stem, choices: [4 strings], correct_idx, difficulty_b}

    The generator rotates over six templates per concept and pads with
    cross-concept association MCQs to reach the target count.
    """
    concepts = CONCEPTS.get(topic_code, [])
    if not concepts:
        return []

    out: list[dict] = []

    def emit(stem: str, correct: str, others: list[str]) -> None:
        # Place correct at idx 0..3 deterministically based on length.
        # Placing it at 0 every time would make the test useless
        # against an MCQ-randomiser bug, so rotate.
        seed = f"{topic_code}|{len(out)}|{stem[:20]}"
        h = int(hashlib.md5(seed.encode()).hexdigest(), 16)
        correct_idx = h % 4
        choices: list[str] = list(others[:3])
        # Pad if pool too small.
        while len(choices) < 3:
            choices.append(_GLOBAL_DISTRACTORS[(h + len(choices)) % len(_GLOBAL_DISTRACTORS)])
        choices.insert(correct_idx, correct)
        choices = choices[:4]
        out.append(
            {
                "stem": stem,
                "choices": choices,
                "correct_idx": correct_idx,
                "difficulty_b": _difficulty_for(len(out)),
            }
        )

    # Build a pool of all concept names so we can use them as cross-
    # concept distractors. Pads thinly-banked chapters.
    all_names_in_topic = [c.name for c in concepts]
    cross_concept_pool = tuple(
        n
        for code, lst in CONCEPTS.items()
        if code != topic_code
        for c in lst
        for n in (c.name,)
    )

    # Template 1 — definition.
    for c in concepts:
        emit(
            stem=f"Which of the following best describes “{c.name}”?",
            correct=c.definition,
            others=_det_pick(
                f"def|{topic_code}|{c.name}", _GLOBAL_DISTRACTORS, 3
            )
            + ["A different concept entirely", "An unrelated formula"],
        )

    # Template 2 — recognition (positive examples).
    for c in concepts:
        for ex in c.examples:
            emit(
                stem=f"Which of these is an example of “{c.name}”?",
                correct=ex,
                others=list(c.distractors[:3])
                or _det_pick(
                    f"rec|{topic_code}|{c.name}|{ex}",
                    _GLOBAL_DISTRACTORS,
                    3,
                ),
            )

    # Template 3 — counter (which is NOT an example).
    for c in concepts:
        if not c.examples or not c.distractors:
            continue
        emit(
            stem=f"Which of the following is NOT an example of “{c.name}”?",
            correct=c.distractors[0],
            others=list(c.examples[:3]),
        )

    # Template 4 — application (example → concept).
    for c in concepts:
        for ex in c.examples[:2]:  # limit to first two to control fanout
            emit(
                stem=f"“{ex}” is most directly an instance of which concept?",
                correct=c.name,
                others=_det_pick(
                    f"app|{topic_code}|{c.name}|{ex}",
                    cross_concept_pool or _GLOBAL_DISTRACTORS,
                    3,
                ),
            )

    # Template 5 — property (true claim about concept).
    for c in concepts:
        emit(
            stem=f"Which statement about “{c.name}” is TRUE?",
            correct=c.definition,
            others=_det_pick(
                f"prop|{topic_code}|{c.name}",
                _GLOBAL_DISTRACTORS,
                3,
            ),
        )

    # Template 6 — disambiguation across pairs of concepts in the
    # same chapter.
    for i, c1 in enumerate(concepts):
        for j, c2 in enumerate(concepts):
            if i >= j:
                continue
            emit(
                stem=f"Which concept best matches: “{c1.definition}”?",
                correct=c1.name,
                others=[c2.name]
                + _det_pick(
                    f"disamb|{topic_code}|{c1.name}|{c2.name}",
                    cross_concept_pool or _GLOBAL_DISTRACTORS,
                    2,
                ),
            )
            if len(out) >= target:
                break
        if len(out) >= target:
            break

    # Pad to target with reverse-association: cross-concept name pulls.
    pad_idx = 0
    while len(out) < target and concepts:
        c = concepts[pad_idx % len(concepts)]
        ex = c.examples[pad_idx % max(1, len(c.examples))] if c.examples else c.name
        emit(
            stem=f"Among the listed terms, which is most closely associated with “{ex}”?",
            correct=c.name,
            others=_det_pick(
                f"pad|{topic_code}|{pad_idx}",
                cross_concept_pool or _GLOBAL_DISTRACTORS,
                3,
            ),
        )
        pad_idx += 1

    return out[:target]
