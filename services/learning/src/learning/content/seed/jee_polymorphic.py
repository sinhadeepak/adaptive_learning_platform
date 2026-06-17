"""JEE Main polymorphic seed bank — 200 questions per active type
across the seven JEE Main topics (Physics / Chemistry / Maths).

Topic codes match catalog migration 002:
  Physics:   MECH · THERMO · ELEC
  Chemistry: PCHEM · OCHEM
  Maths:     CALC · COORD
"""

from __future__ import annotations

from typing import Any

from learning.content.seed import polymorphic_engine

EXAM_CODE = "JEE-MAIN"

TOPICS: tuple[tuple[str, str], ...] = (
    ("33333333-0000-0000-0000-000000000001", "MECH"),
    ("33333333-0000-0000-0000-000000000002", "THERMO"),
    ("33333333-0000-0000-0000-000000000003", "ELEC"),
    ("33333333-0000-0000-0000-000000000004", "PCHEM"),
    ("33333333-0000-0000-0000-000000000005", "OCHEM"),
    ("33333333-0000-0000-0000-000000000006", "CALC"),
    ("33333333-0000-0000-0000-000000000007", "COORD"),
)

BANK: dict[str, list[tuple[str, str, str, list[str]]]] = {
    "MECH": [
        ("Newton's first law", "law of inertia", "An object continues at rest or constant velocity unless acted on by an unbalanced force.", ["second law", "third law", "Hooke's law"]),
        ("Newton's second law", "F=ma", "Net force on a body equals mass times acceleration; valid in inertial frames.", ["first law", "third law", "Coulomb's law"]),
        ("Conservation of momentum", "p_initial = p_final", "Total linear momentum of an isolated system is conserved when no external force acts.", ["energy only", "charge only", "angular only"]),
        ("Work-energy theorem", "W = ΔKE", "Total work done on a body equals its change in kinetic energy.", ["impulse-momentum", "Bernoulli", "Stefan"]),
        ("Projectile motion", "parabolic trajectory", "A projectile follows a parabolic path under uniform gravity, separable into horizontal (uniform) and vertical (accelerated) components.", ["circular", "spiral", "hyperbolic"]),
        ("Circular motion", "centripetal acceleration", "An object moving in a circle of radius r at speed v has centripetal acceleration a = v²/r directed towards the centre.", ["centrifugal", "tangential only", "radial outward"]),
        ("Simple harmonic motion", "F = -kx", "SHM occurs when restoring force is proportional and opposite to displacement; T = 2π√(m/k).", ["damped only", "forced only", "circular"]),
        ("Friction", "opposes motion", "Friction opposes relative motion or its tendency; static ≤ μ_s N, kinetic = μ_k N.", ["normal", "tension", "weight"]),
        ("Gravitation", "F = G m₁m₂ / r²", "Newton's law of gravitation: every mass attracts every other with a force proportional to product of masses and inverse square of distance.", ["Coulomb's law", "Lorentz force", "magnetism"]),
        ("Rigid-body rotation", "τ = Iα", "Net torque on a rigid body equals moment of inertia times angular acceleration.", ["F=ma only", "Bernoulli", "Hooke"]),
    ],
    "THERMO": [
        ("First law", "ΔU = Q − W", "First law of thermodynamics: change in internal energy equals heat added minus work done by the system.", ["second law", "zeroth law", "third law"]),
        ("Second law", "ΔS_universe ≥ 0", "Second law: entropy of an isolated system never decreases; heat flows spontaneously from hot to cold.", ["first law", "third law", "zeroth law"]),
        ("Zeroth law", "thermal equilibrium", "Zeroth law: if A is in thermal equilibrium with C and B with C, then A and B are in equilibrium — defines temperature.", ["first law", "second law", "third law"]),
        ("Ideal gas equation", "PV = nRT", "Ideal gas law: pressure times volume equals number of moles times R times absolute temperature.", ["van der Waals", "Boyle only", "Charles only"]),
        ("Carnot engine", "η = 1 − T_c/T_h", "Carnot engine: maximum theoretical efficiency between hot reservoir T_h and cold T_c (in kelvin).", ["Otto cycle", "Stirling cycle", "Diesel cycle"]),
        ("Specific heat", "C = Q/(mΔT)", "Specific heat capacity: heat required per unit mass per unit temperature change.", ["latent heat", "thermal conductivity", "thermal diffusivity"]),
        ("Latent heat", "Q = mL", "Latent heat: energy absorbed/released during a phase change at constant temperature.", ["specific heat", "internal energy", "enthalpy of formation"]),
        ("Entropy", "S = k ln Ω", "Boltzmann's entropy: S equals Boltzmann's constant times ln of the number of microstates.", ["enthalpy", "Gibbs energy", "Helmholtz energy"]),
        ("Adiabatic process", "PV^γ = const", "Adiabatic process: no heat exchange with surroundings; for ideal gas PV^γ = constant where γ = Cp/Cv.", ["isothermal", "isobaric", "isochoric"]),
        ("Isothermal process", "T = constant", "Isothermal process: temperature held constant; for ideal gas PV = constant.", ["adiabatic", "isobaric", "isochoric"]),
    ],
    "ELEC": [
        ("Coulomb's law", "F = kq₁q₂/r²", "Coulomb's law: electrostatic force between two point charges is proportional to product of charges and inverse square of distance.", ["gravitation", "Lorentz", "Ampere"]),
        ("Gauss's law", "∮E·dA = Q_enc/ε₀", "Gauss's law: electric flux through a closed surface equals enclosed charge divided by permittivity of vacuum.", ["Faraday's law", "Ampere's law", "Lenz's law"]),
        ("Electric field", "F per unit charge", "Electric field is the force per unit positive test charge; vector field with magnitude E = F/q.", ["potential", "flux", "current density"]),
        ("Electric potential", "V = kq/r (point charge)", "Electric potential at a point: work done per unit charge to bring a positive test charge from infinity.", ["field", "flux", "EMF"]),
        ("Capacitance", "C = Q/V", "Capacitance: charge stored per unit potential difference; for parallel plates C = ε₀A/d.", ["resistance", "inductance", "conductance"]),
        ("Ohm's law", "V = IR", "Ohm's law: voltage across a resistor equals current times resistance, valid for ohmic conductors.", ["Faraday", "Lenz", "Kirchhoff"]),
        ("Kirchhoff's laws", "junction + loop", "Kirchhoff's current law (junction) and voltage law (loop) — conservation of charge and energy in circuits.", ["Ohm only", "Coulomb only", "Gauss only"]),
        ("Magnetic field", "B = μ₀I/(2πr) for wire", "Magnetic field around a long straight wire B = μ₀I/(2πr); direction by right-hand rule.", ["E field", "gravitational field", "stress field"]),
        ("Faraday's law", "EMF = -dΦ/dt", "Faraday's law of induction: induced EMF equals negative time-rate of change of magnetic flux.", ["Lenz's law", "Ampere's law", "Coulomb's law"]),
        ("Lenz's law", "induced current opposes change", "Lenz's law: induced current direction opposes the change in flux that produced it (energy conservation).", ["Faraday's law", "Ampere", "Ohm"]),
    ],
    "PCHEM": [
        ("Mole concept", "1 mol = 6.022 × 10²³ particles", "One mole of any substance contains Avogadro's number (6.022 × 10²³) of elementary entities.", ["dozen", "gross", "score"]),
        ("Stoichiometry", "balanced equation ratios", "Stoichiometric coefficients give the molar ratio of reactants and products in a balanced chemical equation.", ["thermochemistry", "kinetics", "equilibrium"]),
        ("Equilibrium constant", "Kc, Kp", "Equilibrium constant Kc = [products]/[reactants]; Kp uses partial pressures; relate by Kp = Kc(RT)^Δn.", ["rate constant", "ionic product", "stability constant"]),
        ("Le Chatelier's principle", "system shifts to oppose change", "Le Chatelier's principle: a system at equilibrium shifts to partially counteract any imposed change.", ["mass action", "Hess's law", "Avogadro's law"]),
        ("Hess's law", "ΔH path-independent", "Hess's law of constant heat summation: total enthalpy change is the same regardless of pathway.", ["mass action", "Le Chatelier", "Faraday"]),
        ("Rate law", "rate = k[A]^m[B]^n", "Rate law expresses reaction rate as a function of reactant concentrations; orders m and n are determined experimentally.", ["equilibrium law", "ideal-gas law", "stoichiometry"]),
        ("Activation energy", "Arrhenius k = A e^(-Ea/RT)", "Activation energy: minimum energy required for a reaction; Arrhenius equation k = A·exp(-Ea/RT).", ["enthalpy", "entropy", "free energy"]),
        ("Catalyst", "lowers Ea, unchanged", "A catalyst increases reaction rate by lowering activation energy without itself being consumed.", ["inhibitor", "reactant", "product"]),
        ("pH", "−log[H⁺]", "pH = −log₁₀[H⁺]; pure water at 25°C has pH 7 (neutral); pH < 7 acidic, pH > 7 basic.", ["pOH only", "pKa only", "pKw only"]),
        ("Buffer", "weak acid + conjugate base", "A buffer resists pH change on small additions of acid/base — typically a weak acid + its conjugate base or vice versa.", ["strong acid only", "salt only", "neutralised mixture"]),
    ],
    "OCHEM": [
        ("IUPAC nomenclature", "systematic naming", "IUPAC nomenclature: longest chain, lowest locants for substituents and principal characteristic group.", ["common names", "trivial names", "trade names"]),
        ("SN1 reaction", "carbocation intermediate", "SN1: unimolecular nucleophilic substitution proceeding via a carbocation intermediate; favoured by tertiary substrates and polar protic solvents.", ["SN2", "E1", "E2"]),
        ("SN2 reaction", "concerted backside attack", "SN2: bimolecular nucleophilic substitution — single concerted step; backside attack inverts stereochemistry; favoured by primary substrates.", ["SN1", "E1", "E2"]),
        ("E1 elimination", "carbocation, then base", "E1 elimination: rate depends on substrate only; carbocation forms first, then base abstracts a proton.", ["SN1", "E2", "SN2"]),
        ("E2 elimination", "concerted, antiperiplanar", "E2: bimolecular elimination — base removes β-H while leaving group departs; antiperiplanar geometry.", ["E1", "SN2", "SN1"]),
        ("Markovnikov's rule", "H to more H carbon", "Markovnikov's rule: H of HX adds to the carbon already bearing more H atoms in alkene addition (forms more stable carbocation).", ["anti-Markovnikov", "Saytzeff", "Hofmann"]),
        ("Saytzeff vs Hofmann", "more vs less substituted alkene", "Saytzeff (Zaitsev) rule: elimination yields more-substituted alkene; Hofmann gives less-substituted (bulky base).", ["Markovnikov", "anti-Markovnikov", "anti-Hofmann"]),
        ("Aromatic ring", "Hückel 4n+2 π electrons", "Aromaticity requires planar cyclic conjugation with (4n + 2) π electrons (Hückel's rule).", ["antiaromatic", "non-aromatic", "aliphatic"]),
        ("Friedel-Crafts", "electrophilic aromatic substitution", "Friedel-Crafts alkylation/acylation: electrophilic aromatic substitution catalysed by AlCl₃ to introduce R or RCO groups onto an arene.", ["nucleophilic substitution", "addition", "elimination"]),
        ("Grignard reagent", "RMgX, organometallic", "Grignard reagent (R-Mg-X) is a strong nucleophile/base used to form C-C bonds with carbonyl compounds; sensitive to moisture.", ["Friedel-Crafts", "Wurtz", "Cannizzaro"]),
    ],
    "CALC": [
        ("Limit", "lim_{x→a} f(x)", "Limit of f(x) as x approaches a is the value f(x) gets arbitrarily close to as x gets close to a (ε-δ definition).", ["derivative", "integral", "supremum"]),
        ("Derivative", "f'(x) = lim Δx→0 (f(x+Δx)-f(x))/Δx", "Derivative measures the instantaneous rate of change of a function; the slope of the tangent line at a point.", ["limit only", "integral", "antiderivative"]),
        ("Chain rule", "(f∘g)' = f'(g)·g'", "Chain rule: derivative of a composition equals derivative of outer evaluated at inner times derivative of inner.", ["product rule", "quotient rule", "Leibniz rule"]),
        ("Product rule", "(fg)' = f'g + fg'", "Product rule: derivative of a product equals derivative of first times second plus first times derivative of second.", ["chain rule", "quotient rule", "L'Hopital"]),
        ("Integration by parts", "∫u dv = uv − ∫v du", "Integration by parts: based on the product rule of differentiation; useful when integrand is a product.", ["substitution", "partial fractions", "trig substitution"]),
        ("Fundamental theorem", "∫_a^b f'(x) dx = f(b)-f(a)", "Fundamental theorem of calculus connects differentiation and integration: integral of a derivative gives net change.", ["mean value theorem", "extreme value theorem", "Rolle's theorem"]),
        ("Mean value theorem", "f'(c) = (f(b)-f(a))/(b-a)", "Mean Value Theorem: there exists c in (a,b) where the instantaneous rate equals the average rate of change.", ["Rolle's", "intermediate value", "extreme value"]),
        ("L'Hopital's rule", "lim f/g = lim f'/g'", "L'Hopital's rule: for 0/0 or ∞/∞ indeterminate forms, the limit equals the limit of derivatives' ratio.", ["chain rule", "Leibniz", "Cauchy MVT"]),
        ("Rolle's theorem", "f(a)=f(b) ⇒ f'(c)=0", "Rolle's theorem: if f is continuous on [a,b], differentiable on (a,b), and f(a)=f(b), then exists c with f'(c)=0.", ["MVT", "IVT", "EVT"]),
        ("Taylor series", "f(x) = Σ f^(n)(a)(x-a)^n/n!", "Taylor series expands a function as an infinite sum of polynomials around a point a using its derivatives at a.", ["Fourier series", "Laurent series", "power series only"]),
    ],
    "COORD": [
        ("Distance formula", "√((x₂-x₁)² + (y₂-y₁)²)", "Distance between two points in the plane is the square root of the sum of squared coordinate differences.", ["midpoint formula", "section formula", "slope formula"]),
        ("Midpoint formula", "((x₁+x₂)/2, (y₁+y₂)/2)", "Midpoint of a line segment: average each coordinate of the endpoints.", ["distance formula", "section formula", "centroid"]),
        ("Slope formula", "m = (y₂-y₁)/(x₂-x₁)", "Slope of a line through two points equals rise over run.", ["distance", "midpoint", "intercept"]),
        ("Slope-intercept form", "y = mx + c", "Slope-intercept form of a line where m is slope and c is y-intercept.", ["point-slope", "two-point", "general"]),
        ("Point-slope form", "y - y₁ = m(x - x₁)", "Point-slope form: a line with slope m passing through (x₁, y₁).", ["slope-intercept", "two-point", "intercept"]),
        ("General form", "Ax + By + C = 0", "General form of a line: Ax + By + C = 0 where A, B not both zero.", ["normal form", "intercept form", "parametric"]),
        ("Circle equation", "(x-h)² + (y-k)² = r²", "Equation of a circle with centre (h,k) and radius r.", ["ellipse", "parabola", "hyperbola"]),
        ("Parabola", "y² = 4ax (rightward)", "Standard parabola y² = 4ax has vertex at origin, focus at (a, 0), directrix x = -a.", ["circle", "ellipse", "hyperbola"]),
        ("Ellipse", "x²/a² + y²/b² = 1", "Standard ellipse centred at origin with semi-major a and semi-minor b axes.", ["circle", "parabola", "hyperbola"]),
        ("Hyperbola", "x²/a² - y²/b² = 1", "Standard hyperbola centred at origin: difference of squared coordinates equals 1.", ["circle", "parabola", "ellipse"]),
    ],
}

NUMERIC_POOL: dict[str, list[tuple[int, str]]] = {
    "MECH":   [(10, "Approximate g (m/s²) at sea level?"),
               (3, "Number of Newton's laws of motion?"),
               (1, "Number of dimensions in 1D motion?")],
    "THERMO": [(0, "Absolute zero on the Celsius scale (rounded down to nearest integer)?"),
               (273, "Approximate value of 0°C in Kelvin?"),
               (100, "Boiling point of water at 1 atm in °C?")],
    "ELEC":   [(1, "Charge of an electron in units of e?"),
               (3, "Number of components in standard RLC circuit?"),
               (50, "Standard mains AC frequency in Hz (India)?")],
    "PCHEM":  [(7, "pH of pure water at 25°C?"),
               (1, "Charge on a hydrogen ion in units of e?"),
               (8, "Atomic number of oxygen?")],
    "OCHEM":  [(6, "Number of carbon atoms in benzene?"),
               (1, "Bond order in C-H sigma bond?"),
               (4, "Number of bonds carbon typically forms?")],
    "CALC":   [(0, "Derivative of any constant?"),
               (1, "Derivative of x?"),
               (2, "Highest power of x in d/dx(x³) (after differentiation)?")],
    "COORD":  [(2, "Number of dimensions in 2D coordinate plane?"),
               (4, "Number of quadrants in the Cartesian plane?"),
               (3, "Number of points needed to define a unique circle?")],
}

DECIMAL_POOL: dict[str, list[tuple[float, float, str, str]]] = {
    "MECH":   [(9.81, 0.05, "m/s²", "Standard acceleration due to gravity at Earth's surface?"),
               (3.14, 0.01, "rad",  "Approximate value of π?")],
    "THERMO": [(8.314, 0.01, "J/(mol·K)", "Universal gas constant R?"),
               (273.15, 0.01, "K", "Triple point of water in K?")],
    "ELEC":   [(1.602, 0.005, "× 10⁻¹⁹ C", "Magnitude of electron charge in 10⁻¹⁹ coulombs?"),
               (8.99, 0.05, "× 10⁹ N·m²/C²", "Coulomb constant in 10⁹ N·m²/C²?")],
    "PCHEM":  [(6.022, 0.005, "× 10²³", "Avogadro's number?"),
               (22.4, 0.1, "L", "Molar volume of an ideal gas at STP?")],
    "OCHEM":  [(78.0, 1.0, "g/mol", "Molecular mass of benzene?"),
               (46.0, 1.0, "g/mol", "Molecular mass of ethanol?")],
    "CALC":   [(2.718, 0.005, "", "Approximate value of Euler's number e?"),
               (1.414, 0.005, "", "Approximate value of √2?")],
    "COORD":  [(1.732, 0.005, "", "Approximate value of √3?"),
               (1.0, 0.01, "", "Slope of the line y = x?")],
}

RANGE_POOL: dict[str, list[tuple[float, float, str, str]]] = {
    "MECH":   [(9.78, 9.83, "m/s²", "Range of g across the Earth's surface?")],
    "THERMO": [(0, 100, "°C", "Liquid water range at 1 atm?")],
    "ELEC":   [(0, 230, "V", "Voltage range for Indian household AC (rms)?")],
    "PCHEM":  [(0, 14, "pH", "Standard pH scale range?")],
    "OCHEM":  [(0, 14, "pKa", "Typical organic-acid pKa range?")],
    "CALC":   [(-1, 1, "", "Range of sin x for real x?")],
    "COORD":  [(-1, 1, "", "Range of cos x for real x?")],
}

FORMULA_POOL: list[tuple[str, str]] = [
    ("v=u+a*t",        "Equation of motion (final velocity)."),
    ("F=m*a",          "Newton's second law."),
    ("PV=n*R*T",       "Ideal gas law."),
    ("F=k*q1*q2/r**2", "Coulomb's law."),
    ("E=h*f",          "Photon energy."),
    ("V=I*R",          "Ohm's law."),
    ("KE=0.5*m*v**2",  "Kinetic energy."),
    ("PE=m*g*h",       "Gravitational potential energy near Earth."),
]

SEQUENCING_POOL: dict[str, list[list[str]]] = {
    "MECH":   [["At rest", "Accelerating", "Constant velocity", "Decelerating", "At rest"]],
    "THERMO": [["Solid", "Melting", "Liquid", "Vaporising", "Gas"]],
    "ELEC":   [["Switch off", "Charge capacitor", "Switch on", "Discharge", "Steady state"]],
    "PCHEM":  [["Reactants", "Activated complex", "Products", "Catalysed pathway"]],
    "OCHEM":  [["Methane", "Ethane", "Propane", "Butane", "Pentane"]],
    "CALC":   [["Define f", "Compute lim", "Differentiate", "Integrate"]],
    "COORD":  [["Plot point", "Compute distance", "Compute midpoint", "Compute slope"]],
}

CLASSIFICATION_POOL: dict[str, dict] = {
    "MECH":   {"categories": ["Vector", "Scalar"],
               "items": [{"text": "Velocity", "category": "Vector"},
                         {"text": "Force", "category": "Vector"},
                         {"text": "Mass", "category": "Scalar"},
                         {"text": "Energy", "category": "Scalar"}]},
    "THERMO": {"categories": ["Intensive", "Extensive"],
               "items": [{"text": "Temperature", "category": "Intensive"},
                         {"text": "Pressure", "category": "Intensive"},
                         {"text": "Volume", "category": "Extensive"},
                         {"text": "Internal energy", "category": "Extensive"}]},
    "ELEC":   {"categories": ["Conductor", "Insulator"],
               "items": [{"text": "Copper", "category": "Conductor"},
                         {"text": "Aluminium", "category": "Conductor"},
                         {"text": "Glass", "category": "Insulator"},
                         {"text": "Rubber", "category": "Insulator"}]},
    "PCHEM":  {"categories": ["Acid", "Base"],
               "items": [{"text": "HCl", "category": "Acid"},
                         {"text": "H₂SO₄", "category": "Acid"},
                         {"text": "NaOH", "category": "Base"},
                         {"text": "KOH", "category": "Base"}]},
    "OCHEM":  {"categories": ["Saturated", "Unsaturated"],
               "items": [{"text": "Methane", "category": "Saturated"},
                         {"text": "Ethane", "category": "Saturated"},
                         {"text": "Ethene", "category": "Unsaturated"},
                         {"text": "Ethyne", "category": "Unsaturated"}]},
    "CALC":   {"categories": ["Continuous", "Discontinuous"],
               "items": [{"text": "x²", "category": "Continuous"},
                         {"text": "sin x", "category": "Continuous"},
                         {"text": "1/x", "category": "Discontinuous"},
                         {"text": "Heaviside step", "category": "Discontinuous"}]},
    "COORD":  {"categories": ["Conic", "Linear"],
               "items": [{"text": "Circle", "category": "Conic"},
                         {"text": "Ellipse", "category": "Conic"},
                         {"text": "Line y = mx + c", "category": "Linear"},
                         {"text": "y = 0 (x-axis)", "category": "Linear"}]},
}

CLOZE_POOL: dict[str, tuple[str, list[list[str]]]] = {
    "MECH":   ("Newton's first law states that an object remains [BLANK] or moves with [BLANK] velocity unless acted on by [BLANK].",
               [["at rest"], ["constant", "uniform"], ["an unbalanced force", "external force"]]),
    "THERMO": ("The first law of thermodynamics states ΔU = [BLANK] - [BLANK]; for an isothermal process [BLANK] is constant.",
               [["Q", "heat added"], ["W", "work done"], ["temperature", "T"]]),
    "ELEC":   ("Coulomb's law states force is [BLANK] to product of charges and [BLANK] to square of distance; constant of proportionality is [BLANK].",
               [["proportional", "directly proportional"], ["inversely proportional"], ["k", "1/(4πε₀)"]]),
    "PCHEM":  ("Le Chatelier's principle says a system at [BLANK] shifts to oppose any [BLANK]; this is used to predict effects of changing [BLANK].",
               [["equilibrium"], ["change", "stress"], ["temperature", "concentration", "pressure"]]),
    "OCHEM":  ("Markovnikov's rule predicts H of HX adds to the carbon with [BLANK] H atoms; the [BLANK] carbocation forms first; reverse is called [BLANK].",
               [["more"], ["more stable", "tertiary"], ["anti-Markovnikov"]]),
    "CALC":   ("The fundamental theorem of calculus states ∫_a^b [BLANK] dx = [BLANK] - [BLANK].",
               [["f'(x)"], ["f(b)"], ["f(a)"]]),
    "COORD":  ("Equation of a circle with centre (h, k) and radius r is [BLANK]; it has [BLANK] independent parameters; circumference is [BLANK].",
               [["(x-h)² + (y-k)² = r²"], ["3", "three"], ["2πr"]]),
}

MAP_POOL: list[tuple[str, float, float]] = [
    ("IIT Bombay", 19.13, 72.91),
    ("IIT Delhi", 28.55, 77.19),
    ("IIT Kanpur", 26.51, 80.23),
    ("IIT Madras", 12.99, 80.24),
    ("IIT Kharagpur", 22.32, 87.31),
    ("IIT Roorkee", 29.86, 77.89),
    ("IIT Guwahati", 26.19, 91.69),
    ("IIT Hyderabad", 17.59, 78.12),
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
