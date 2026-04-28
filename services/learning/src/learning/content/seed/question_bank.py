"""Real exam-prep question bank — single source of truth for the
local-dev seed.

20 hand-authored MCQs per topic across all 24 catalog topics (480 total).
Both the Content alembic seed (003) and the Quiz golang-migrate seed
(004) consume this module — Content imports it directly; Quiz uses a
generator script that emits VALUES INTO the SQL migration.

Difficulty band per question (`b` parameter for the IRT model):
  - Conceptual recall    → b = -1.5 / -1.0  (easy)
  - Applied reasoning    → b = -0.5 / 0.0   (medium)
  - Multi-step / synthesis → b = 0.5 / 1.0 / 1.5  (hard)

Each question has exactly 4 choices and one `correct_idx` ∈ {0..3}.
Distractors are designed to be plausible — students who skim the
question (or recall a related-but-wrong fact) should be tempted by them.

Topic ids must match catalog migration 002 + 007 (so the cascading
dropdown on /questions/new works). The mapping lives in
TOPIC_QUESTIONS keyed by canonical title.
"""

from __future__ import annotations

from typing import TypedDict


class _Q(TypedDict):
    stem: str
    choices: list[str]
    correct_idx: int
    difficulty_b: float


# ─────────────────────────────────────────────────────────────────────────
# JEE Main
# ─────────────────────────────────────────────────────────────────────────

_MECHANICS: list[_Q] = [
    {
        "stem": "A body is moving with uniform velocity. The net force on it is:",
        "choices": ["Zero", "Equal to its weight", "Equal to mass × velocity", "Maximum at the centre"],
        "correct_idx": 0,
        "difficulty_b": -1.5,
    },
    {
        "stem": "Newton's second law of motion expresses force as the rate of change of:",
        "choices": ["Velocity", "Momentum", "Kinetic energy", "Displacement"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "The SI unit of impulse is:",
        "choices": ["N·m", "N·s", "kg·m/s²", "J/s"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "A ball thrown vertically upward returns to the thrower's hand with:",
        "choices": [
            "The same speed as initial",
            "Higher speed than initial",
            "Lower speed than initial (in absence of air resistance)",
            "Zero speed",
        ],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The acceleration due to gravity (g) on the surface of the Earth depends on:",
        "choices": [
            "Mass of the falling object",
            "Volume of the falling object",
            "Mass of the Earth and the distance from its centre",
            "Air resistance",
        ],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "A particle moves in a circle of radius r with constant speed v. The magnitude of its centripetal acceleration is:",
        "choices": ["v²/r", "v/r", "v²·r", "r/v²"],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "If the kinetic energy of a body is doubled, its momentum becomes:",
        "choices": ["Double", "√2 times", "Four times", "Half"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The work done by a centripetal force on a body moving in a circle is:",
        "choices": ["Always positive", "Always negative", "Zero", "Equal to kinetic energy"],
        "correct_idx": 2,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Two bodies of masses m and 4m have equal kinetic energies. The ratio of their momenta is:",
        "choices": ["1 : 4", "1 : 2", "2 : 1", "4 : 1"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "A 2 kg block slides down a frictionless 30° incline of length 10 m. Speed at the bottom is approximately (g = 10 m/s²):",
        "choices": ["7 m/s", "10 m/s", "14 m/s", "20 m/s"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Conservation of linear momentum holds when:",
        "choices": [
            "The system is isolated from external forces",
            "Internal forces are zero",
            "The system is at rest",
            "The kinetic energy is constant",
        ],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The moment of inertia of a thin uniform rod of mass M and length L about an axis through its centre and perpendicular to its length is:",
        "choices": ["ML²/12", "ML²/3", "ML²/6", "ML²/2"],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Angular momentum is conserved when:",
        "choices": [
            "External torque is zero",
            "External force is zero",
            "Rotational kinetic energy is zero",
            "Linear momentum is zero",
        ],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "A satellite orbits the Earth in a circular orbit at altitude h. If h equals the Earth's radius R, the orbital speed is approximately:",
        "choices": ["√(gR)", "√(gR/2)", "√(2gR)", "gR"],
        "correct_idx": 1,
        "difficulty_b": 1.0,
    },
    {
        "stem": "The escape velocity from the Earth's surface is approximately:",
        "choices": ["7.9 km/s", "11.2 km/s", "8.0 km/s", "15.0 km/s"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "For simple harmonic motion of period T, the time taken to go from equilibrium to maximum displacement is:",
        "choices": ["T/2", "T/4", "T/8", "T"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "A pendulum's time period on the Moon (g_moon ≈ g/6) compared to Earth is:",
        "choices": ["6 times", "√6 times", "1/6 times", "Same"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Two blocks of mass m each are connected by a light string and pulled with force F on a frictionless surface. Tension in the string is:",
        "choices": ["F", "F/2", "2F", "Zero"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "A bullet of mass 10 g moving at 400 m/s embeds in a 1.99 kg block at rest. Final speed of bullet+block (perfectly inelastic collision) is:",
        "choices": ["1 m/s", "2 m/s", "4 m/s", "10 m/s"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Friction coefficient μ between a block and surface is 0.4. The angle of repose is approximately:",
        "choices": ["18°", "22°", "30°", "45°"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
]

_THERMODYNAMICS: list[_Q] = [
    {
        "stem": "The first law of thermodynamics is a statement of conservation of:",
        "choices": ["Mass", "Energy", "Charge", "Momentum"],
        "correct_idx": 1,
        "difficulty_b": -1.5,
    },
    {
        "stem": "An adiabatic process is one in which:",
        "choices": [
            "Temperature is constant",
            "Pressure is constant",
            "Heat exchange with surroundings is zero",
            "Work done is zero",
        ],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "An isothermal process for an ideal gas keeps which quantity constant?",
        "choices": ["Pressure", "Volume", "Temperature", "Internal energy and temperature"],
        "correct_idx": 3,
        "difficulty_b": -0.5,
    },
    {
        "stem": "For an ideal gas undergoing isothermal expansion, ΔU is:",
        "choices": ["Positive", "Negative", "Zero", "Equal to W"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Entropy of an isolated system in a spontaneous process:",
        "choices": ["Decreases", "Increases", "Stays constant", "First decreases then increases"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Efficiency of a Carnot engine working between 400 K and 300 K is:",
        "choices": ["25%", "33%", "50%", "75%"],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The molar heat capacity at constant pressure (Cp) and constant volume (Cv) of an ideal gas obey:",
        "choices": ["Cp = Cv", "Cp − Cv = R", "Cp + Cv = R", "Cp · Cv = R"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The ratio Cp/Cv for a monatomic ideal gas is:",
        "choices": ["1.40", "1.67", "1.33", "1.00"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "In a cyclic process, the net work done equals:",
        "choices": [
            "Change in internal energy",
            "Heat absorbed",
            "Zero",
            "Heat rejected",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Two moles of an ideal gas at 300 K do 2400 J of work in an isothermal expansion. Heat absorbed is:",
        "choices": ["0 J", "1200 J", "2400 J", "4800 J"],
        "correct_idx": 2,
        "difficulty_b": 0.5,
    },
    {
        "stem": "The temperature at which a gas would have zero volume (extrapolated) is:",
        "choices": ["0°C", "100°C", "−273.15°C", "−100°C"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "A heat engine takes in 1000 J and rejects 600 J. Its efficiency is:",
        "choices": ["20%", "40%", "60%", "100%"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Coefficient of performance (COP) of a refrigerator is defined as:",
        "choices": [
            "W / Q_cold",
            "Q_cold / W",
            "Q_hot / W",
            "Q_cold / Q_hot",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Black-body radiation follows which law for total emissive power?",
        "choices": ["Wien's law", "Stefan–Boltzmann law", "Planck's law", "Boyle's law"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Wien's displacement law relates the wavelength of peak emission to:",
        "choices": [
            "Volume of the body",
            "Density of the body",
            "Absolute temperature (inversely)",
            "Pressure of the body",
        ],
        "correct_idx": 2,
        "difficulty_b": 0.5,
    },
    {
        "stem": "The internal energy of an ideal gas depends only on:",
        "choices": ["Pressure", "Volume", "Temperature", "Mass"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "For a reversible isothermal expansion of n moles of an ideal gas from V₁ to V₂, the work done is:",
        "choices": [
            "nRT ln(V₂/V₁)",
            "nRT (V₂ − V₁)",
            "nR (T₂ − T₁)",
            "P (V₂ − V₁)",
        ],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Specific heat at constant pressure of water (J/kg·K) is approximately:",
        "choices": ["1000", "2100", "4186", "8400"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "If the temperature of a black body doubles, its radiated power becomes:",
        "choices": ["2 times", "4 times", "8 times", "16 times"],
        "correct_idx": 3,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Mode of heat transfer that does NOT require a medium is:",
        "choices": ["Conduction", "Convection", "Radiation", "All require a medium"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
]

_ELECTROSTATICS: list[_Q] = [
    {
        "stem": "Coulomb's force between two point charges varies with distance r as:",
        "choices": ["1/r", "1/r²", "1/r³", "r"],
        "correct_idx": 1,
        "difficulty_b": -1.5,
    },
    {
        "stem": "SI unit of electric field is:",
        "choices": ["N/C", "V/m", "Both N/C and V/m", "C/N"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Electric potential at the centre of a uniformly charged spherical shell of radius R, charge Q, is:",
        "choices": ["Zero", "kQ/R", "kQ/R²", "kQ/(2R)"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "The electric field inside a hollow conductor in electrostatic equilibrium is:",
        "choices": [
            "Equal to the surface field",
            "Half the surface field",
            "Zero",
            "Maximum at the centre",
        ],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Capacitance of a parallel-plate capacitor is doubled if:",
        "choices": [
            "Plate area is halved",
            "Plate separation is halved",
            "Voltage is doubled",
            "Charge is doubled",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Two capacitors of 2 μF and 3 μF in parallel have an equivalent capacitance of:",
        "choices": ["1.2 μF", "5 μF", "6 μF", "1 μF"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Same two capacitors (2 μF, 3 μF) in series give an equivalent capacitance of:",
        "choices": ["1.2 μF", "5 μF", "6 μF", "0.83 μF"],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Energy stored in a capacitor C charged to voltage V is:",
        "choices": ["CV", "CV²", "½ CV²", "C/V"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Gauss's law in electrostatics relates the flux of E through a closed surface to:",
        "choices": [
            "The total mass enclosed",
            "The total charge enclosed divided by ε₀",
            "The product of E and area",
            "The potential at the surface",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The electric dipole moment p is defined as:",
        "choices": ["q × r", "q / r", "qE", "E / q"],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The dimensional formula of electric flux is:",
        "choices": ["[V·m]", "[N·m²/C]", "[C/m²]", "Both V·m and N·m²/C"],
        "correct_idx": 3,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Field due to an infinite line charge of linear density λ at distance r is:",
        "choices": ["λ/(2πε₀r)", "λ/(4πε₀r)", "λ/(4πε₀r²)", "λ·r"],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Inside a dielectric of constant K, electric field becomes ____ compared to vacuum:",
        "choices": ["K times stronger", "1/K times", "Unchanged", "K² times"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "When a dielectric is inserted between the plates of a charged isolated capacitor, the voltage:",
        "choices": ["Increases", "Decreases", "Stays the same", "First increases then decreases"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Equipotential surfaces around a positive point charge are:",
        "choices": [
            "Concentric spheres",
            "Parallel planes",
            "Cylinders",
            "Hyperboloids",
        ],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Work done in moving a charge between two equipotential points is:",
        "choices": ["q·V", "Maximum", "Minimum", "Zero"],
        "correct_idx": 3,
        "difficulty_b": -0.5,
    },
    {
        "stem": "1 electron-volt (eV) equals approximately:",
        "choices": ["1.6 × 10⁻¹⁹ J", "1.6 × 10⁻¹⁶ J", "1.6 × 10⁻¹² J", "1.6 × 10⁻⁹ J"],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "If the distance between two point charges is doubled, the electrostatic force becomes:",
        "choices": ["Double", "Half", "One-fourth", "Four times"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "A charge +Q at the centre of a cube. Total electric flux through one face is:",
        "choices": ["Q/ε₀", "Q/(6ε₀)", "Q/(2ε₀)", "Zero"],
        "correct_idx": 1,
        "difficulty_b": 1.0,
    },
    {
        "stem": "The field on the axis of an electric dipole, far from it, varies as:",
        "choices": ["1/r", "1/r²", "1/r³", "1/r⁴"],
        "correct_idx": 2,
        "difficulty_b": 0.5,
    },
]

_PHYSICAL_CHEMISTRY: list[_Q] = [
    {
        "stem": "The number of moles in 22 g of CO₂ (molar mass 44 g/mol) is:",
        "choices": ["0.25", "0.5", "1", "2"],
        "correct_idx": 1,
        "difficulty_b": -1.5,
    },
    {
        "stem": "Avogadro's number is approximately:",
        "choices": ["6.022 × 10²²", "6.022 × 10²³", "6.022 × 10²⁴", "6.022 × 10²¹"],
        "correct_idx": 1,
        "difficulty_b": -1.5,
    },
    {
        "stem": "The pH of a 0.001 M HCl solution is:",
        "choices": ["1", "2", "3", "4"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Which has the maximum number of atoms? (1 mole each)",
        "choices": ["H₂O", "CO₂", "NH₃", "CH₄"],
        "correct_idx": 3,
        "difficulty_b": 0.0,
    },
    {
        "stem": "For an exothermic reaction, ΔH is:",
        "choices": ["Positive", "Negative", "Zero", "Cannot be determined"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "The Gibbs free energy change ΔG for a spontaneous reaction at constant T, P is:",
        "choices": ["Positive", "Negative", "Zero", "Equal to ΔH"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The hybridization of carbon in methane (CH₄) is:",
        "choices": ["sp", "sp²", "sp³", "sp³d"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Which of the following has a triple bond?",
        "choices": ["O₂", "N₂", "Cl₂", "H₂"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "The principal quantum number n indicates:",
        "choices": [
            "Shape of the orbital",
            "Orientation of the orbital",
            "Energy and size of the orbital",
            "Spin of the electron",
        ],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Maximum number of electrons in the L shell (n = 2) is:",
        "choices": ["2", "6", "8", "18"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Equilibrium constant Kc for the reaction H₂ + I₂ ⇌ 2HI; if [H₂] = 0.1, [I₂] = 0.2, [HI] = 0.4, Kc =",
        "choices": ["0.8", "8", "16", "0.5"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Le Chatelier's principle predicts that increasing pressure on N₂(g) + 3H₂(g) ⇌ 2NH₃(g) shifts equilibrium toward:",
        "choices": ["Reactants", "Products", "No shift", "Both equally"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Which buffer is best for pH ≈ 4.7? (pKa values: acetic 4.76, ammonium 9.25, phosphoric 7.2)",
        "choices": [
            "Acetic acid / acetate",
            "NH₄⁺ / NH₃",
            "H₂PO₄⁻ / HPO₄²⁻",
            "HCl / NaCl",
        ],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Order of a reaction can be determined from:",
        "choices": [
            "The balanced equation",
            "Experimental data only",
            "The molar masses",
            "Standard enthalpies",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Half-life of a first-order reaction is:",
        "choices": [
            "Independent of initial concentration",
            "Proportional to initial concentration",
            "Inversely proportional to initial concentration",
            "Proportional to concentration squared",
        ],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The standard reduction potential of Cu²⁺/Cu is +0.34 V. This means:",
        "choices": [
            "Cu is easily oxidised",
            "Cu²⁺ is more readily reduced than H⁺",
            "Cu reacts vigorously with water",
            "Cu is the strongest reducing agent",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Faraday's constant is approximately:",
        "choices": ["96485 C/mol", "9648.5 C/mol", "1.6 × 10⁻¹⁹ C", "6.022 × 10²³ C/mol"],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Raoult's law applies to:",
        "choices": [
            "Ideal solutions only",
            "Strongly ionic solutions",
            "Real gases",
            "Solid mixtures",
        ],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Osmotic pressure of a 0.1 M sugar solution at 300 K is approximately (R = 0.0821 L·atm/mol·K):",
        "choices": ["0.246 atm", "2.46 atm", "24.6 atm", "246 atm"],
        "correct_idx": 1,
        "difficulty_b": 1.0,
    },
    {
        "stem": "Adsorption of a gas on a solid surface is generally:",
        "choices": ["Endothermic", "Exothermic", "Always zero ΔH", "Equal to bulk reaction"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
]

_ORGANIC_CHEMISTRY: list[_Q] = [
    {
        "stem": "The general formula of alkanes is:",
        "choices": ["CₙH₂ₙ", "CₙH₂ₙ₊₂", "CₙH₂ₙ₋₂", "CₙHₙ"],
        "correct_idx": 1,
        "difficulty_b": -1.5,
    },
    {
        "stem": "IUPAC name of (CH₃)₂CHCH₃ is:",
        "choices": ["n-Butane", "Iso-butane (2-methylpropane)", "Pentane", "Propane"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Markovnikov's rule applies to:",
        "choices": [
            "Addition of HX to symmetric alkenes",
            "Addition of HX to unsymmetric alkenes",
            "Free-radical halogenation of alkanes",
            "Saytzeff elimination",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Number of structural isomers of C₄H₁₀ is:",
        "choices": ["1", "2", "3", "4"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Aromatic compounds satisfy Hückel's rule with how many π electrons?",
        "choices": ["4n", "4n + 1", "4n + 2", "4n + 3"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Benzene undergoes which type of reactions most readily?",
        "choices": [
            "Electrophilic addition",
            "Electrophilic substitution",
            "Nucleophilic substitution",
            "Free-radical addition",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "An -OH group attached to an sp² carbon is found in:",
        "choices": ["Alcohols", "Phenols", "Ethers", "Aldehydes"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Williamson synthesis is used to prepare:",
        "choices": ["Alcohols", "Ethers", "Esters", "Amines"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The product of acid-catalysed hydration of propene (Markovnikov) is:",
        "choices": ["1-propanol", "2-propanol", "Propanal", "Acetone"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Tollens' test is used to detect:",
        "choices": ["Alcohols", "Aldehydes", "Ketones", "Carboxylic acids"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The simplest carboxylic acid is:",
        "choices": ["Acetic acid", "Formic acid", "Propanoic acid", "Benzoic acid"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Acid strength order:",
        "choices": [
            "HCOOH > CH₃COOH > C₂H₅COOH",
            "C₂H₅COOH > CH₃COOH > HCOOH",
            "CH₃COOH > HCOOH > C₂H₅COOH",
            "All have equal acidity",
        ],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "SN1 reactions are favoured by:",
        "choices": [
            "Tertiary substrates and polar protic solvents",
            "Primary substrates and polar aprotic solvents",
            "Strong nucleophiles",
            "Anhydrous nonpolar solvents",
        ],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "E2 elimination is favoured by:",
        "choices": [
            "Bulky bases and high temperatures",
            "Weak nucleophiles",
            "Tertiary alkyl halides only",
            "Acidic solvents",
        ],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Reduction of a ketone with NaBH₄ gives:",
        "choices": ["Primary alcohol", "Secondary alcohol", "Tertiary alcohol", "Aldehyde"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Aldol condensation occurs between two molecules of:",
        "choices": [
            "Aldehydes/ketones with α-hydrogens",
            "Carboxylic acids",
            "Alcohols",
            "Aromatic ethers",
        ],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Friedel-Crafts alkylation introduces:",
        "choices": ["–OH", "–NH₂", "Alkyl group on aromatic ring", "–COOH"],
        "correct_idx": 2,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The order of stability of carbocations is:",
        "choices": [
            "Methyl > Primary > Secondary > Tertiary",
            "Tertiary > Secondary > Primary > Methyl",
            "Primary > Secondary > Tertiary > Methyl",
            "All equally stable",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The functional group in acetone (CH₃COCH₃) is:",
        "choices": ["Aldehyde", "Ketone", "Ester", "Ether"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Optical isomerism arises in molecules that:",
        "choices": [
            "Have a plane of symmetry",
            "Lack any chiral centre",
            "Contain a chiral (stereogenic) centre and lack internal symmetry",
            "Are aromatic",
        ],
        "correct_idx": 2,
        "difficulty_b": 0.5,
    },
]

_CALCULUS: list[_Q] = [
    {
        "stem": "The derivative of sin x with respect to x is:",
        "choices": ["cos x", "−cos x", "−sin x", "tan x"],
        "correct_idx": 0,
        "difficulty_b": -1.5,
    },
    {
        "stem": "lim(x→0) (sin x)/x equals:",
        "choices": ["0", "1", "∞", "Does not exist"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "∫(1/x) dx equals:",
        "choices": ["x⁻²", "ln|x| + C", "1/(x²) + C", "x ln x"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "If f(x) = x³ − 3x, the critical points are at x =",
        "choices": ["0 only", "±1", "±√3", "±3"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The Mean Value Theorem requires f(x) to be:",
        "choices": [
            "Continuous on [a,b] only",
            "Differentiable on (a,b) only",
            "Continuous on [a,b] and differentiable on (a,b)",
            "Linear",
        ],
        "correct_idx": 2,
        "difficulty_b": 0.0,
    },
    {
        "stem": "d/dx (eˣ) is:",
        "choices": ["eˣ", "x eˣ⁻¹", "eˣ ln x", "1/eˣ"],
        "correct_idx": 0,
        "difficulty_b": -1.5,
    },
    {
        "stem": "∫ from 0 to π/2 of sin x dx equals:",
        "choices": ["0", "1", "π/2", "−1"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "If y = ln(sec x), then dy/dx is:",
        "choices": ["tan x", "sec x", "sec x · tan x", "cot x"],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "The function f(x) = x² has its minimum at:",
        "choices": ["x = −1", "x = 0", "x = 1", "x = ∞"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "The area enclosed between y = x² and y = x is:",
        "choices": ["1/6", "1/4", "1/3", "1/2"],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "lim(x→∞) (1 + 1/x)ˣ equals:",
        "choices": ["1", "0", "e", "∞"],
        "correct_idx": 2,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The Taylor series of cos x around x = 0 starts with:",
        "choices": [
            "x − x³/6 + …",
            "1 − x²/2 + x⁴/24 − …",
            "1 + x + x²/2 + …",
            "x + x³/3 + …",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Volume of revolution about the x-axis of f(x) on [a,b] equals:",
        "choices": [
            "∫ f(x) dx",
            "π ∫ [f(x)]² dx",
            "2π ∫ x f(x) dx",
            "∫ √(1 + [f'(x)]²) dx",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "If ∫f(x)dx = F(x) + C, then by the Fundamental Theorem ∫ from a to b f(x) dx is:",
        "choices": ["F(b) − F(a)", "F(a) − F(b)", "F(b) + F(a)", "F'(b)"],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "If f is continuous on [a,b], then the average value of f on [a,b] is:",
        "choices": [
            "(f(a) + f(b))/2",
            "(1/(b−a)) ∫ from a to b f(x) dx",
            "f((a+b)/2)",
            "max(f) − min(f)",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "L'Hôpital's rule applies to indeterminate forms of type:",
        "choices": ["0/0 only", "∞/∞ only", "0/0 and ∞/∞", "Any limit"],
        "correct_idx": 2,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The implicit derivative of x² + y² = 1 is dy/dx =",
        "choices": ["−x/y", "x/y", "−y/x", "y/x"],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "f(x) = x³ is:",
        "choices": [
            "Monotonically increasing everywhere",
            "Monotonically decreasing everywhere",
            "Has a local maximum at 0",
            "Has a local minimum at 0",
        ],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Integration by parts uses the formula:",
        "choices": [
            "∫u dv = uv − ∫v du",
            "∫u dv = uv + ∫v du",
            "∫u dv = u + v",
            "∫u dv = u/v",
        ],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The integral ∫ eˣ sin x dx equals:",
        "choices": [
            "(eˣ/2)(sin x − cos x) + C",
            "eˣ cos x + C",
            "−eˣ sin x + C",
            "eˣ sin x + C",
        ],
        "correct_idx": 0,
        "difficulty_b": 1.0,
    },
]

_COORDINATE_GEOMETRY: list[_Q] = [
    {
        "stem": "Distance between (1, 2) and (4, 6) is:",
        "choices": ["3", "5", "7", "√25"],
        "correct_idx": 1,
        "difficulty_b": -1.5,
    },
    {
        "stem": "Slope of the line passing through (2, 3) and (4, 7) is:",
        "choices": ["1", "2", "3", "4"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Equation of a line with slope m and y-intercept c is:",
        "choices": ["y = mx + c", "y = mx − c", "y = c − mx", "y = m + cx"],
        "correct_idx": 0,
        "difficulty_b": -1.5,
    },
    {
        "stem": "Equation of a circle of radius 3 centred at the origin is:",
        "choices": ["x² + y² = 3", "x² + y² = 9", "x + y = 3", "x² + y² = √3"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "The locus of points equidistant from two given points is the:",
        "choices": [
            "Line joining them",
            "Perpendicular bisector of the segment between them",
            "Circle through both points",
            "Midpoint of the segment",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The eccentricity of a circle is:",
        "choices": ["0", "1", "Less than 1", "Greater than 1"],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "For an ellipse x²/a² + y²/b² = 1 (a > b), the eccentricity e =",
        "choices": [
            "√(1 + b²/a²)",
            "√(1 − b²/a²)",
            "b/a",
            "a/b",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Equation of a parabola opening rightward with vertex at origin and focus (a, 0) is:",
        "choices": ["y² = 4ax", "x² = 4ay", "y² = −4ax", "x² + y² = a²"],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The asymptotes of the hyperbola x²/a² − y²/b² = 1 are:",
        "choices": ["y = ±(a/b) x", "y = ±(b/a) x", "y = ±x", "y = ±a x"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Distance of the point (3, 4) from the origin is:",
        "choices": ["3", "4", "5", "7"],
        "correct_idx": 2,
        "difficulty_b": -1.5,
    },
    {
        "stem": "Two lines are perpendicular if the product of their slopes is:",
        "choices": ["1", "0", "−1", "Equal to 1/m"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The point (2, −3) lies in which quadrant?",
        "choices": ["I", "II", "III", "IV"],
        "correct_idx": 3,
        "difficulty_b": -1.5,
    },
    {
        "stem": "The line 3x + 4y = 12 has x-intercept and y-intercept:",
        "choices": ["(4, 3)", "(3, 4)", "(12, 12)", "(−4, −3)"],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Distance from the point (3, 4) to the line 4x + 3y = 12 is:",
        "choices": ["12/5", "0", "12", "1"],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "The midpoint of the segment from (1, 2) to (5, 8) is:",
        "choices": ["(2, 4)", "(3, 5)", "(6, 10)", "(4, 6)"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "The line 2x − y + 3 = 0 has slope:",
        "choices": ["−2", "2", "−1/2", "1/2"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "A circle x² + y² − 4x − 6y + 9 = 0 has its centre at:",
        "choices": ["(2, 3)", "(−2, −3)", "(4, 6)", "(−4, −6)"],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Eccentricity of the parabola y² = 4ax is:",
        "choices": ["0", "1", "2", "Less than 1"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Three points are collinear if the area of the triangle formed by them is:",
        "choices": ["Negative", "Positive", "Zero", "1"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The angle between the lines y = x and y = −x is:",
        "choices": ["30°", "45°", "60°", "90°"],
        "correct_idx": 3,
        "difficulty_b": -0.5,
    },
]

# ─────────────────────────────────────────────────────────────────────────
# NEET (Biology + adapted Physics/Chemistry)
# ─────────────────────────────────────────────────────────────────────────

_CELL_BIOLOGY: list[_Q] = [
    {
        "stem": "Powerhouse of the cell is:",
        "choices": ["Nucleus", "Mitochondrion", "Ribosome", "Golgi apparatus"],
        "correct_idx": 1,
        "difficulty_b": -1.5,
    },
    {
        "stem": "Site of protein synthesis in the cell is:",
        "choices": ["Lysosome", "Mitochondrion", "Ribosome", "Centrosome"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "The cell wall in plants is primarily made of:",
        "choices": ["Cellulose", "Chitin", "Peptidoglycan", "Phospholipid"],
        "correct_idx": 0,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Endoplasmic reticulum studded with ribosomes is called:",
        "choices": ["Smooth ER", "Rough ER", "Golgi", "Lysosome"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Genetic material in eukaryotic cells is enclosed in:",
        "choices": ["Cytoplasm", "Nucleus", "Vacuole", "Plasma membrane"],
        "correct_idx": 1,
        "difficulty_b": -1.5,
    },
    {
        "stem": "Mitochondria contain their own DNA, which is:",
        "choices": ["Linear", "Circular", "Single-stranded", "Absent"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Photosynthesis primarily takes place in:",
        "choices": ["Mitochondria", "Chloroplasts", "Ribosomes", "Lysosomes"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "The fluid mosaic model describes the structure of the:",
        "choices": ["Plasma membrane", "Nucleus", "Endoplasmic reticulum", "Cell wall"],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Stage of cell cycle where DNA is replicated is:",
        "choices": ["G1", "S", "G2", "M"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Mitosis produces:",
        "choices": [
            "Two haploid daughter cells",
            "Two diploid daughter cells (genetically identical)",
            "Four haploid daughter cells",
            "Four diploid daughter cells",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Meiosis differs from mitosis in that meiosis produces:",
        "choices": [
            "Identical diploid cells",
            "Four haploid genetically distinct gametes",
            "Two haploid clones",
            "No cell division at all",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The Golgi apparatus is involved in:",
        "choices": [
            "Lipid synthesis only",
            "Modification, packaging, and transport of proteins",
            "DNA replication",
            "ATP production",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Lysosomes are sometimes called the cell's:",
        "choices": ["Suicide bags", "Powerhouse", "Brain", "Skeleton"],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "A typical bacterium lacks a:",
        "choices": [
            "Cell wall",
            "Plasma membrane",
            "Membrane-bound nucleus",
            "Ribosomes",
        ],
        "correct_idx": 2,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Cytoskeleton elements include all of the following EXCEPT:",
        "choices": ["Microtubules", "Microfilaments", "Intermediate filaments", "Microvilli"],
        "correct_idx": 3,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Active transport across a membrane requires:",
        "choices": ["No energy", "ATP", "Concentration gradient only", "Osmosis"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Osmosis is the diffusion of:",
        "choices": [
            "Solute molecules",
            "Water across a semi-permeable membrane",
            "Gas molecules in air",
            "Ions in vacuum",
        ],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Centrioles play a key role in:",
        "choices": [
            "Photosynthesis",
            "Spindle fibre formation during cell division",
            "Lipid metabolism",
            "DNA replication",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Plant cells, but not animal cells, typically possess:",
        "choices": ["Nucleus", "Plasma membrane", "Large central vacuole and cell wall", "Mitochondria"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "An organelle absent in mature red blood cells (mammalian) is:",
        "choices": ["Plasma membrane", "Cytoplasm", "Nucleus", "Cytoskeleton"],
        "correct_idx": 2,
        "difficulty_b": 0.5,
    },
]

_GENETICS: list[_Q] = [
    {
        "stem": "Gregor Mendel is known as the father of:",
        "choices": ["Cell theory", "Genetics", "Evolution", "Microbiology"],
        "correct_idx": 1,
        "difficulty_b": -1.5,
    },
    {
        "stem": "DNA is composed of nucleotides, each containing a sugar, phosphate, and:",
        "choices": ["Amino acid", "Fatty acid", "Nitrogenous base", "Glucose"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "In DNA, adenine pairs with:",
        "choices": ["Cytosine", "Guanine", "Thymine", "Uracil"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "The number of chromosomes in a normal human somatic cell is:",
        "choices": ["23", "44", "46", "48"],
        "correct_idx": 2,
        "difficulty_b": -1.5,
    },
    {
        "stem": "Sex of a human child is determined by the:",
        "choices": [
            "X chromosome of the mother",
            "Y chromosome of the mother",
            "Sex chromosome contributed by the father",
            "Number of autosomes",
        ],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "An individual with genotype Aa for a single gene is called:",
        "choices": ["Homozygous dominant", "Homozygous recessive", "Heterozygous", "Hemizygous"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Mendel's law of segregation states that:",
        "choices": [
            "Each gamete carries both alleles for a trait",
            "Allele pairs separate during gamete formation",
            "Genes always assort independently",
            "Dominant alleles mask recessive alleles in gametes",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Phenotypic ratio of a typical Mendelian dihybrid cross is:",
        "choices": ["3:1", "1:1", "9:3:3:1", "1:2:1"],
        "correct_idx": 2,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Test cross involves crossing the unknown with:",
        "choices": [
            "A homozygous dominant individual",
            "A homozygous recessive individual",
            "A heterozygous individual",
            "Itself",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Sickle-cell anaemia is caused by a:",
        "choices": [
            "Frameshift mutation",
            "Point mutation in the β-globin gene",
            "Chromosomal deletion",
            "Trisomy",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Down syndrome is caused by:",
        "choices": [
            "Trisomy 18",
            "Trisomy 21",
            "Monosomy X",
            "An autosomal recessive mutation",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Codon table reads triplets in:",
        "choices": ["DNA", "tRNA", "mRNA", "rRNA"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "RNA differs from DNA in that RNA contains:",
        "choices": ["Deoxyribose and thymine", "Ribose and uracil", "Ribose and thymine", "Deoxyribose and uracil"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Transcription produces:",
        "choices": ["Proteins from mRNA", "DNA from RNA", "RNA from DNA", "Nucleotides from amino acids"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Number of amino acids encoded by 600 nucleotides of mRNA (assuming no UTRs) is:",
        "choices": ["100", "200", "300", "600"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "PCR (polymerase chain reaction) is used to:",
        "choices": [
            "Sequence DNA",
            "Amplify a specific DNA segment",
            "Translate mRNA",
            "Cleave DNA at specific sites",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Restriction enzymes are used in molecular biology to:",
        "choices": [
            "Synthesise DNA",
            "Cut DNA at specific recognition sequences",
            "Translate mRNA",
            "Replicate DNA in vivo",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Hardy-Weinberg equilibrium assumes:",
        "choices": [
            "Random mating, no mutation, no migration, no selection, large population",
            "Inbreeding and small population",
            "Strong selection pressure",
            "High mutation rates",
        ],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "The Y chromosome carries:",
        "choices": [
            "Only X-linked genes",
            "The SRY gene that triggers male development",
            "All autosomal genes",
            "No genes",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Gene therapy aims to:",
        "choices": [
            "Replace a defective gene with a functional copy",
            "Enhance ageing",
            "Sterilise pathogens",
            "Trigger random mutation",
        ],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
]

_MECHANICS_AND_WAVES: list[_Q] = [
    {
        "stem": "Frequency of a wave of period 0.5 s is:",
        "choices": ["0.5 Hz", "1 Hz", "2 Hz", "5 Hz"],
        "correct_idx": 2,
        "difficulty_b": -1.5,
    },
    {
        "stem": "Sound travels fastest in:",
        "choices": ["Air", "Water", "Steel", "Vacuum"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Doppler effect is the apparent change in:",
        "choices": [
            "Wavelength only",
            "Amplitude only",
            "Frequency due to relative motion of source and observer",
            "Speed of sound in different media",
        ],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "A pendulum's period depends on:",
        "choices": ["Mass of bob", "Length and gravitational acceleration", "Amplitude (large)", "Material of bob"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Resonance occurs when driving frequency equals:",
        "choices": [
            "Damping frequency",
            "Half the natural frequency",
            "The system's natural frequency",
            "Twice the natural frequency",
        ],
        "correct_idx": 2,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Speed of light in vacuum is approximately:",
        "choices": ["3 × 10⁶ m/s", "3 × 10⁸ m/s", "3 × 10¹⁰ m/s", "3 × 10⁵ m/s"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Transverse waves can travel through:",
        "choices": ["Solids only", "Liquids only", "Solids and surface of liquids", "Gases only"],
        "correct_idx": 2,
        "difficulty_b": 0.0,
    },
    {
        "stem": "In a stationary wave, the distance between two consecutive nodes is:",
        "choices": ["λ/4", "λ/2", "λ", "2λ"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Sound waves are:",
        "choices": ["Transverse", "Longitudinal", "Electromagnetic", "Surface"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Intensity of sound at distance r from a point source varies as:",
        "choices": ["1/r", "1/r²", "1/r³", "Constant"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The principle of superposition gives rise to:",
        "choices": ["Beats", "Interference", "Stationary waves", "All of these"],
        "correct_idx": 3,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Beat frequency between two sources of 256 Hz and 260 Hz is:",
        "choices": ["2 Hz", "4 Hz", "256 Hz", "516 Hz"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "An echo is heard distinctly when the reflected sound returns after at least:",
        "choices": ["0.01 s", "0.1 s", "1 s", "10 s"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The lowest frequency at which an organ pipe (open at both ends) of length L vibrates is:",
        "choices": ["v/(4L)", "v/(2L)", "v/L", "2v/L"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Wavelength of a sound wave of frequency 340 Hz in air (v = 340 m/s) is:",
        "choices": ["0.5 m", "1 m", "2 m", "10 m"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "When sound passes from air into water, its frequency:",
        "choices": ["Increases", "Decreases", "Stays the same", "Doubles"],
        "correct_idx": 2,
        "difficulty_b": 0.0,
    },
    {
        "stem": "A wave with displacement y = A sin(ωt − kx) travels in the:",
        "choices": ["Negative x direction", "Positive x direction", "Negative y direction", "Both directions"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The intensity level of a sound 100 times more intense than a reference sound differs by:",
        "choices": ["10 dB", "20 dB", "100 dB", "Unchanged"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Damped oscillation amplitude:",
        "choices": [
            "Stays constant",
            "Increases over time",
            "Decreases over time",
            "Oscillates randomly",
        ],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Two waves of equal amplitude travel in opposite directions along a string. The result is a:",
        "choices": ["Travelling wave", "Stationary wave", "Damped wave", "Pulse"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
]

_OPTICS: list[_Q] = [
    {
        "stem": "Refractive index of a medium is the ratio of speed of light in:",
        "choices": [
            "Medium to that in vacuum",
            "Vacuum to that in medium",
            "Air to that in water",
            "Glass to that in air",
        ],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Total internal reflection occurs when light passes from:",
        "choices": [
            "A rarer to a denser medium at any angle",
            "A denser to a rarer medium beyond the critical angle",
            "Air into vacuum",
            "Vacuum into air",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "A convex lens forms a real image only when the object is placed:",
        "choices": [
            "Between focus and lens",
            "At the focus",
            "Beyond the focal length",
            "Anywhere",
        ],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Focal length of a concave mirror is:",
        "choices": [
            "Half its radius of curvature",
            "Twice its radius of curvature",
            "Equal to its radius of curvature",
            "Independent of curvature",
        ],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Power of a lens of focal length 50 cm is:",
        "choices": ["+0.5 D", "+2 D", "+5 D", "+50 D"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Splitting of white light into its constituent colours by a prism is called:",
        "choices": ["Diffraction", "Reflection", "Dispersion", "Polarisation"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Young's double-slit experiment demonstrates the:",
        "choices": ["Particle nature of light", "Wave nature of light", "Speed of light", "Reflection of light"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The colour of light that is bent the LEAST by a glass prism is:",
        "choices": ["Violet", "Blue", "Green", "Red"],
        "correct_idx": 3,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Critical angle for a medium with refractive index 1.5 is approximately:",
        "choices": ["30°", "42°", "60°", "90°"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Plane mirror produces an image that is:",
        "choices": [
            "Real, inverted, and same size",
            "Virtual, erect, and same size",
            "Real, erect, magnified",
            "Virtual, inverted, diminished",
        ],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Diffraction is most prominent when the size of the obstacle is:",
        "choices": [
            "Much larger than wavelength",
            "Comparable to the wavelength of the wave",
            "Zero",
            "Independent of wavelength",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Polaroid lenses reduce glare by:",
        "choices": [
            "Refracting all light",
            "Polarising the light passing through them",
            "Diffracting the light",
            "Reflecting all wavelengths",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Lens formula in optics is:",
        "choices": [
            "1/f = 1/v − 1/u",
            "1/f = 1/v + 1/u",
            "f = u + v",
            "f = (u + v)/2",
        ],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Magnification of a lens is the ratio of:",
        "choices": [
            "Object distance to image distance",
            "Image height to object height",
            "Focal length to image distance",
            "Power to focal length",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Hypermetropia (far-sightedness) is corrected by:",
        "choices": ["Concave lens", "Convex lens", "Plano lens", "Bifocal cylindrical"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Myopia (near-sightedness) is corrected by:",
        "choices": ["Concave lens", "Convex lens", "Cylindrical lens", "Plano lens"],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The retina of a human eye corresponds to which part of a camera?",
        "choices": ["Lens", "Aperture", "Film/sensor", "Shutter"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Snell's law relates angles and refractive indices as:",
        "choices": [
            "sin θ₁/sin θ₂ = n₂/n₁",
            "sin θ₁/sin θ₂ = n₁/n₂",
            "tan θ₁ = tan θ₂",
            "θ₁ = θ₂",
        ],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Distance of distinct vision for a normal eye is about:",
        "choices": ["10 cm", "25 cm", "50 cm", "1 m"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The phenomenon responsible for the blue colour of the sky is:",
        "choices": ["Reflection", "Refraction", "Rayleigh scattering", "Total internal reflection"],
        "correct_idx": 2,
        "difficulty_b": 0.0,
    },
]

_INORGANIC_CHEMISTRY: list[_Q] = [
    {
        "stem": "Modern periodic law was formulated by:",
        "choices": ["Mendeleev", "Newlands", "Moseley", "Bohr"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Number of elements in the second period of the periodic table is:",
        "choices": ["2", "8", "10", "18"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Most reactive non-metal is:",
        "choices": ["Oxygen", "Nitrogen", "Fluorine", "Chlorine"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Most reactive alkali metal in Group 1 is:",
        "choices": ["Lithium", "Sodium", "Potassium", "Caesium"],
        "correct_idx": 3,
        "difficulty_b": 0.0,
    },
    {
        "stem": "An element with atomic number 17 belongs to:",
        "choices": ["Group 7 (halogens)", "Group 1 (alkali)", "Group 2 (alkaline earth)", "Group 18 (noble gas)"],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Noble gases have which valence-shell configuration?",
        "choices": ["ns² np⁶ (except He: 1s²)", "ns¹", "ns² np⁵", "ns² np²"],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Across a period, atomic radius generally:",
        "choices": ["Increases", "Decreases", "Stays the same", "First decreases then increases"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Electronegativity is highest for:",
        "choices": ["Fluorine", "Oxygen", "Nitrogen", "Chlorine"],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Common oxidation state of alkali metals is:",
        "choices": ["+1", "+2", "+3", "Variable"],
        "correct_idx": 0,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Bond formed between Na and Cl in NaCl is:",
        "choices": ["Covalent", "Ionic", "Metallic", "Hydrogen"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Hardness in water is mainly due to:",
        "choices": [
            "Carbonates of sodium and potassium",
            "Calcium and magnesium salts",
            "Silicates of aluminium",
            "Iron compounds only",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Aluminium is extracted by electrolysis of:",
        "choices": [
            "Aluminium chloride (AlCl₃)",
            "Pure alumina (Al₂O₃) dissolved in cryolite",
            "Bauxite ore directly",
            "Aluminium sulphate",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Coordination number of Na⁺ in NaCl crystal is:",
        "choices": ["4", "6", "8", "12"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Bleaching action of chlorine is due to:",
        "choices": ["Reduction", "Oxidation", "Hydrolysis", "Catalysis"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Plaster of Paris (CaSO₄·½H₂O) is obtained by heating gypsum to about:",
        "choices": ["100°C", "120°C", "200°C", "500°C"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Iron rusts when exposed to:",
        "choices": ["Pure dry oxygen", "Dry air", "Moist air (oxygen + water)", "Pure nitrogen"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Hydrogen has properties similar to both:",
        "choices": [
            "Group 1 and Group 17",
            "Group 2 and Group 18",
            "Group 13 and Group 14",
            "All groups",
        ],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Common salt in solution is best described as a:",
        "choices": ["Strong acid", "Strong base", "Neutral salt of HCl and NaOH", "Weak acid"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Ozone (O₃) absorbs which type of radiation?",
        "choices": ["Visible light", "Ultraviolet", "Infrared", "Microwave"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Aqua regia is a 3:1 mixture of:",
        "choices": [
            "HNO₃ : HCl",
            "HCl : HNO₃",
            "H₂SO₄ : HNO₃",
            "HCl : H₂SO₄",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
]

_ORGANIC_CHEMISTRY_NEET: list[_Q] = [
    {
        "stem": "Functional group in alcohols is:",
        "choices": ["−CHO", "−OH", "−COOH", "−NH₂"],
        "correct_idx": 1,
        "difficulty_b": -1.5,
    },
    {
        "stem": "Vinegar contains primarily:",
        "choices": ["Formic acid", "Acetic acid", "Citric acid", "Oxalic acid"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "The simplest aromatic hydrocarbon is:",
        "choices": ["Methane", "Ethylene", "Benzene", "Toluene"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Biuret test is used to detect:",
        "choices": ["Lipids", "Carbohydrates", "Proteins", "Nucleic acids"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Glucose is a:",
        "choices": ["Disaccharide", "Polysaccharide", "Monosaccharide (aldohexose)", "Lipid"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Hydrolysis of sucrose gives:",
        "choices": [
            "Two glucose units",
            "Glucose and fructose",
            "Glucose and galactose",
            "Two fructose units",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Amino acids contain both:",
        "choices": [
            "−OH and −NH₂",
            "−COOH and −NH₂",
            "−CHO and −NH₂",
            "−SH and −COOH",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Esterification is the reaction between:",
        "choices": [
            "Alcohol and aldehyde",
            "Carboxylic acid and alcohol",
            "Alkane and halogen",
            "Amine and acid",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Soap is the sodium salt of a:",
        "choices": ["Strong acid", "Long-chain fatty acid", "Phenol", "Sulphonic acid"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Acetone is also called:",
        "choices": ["Propanal", "Propan-2-one", "Propan-1-ol", "Propanoic acid"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Chloroform is the IUPAC name of:",
        "choices": ["Trichloromethane", "Dichloromethane", "Tetrachloromethane", "Methyl chloride"],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Polythene is a polymer of:",
        "choices": ["Ethene (ethylene)", "Propene", "Styrene", "Vinyl chloride"],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "DNA is a polymer of:",
        "choices": ["Amino acids", "Glucose units", "Nucleotides", "Fatty acids"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Oxidation of primary alcohol with mild oxidising agent gives:",
        "choices": ["Alkene", "Aldehyde", "Ketone", "Carboxylic acid"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Oxidation of secondary alcohol gives:",
        "choices": ["Aldehyde", "Ketone", "Carboxylic acid", "Ether"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Hydrogenation of vegetable oils produces:",
        "choices": ["Liquid fats", "Vanaspati / hydrogenated solid fats", "Soaps", "Glucose"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Cellulose is composed of:",
        "choices": [
            "α-Glucose linked by α(1→4) bonds",
            "β-Glucose linked by β(1→4) bonds",
            "Sucrose",
            "Maltose",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Litmus is a natural:",
        "choices": ["Indicator", "Catalyst", "Inhibitor", "Reductant"],
        "correct_idx": 0,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Common preservative in food (E260) is:",
        "choices": ["Acetic acid", "Citric acid", "Benzoic acid", "Tartaric acid"],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Blood pH is normally kept around:",
        "choices": ["6.8", "7.0", "7.4", "8.0"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
]

# ─────────────────────────────────────────────────────────────────────────
# UPSC_CSE
# ─────────────────────────────────────────────────────────────────────────

_INDIAN_CONSTITUTION: list[_Q] = [
    {
        "stem": "The Constitution of India was adopted on:",
        "choices": ["15 August 1947", "26 January 1950", "26 November 1949", "2 October 1948"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "The Constitution came into force on:",
        "choices": ["15 August 1947", "26 November 1949", "26 January 1950", "1 January 1950"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Chairman of the Drafting Committee of the Constitution was:",
        "choices": ["Jawaharlal Nehru", "B. R. Ambedkar", "Rajendra Prasad", "Sardar Patel"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Preamble of the Indian Constitution declares India to be:",
        "choices": [
            "A sovereign monarchy",
            "A sovereign socialist secular democratic republic",
            "A federation of princely states",
            "A communist state",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Fundamental Rights are listed in:",
        "choices": ["Part III", "Part IV", "Part II", "Part V"],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Directive Principles of State Policy are listed in:",
        "choices": ["Part III", "Part IV", "Part V", "Part VI"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Article 21 of the Constitution guarantees:",
        "choices": [
            "Right to property",
            "Right to life and personal liberty",
            "Right against exploitation",
            "Right to vote",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Right to constitutional remedies is enshrined in:",
        "choices": ["Article 19", "Article 21", "Article 32", "Article 14"],
        "correct_idx": 2,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The Indian Constitution borrowed the concept of Fundamental Rights from:",
        "choices": ["UK", "USA", "France", "Australia"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The President of India is elected by:",
        "choices": [
            "Direct vote of citizens",
            "An electoral college of MPs and elected MLAs",
            "The Prime Minister",
            "The Lok Sabha alone",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Term of Lok Sabha is normally:",
        "choices": ["4 years", "5 years", "6 years", "Indefinite"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "The Vice-President of India is also the ex-officio Chairman of the:",
        "choices": ["Lok Sabha", "Rajya Sabha", "Election Commission", "Supreme Court"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Money Bills can be introduced only in the:",
        "choices": ["Lok Sabha", "Rajya Sabha", "Either House", "Joint sitting"],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Number of subjects in the Concurrent List (originally) is:",
        "choices": ["47", "52", "97", "61"],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "The Supreme Court of India is the:",
        "choices": [
            "Apex court of the federation",
            "An advisory body to Parliament",
            "Subordinate to the High Courts",
            "Part of the executive",
        ],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Article 370 (before its 2019 abrogation) gave special status to:",
        "choices": ["Punjab", "Jammu and Kashmir", "Nagaland", "Sikkim"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "First amendment of the Indian Constitution was passed in:",
        "choices": ["1950", "1951", "1956", "1976"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The 42nd Constitutional Amendment is often called the:",
        "choices": [
            "Mini Constitution",
            "Indira Constitution",
            "Mandal Amendment",
            "GST Amendment",
        ],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Words 'Socialist' and 'Secular' were added to the Preamble by the:",
        "choices": ["1st Amendment", "42nd Amendment", "44th Amendment", "73rd Amendment"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "The Right to Education was made a Fundamental Right by the:",
        "choices": ["73rd Amendment", "74th Amendment", "86th Amendment", "100th Amendment"],
        "correct_idx": 2,
        "difficulty_b": 0.5,
    },
]

_GOVERNANCE: list[_Q] = [
    {
        "stem": "RTI (Right to Information) Act of India was enacted in:",
        "choices": ["2002", "2005", "2010", "2013"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The Lokpal at the central level was established under the Lokpal and Lokayuktas Act of:",
        "choices": ["1988", "2005", "2013", "2019"],
        "correct_idx": 2,
        "difficulty_b": 0.5,
    },
    {
        "stem": "CAG (Comptroller and Auditor General) of India is appointed by:",
        "choices": ["Parliament", "Prime Minister", "President of India", "Union Cabinet"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The Election Commission of India is a:",
        "choices": [
            "Statutory body",
            "Constitutional body",
            "Executive committee",
            "Subordinate court",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Three-tier structure of Panchayati Raj was introduced by the:",
        "choices": ["73rd Amendment", "42nd Amendment", "1st Amendment", "100th Amendment"],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Urban local bodies (Municipalities) are governed under the:",
        "choices": ["73rd Amendment", "74th Amendment", "61st Amendment", "100th Amendment"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The principle of cooperative federalism is reflected in bodies like:",
        "choices": ["NITI Aayog and Inter-State Council", "Election Commission", "CBI", "RBI"],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "NITI Aayog replaced the:",
        "choices": ["Finance Commission", "Planning Commission", "Election Commission", "UPSC"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The Goods and Services Tax (GST) was introduced in India in:",
        "choices": ["2014", "2016", "2017", "2019"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "GST is collected on:",
        "choices": [
            "Income only",
            "Supply of goods and services (consumption-based)",
            "Property only",
            "Imports only",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Aadhaar is issued by the:",
        "choices": ["UIDAI", "Election Commission", "Reserve Bank of India", "Ministry of Home Affairs"],
        "correct_idx": 0,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Citizen's Charter is a tool for:",
        "choices": [
            "Tax collection",
            "Service delivery accountability and transparency",
            "Election conduct",
            "Judicial procedure",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Mission Karmayogi (NPCSCB) was launched to reform:",
        "choices": [
            "Defence procurement",
            "Capacity building of civil servants",
            "Banking sector",
            "Agricultural marketing",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "The Central Bureau of Investigation (CBI) is governed by the:",
        "choices": [
            "Indian Penal Code",
            "Delhi Special Police Establishment Act, 1946",
            "Constitution of India",
            "RTI Act",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "The Central Vigilance Commission (CVC) was given statutory status by an Act of:",
        "choices": ["1994", "1997", "2003", "2013"],
        "correct_idx": 2,
        "difficulty_b": 1.0,
    },
    {
        "stem": "The Whistleblowers Protection Act in India was passed in:",
        "choices": ["2011", "2014", "2017", "2020"],
        "correct_idx": 1,
        "difficulty_b": 1.0,
    },
    {
        "stem": "PRAGATI is a multi-modal platform launched for:",
        "choices": [
            "Tax collection",
            "Reviewing government programmes by the PM",
            "Defence procurement",
            "Agricultural pricing",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Direct Benefit Transfer (DBT) primarily aims to:",
        "choices": [
            "Curb tax evasion",
            "Plug leakages and provide subsidies directly to beneficiaries",
            "Increase indirect taxation",
            "Replace banking",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "MGNREGA guarantees how many days of wage employment per rural household per year?",
        "choices": ["50", "100", "150", "200"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "PM Awas Yojana focuses on:",
        "choices": ["Sanitation", "Affordable housing", "Cooking gas connections", "Bank accounts"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
]

_ANCIENT_INDIA: list[_Q] = [
    {
        "stem": "The Maurya Empire was founded by:",
        "choices": ["Ashoka", "Bindusara", "Chandragupta Maurya", "Bimbisara"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "The Mauryan emperor who embraced Buddhism after the Kalinga War was:",
        "choices": ["Chandragupta Maurya", "Bindusara", "Ashoka", "Brihadratha"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The Indus Valley Civilisation site Mohenjo-daro is located in present-day:",
        "choices": ["India", "Pakistan", "Afghanistan", "Iran"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "The Harappan script is:",
        "choices": [
            "Fully deciphered",
            "Largely undeciphered",
            "Identical to Brahmi",
            "Derived from Greek",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Buddhism was founded by:",
        "choices": ["Mahavira", "Siddhartha Gautama", "Kapila", "Gosala"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Jainism's 24th Tirthankara was:",
        "choices": ["Parshvanatha", "Mahavira (Vardhamana)", "Rishabhanatha", "Neminatha"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The four Vedas in chronological order start with:",
        "choices": [
            "Rigveda",
            "Yajurveda",
            "Samaveda",
            "Atharvaveda",
        ],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The 'Arthashastra', a treatise on statecraft, is attributed to:",
        "choices": ["Kalidasa", "Chanakya (Kautilya)", "Panini", "Patanjali"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Ashoka's edicts were primarily inscribed in:",
        "choices": ["Sanskrit", "Pali (Brahmi script)", "Greek", "Tamil"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The Gupta period (~320–550 CE) is often called the:",
        "choices": [
            "Dark Age of Indian history",
            "Classical / Golden Age of India",
            "Vedic Age",
            "Medieval Age",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Aryabhata, the famed mathematician-astronomer, lived during the:",
        "choices": ["Mauryan period", "Gupta period", "Mughal period", "Vedic period"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The Nalanda University was a centre of learning during the:",
        "choices": ["Mauryan empire", "Gupta and Pala periods", "Mughal era", "Vijayanagara"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Megasthenes, who visited the Mauryan court, was an envoy of:",
        "choices": [
            "Alexander the Great",
            "Seleucus I Nicator",
            "Darius the Great",
            "Antiochus II",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "The Sungas were succeeded in the Magadha region by the:",
        "choices": ["Kanvas", "Mauryas", "Guptas", "Kushanas"],
        "correct_idx": 0,
        "difficulty_b": 1.0,
    },
    {
        "stem": "The Kushana ruler famous for patronising Buddhism was:",
        "choices": ["Vima Kadphises", "Kanishka", "Kujula Kadphises", "Vasudeva"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Sangam literature is associated with:",
        "choices": [
            "North Indian Vedic period",
            "Early Tamil cultural history",
            "Mughal court literature",
            "Pala dynasty",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "The Iron Pillar of Delhi (rust-resistant) is associated with the:",
        "choices": ["Mauryas", "Guptas (Chandragupta II)", "Tughlaqs", "Mughals"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "The first Buddhist Council was held at:",
        "choices": ["Rajagriha", "Vaishali", "Pataliputra", "Kashmir"],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Harshavardhana of Kanauj is described in detail by the Chinese pilgrim:",
        "choices": ["Faxian", "Xuanzang (Hiuen Tsang)", "Yi Jing", "Marco Polo"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "The famous bronze 'Dancing Girl' was found at:",
        "choices": ["Harappa", "Mohenjo-daro", "Lothal", "Kalibangan"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
]

_MODERN_INDIA: list[_Q] = [
    {
        "stem": "The Battle of Plassey (1757) was won by:",
        "choices": [
            "Robert Clive of the British East India Company",
            "Siraj-ud-Daulah",
            "Tipu Sultan",
            "Hyder Ali",
        ],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The Indian National Congress was founded in:",
        "choices": ["1885", "1905", "1916", "1920"],
        "correct_idx": 0,
        "difficulty_b": -1.0,
    },
    {
        "stem": "The first president of the Indian National Congress was:",
        "choices": ["W. C. Bonnerjee", "A. O. Hume", "Dadabhai Naoroji", "Surendranath Banerjee"],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The partition of Bengal under Lord Curzon took effect in:",
        "choices": ["1885", "1905", "1911", "1919"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Jallianwala Bagh massacre took place in:",
        "choices": ["1919", "1920", "1930", "1942"],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Mahatma Gandhi led the Salt Satyagraha (Dandi March) in:",
        "choices": ["1929", "1930", "1932", "1942"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The Quit India Movement was launched in:",
        "choices": ["1939", "1940", "1942", "1945"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Subhas Chandra Bose founded the:",
        "choices": ["Forward Bloc", "Swaraj Party", "Indian Liberal Federation", "All India Muslim League"],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The Indian Independence Act was passed by the British Parliament in:",
        "choices": ["1945", "1946", "1947", "1948"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The first Governor-General of independent India was:",
        "choices": ["Lord Mountbatten", "C. Rajagopalachari", "Rajendra Prasad", "Lord Wavell"],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Sardar Vallabhbhai Patel is best known for:",
        "choices": [
            "Salt Satyagraha",
            "Integration of princely states into India",
            "Founding the Congress",
            "Drafting the Constitution",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The Non-Cooperation Movement was withdrawn after which incident?",
        "choices": ["Dandi March", "Chauri Chaura", "Jallianwala Bagh", "Lahore Conspiracy"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Bhagat Singh, Rajguru, and Sukhdev were executed in:",
        "choices": ["1929", "1930", "1931", "1932"],
        "correct_idx": 2,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The first Five Year Plan of India focused mainly on:",
        "choices": ["Heavy industry", "Agriculture and irrigation", "Defence", "Service sector"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The Permanent Settlement of Bengal (1793) was introduced by:",
        "choices": ["Warren Hastings", "Lord Cornwallis", "Lord Wellesley", "Lord Dalhousie"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The Doctrine of Lapse was associated with:",
        "choices": ["Lord Hastings", "Lord Dalhousie", "Lord Curzon", "Lord Bentinck"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Sati was abolished in 1829 by:",
        "choices": ["Lord Bentinck", "Lord Cornwallis", "Lord Curzon", "Lord Mountbatten"],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "The Indian Council Act of 1909 is also known as the:",
        "choices": [
            "Government of India Act",
            "Morley-Minto Reforms",
            "Montagu-Chelmsford Reforms",
            "Cripps Mission",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "The Cabinet Mission visited India in:",
        "choices": ["1942", "1944", "1946", "1947"],
        "correct_idx": 2,
        "difficulty_b": 0.5,
    },
    {
        "stem": "India became a republic on:",
        "choices": ["15 August 1947", "26 January 1950", "26 November 1949", "2 October 1950"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
]

_PHYSICAL_GEOGRAPHY: list[_Q] = [
    {
        "stem": "The Earth's innermost layer is the:",
        "choices": ["Mantle", "Outer core", "Inner core", "Crust"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "The longest river in the world is the:",
        "choices": ["Amazon", "Nile", "Yangtze", "Ganga"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "The Tropic of Cancer lies at approximately:",
        "choices": ["0°", "23.5° N", "23.5° S", "45° N"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Atmospheric layer that contains the ozone layer is the:",
        "choices": ["Troposphere", "Stratosphere", "Mesosphere", "Thermosphere"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Cyclones in the Northern Hemisphere rotate:",
        "choices": ["Clockwise", "Anticlockwise", "Vertically", "Randomly"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The volcano-prone Pacific Ring of Fire is associated with:",
        "choices": [
            "Mid-ocean ridges only",
            "Subduction zones around the Pacific Plate",
            "Hot spots only",
            "Continental rifts only",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The Earth's atmosphere is composed predominantly of:",
        "choices": [
            "Oxygen (~78%)",
            "Nitrogen (~78%)",
            "Carbon dioxide",
            "Argon",
        ],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Greenhouse effect is primarily caused by gases like:",
        "choices": ["Oxygen", "Nitrogen", "CO₂, methane, water vapour", "Hydrogen"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The continental drift theory was proposed by:",
        "choices": ["Plate Tectonics Group", "Alfred Wegener", "Charles Darwin", "James Hutton"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The Himalayas are an example of:",
        "choices": ["Block mountains", "Volcanic mountains", "Fold mountains (young)", "Old residual mountains"],
        "correct_idx": 2,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Tides are mainly caused by:",
        "choices": [
            "Wind",
            "Earth's rotation only",
            "Gravitational pull of the Moon (and Sun)",
            "Ocean currents",
        ],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Equator divides the Earth into:",
        "choices": ["Eastern and Western hemispheres", "Northern and Southern hemispheres", "Day and night halves", "Polar regions"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Largest ocean by area is:",
        "choices": ["Atlantic", "Pacific", "Indian", "Arctic"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Latitude 0° passes through:",
        "choices": ["Greenland", "Equatorial Africa, including Kenya", "South Africa", "Australia"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "El Niño is a:",
        "choices": [
            "Cold ocean current in the Atlantic",
            "Warming of central/eastern Pacific surface waters",
            "Type of monsoon wind",
            "Polar vortex phenomenon",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "The Sahara is classified as a:",
        "choices": ["Tropical rainforest", "Hot desert", "Temperate grassland", "Tundra"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Latitude on which the Sun is overhead at the June solstice is:",
        "choices": ["Equator", "Tropic of Cancer", "Tropic of Capricorn", "Arctic Circle"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Coriolis effect deflects winds in the Northern Hemisphere to the:",
        "choices": ["Left", "Right", "Up", "Down"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "The deepest oceanic trench (Mariana) is in the:",
        "choices": ["Atlantic", "Pacific", "Indian", "Southern"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Geyser activity is most associated with:",
        "choices": ["Volcanic regions with shallow groundwater", "Polar regions", "Deserts", "Coastal cliffs"],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
]

_INDIAN_GEOGRAPHY: list[_Q] = [
    {
        "stem": "The longest river of India is the:",
        "choices": ["Brahmaputra", "Ganga", "Godavari", "Krishna"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Highest peak in India is:",
        "choices": ["Nanda Devi", "K2 (in PoK)", "Kanchenjunga (in India)", "Mount Everest (in Nepal)"],
        "correct_idx": 2,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Tropic of Cancer passes through approximately how many Indian states?",
        "choices": ["5", "8", "10", "12"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Western Ghats run along the:",
        "choices": ["Eastern coastline", "Western coastline of peninsular India", "Northern plains", "Central highlands"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The Sundarbans mangrove forest lies in the delta of the:",
        "choices": ["Krishna", "Ganga–Brahmaputra", "Godavari", "Mahanadi"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Black soil is most extensively found in the:",
        "choices": ["Indo-Gangetic plain", "Deccan trap region (Maharashtra/MP/Gujarat)", "Himalayan foothills", "Coastal Tamil Nadu"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The Thar Desert lies primarily in:",
        "choices": ["Madhya Pradesh", "Rajasthan", "Gujarat only", "Punjab"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Kaveri river basin lies primarily in:",
        "choices": ["Punjab and Haryana", "Karnataka and Tamil Nadu", "West Bengal", "Maharashtra and Gujarat"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Largest Indian state by area is:",
        "choices": ["Madhya Pradesh", "Rajasthan", "Maharashtra", "Uttar Pradesh"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Most populous Indian state (per Census 2011) is:",
        "choices": ["Maharashtra", "Uttar Pradesh", "Bihar", "West Bengal"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Indian Standard Time meridian is set at:",
        "choices": ["75° E", "82.5° E", "90° E", "60° E"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "The southernmost point of mainland India is:",
        "choices": ["Indira Point", "Kanyakumari", "Rameswaram", "Trivandrum"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "India's monsoon is mainly:",
        "choices": [
            "Continental wind system, all year",
            "South-west monsoon (June–Sept) and retreating north-east monsoon",
            "Polar wind",
            "Trade wind only",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The river Brahmaputra is known as ____ in Tibet.",
        "choices": ["Tsangpo", "Indus", "Sutlej", "Mekong"],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Wular Lake, the largest freshwater lake in India, is in:",
        "choices": ["Himachal Pradesh", "Jammu and Kashmir", "Uttarakhand", "Sikkim"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "The Ganga rises from a glacier called:",
        "choices": ["Yamunotri", "Gangotri (Gaumukh)", "Pindari", "Zemu"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Chilika Lake, India's largest brackish-water coastal lagoon, is in:",
        "choices": ["Andhra Pradesh", "Tamil Nadu", "Odisha", "West Bengal"],
        "correct_idx": 2,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Capital of Arunachal Pradesh is:",
        "choices": ["Kohima", "Imphal", "Itanagar", "Aizawl"],
        "correct_idx": 2,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Major iron-ore-producing region of India is:",
        "choices": ["Jharkhand-Odisha-Chhattisgarh belt", "Punjab plains", "Sundarbans", "Konkan coast"],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Lakshadweep islands lie in the:",
        "choices": ["Bay of Bengal", "Arabian Sea", "Andaman Sea", "Indian Ocean (south of Sri Lanka)"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
]

# ─────────────────────────────────────────────────────────────────────────
# CAT
# ─────────────────────────────────────────────────────────────────────────

_ARITHMETIC: list[_Q] = [
    {
        "stem": "If 5 men can do a job in 12 days, how many men are needed to do it in 4 days?",
        "choices": ["12", "15", "20", "25"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Simple interest on ₹10,000 at 5% per annum for 2 years is:",
        "choices": ["₹500", "₹1,000", "₹1,025", "₹1,050"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Compound interest on ₹10,000 at 10% p.a. for 2 years (annual compounding) is:",
        "choices": ["₹2,000", "₹2,100", "₹2,200", "₹2,500"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "If the ratio of a:b = 2:3 and b:c = 4:5, then a:b:c =",
        "choices": ["8:12:15", "2:4:5", "8:12:5", "4:6:5"],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "A train 200 m long travels at 72 km/h. Time to cross a stationary pole is:",
        "choices": ["5 s", "10 s", "20 s", "200 s"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Average of first 10 natural numbers is:",
        "choices": ["5.0", "5.5", "10", "55"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "20% of x is equal to 30% of 80. Then x =",
        "choices": ["100", "120", "150", "180"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "If a:b = 3:4 and a + b = 28, then a =",
        "choices": ["10", "12", "16", "21"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Cost price of an article is ₹400. Profit at 25% is sold for:",
        "choices": ["₹450", "₹475", "₹500", "₹525"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "If the perimeter of a square is 32 cm, its area is:",
        "choices": ["32 cm²", "48 cm²", "64 cm²", "128 cm²"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Two pipes A and B can fill a tank in 6 and 8 hours respectively. Together they fill in:",
        "choices": ["3 h 25 min", "3 h 30 min", "3.43 h ≈ 3 h 26 min", "4 h"],
        "correct_idx": 2,
        "difficulty_b": 0.5,
    },
    {
        "stem": "A and B can complete a job in 20 days. A alone in 30 days. B alone in:",
        "choices": ["30 days", "40 days", "50 days", "60 days"],
        "correct_idx": 3,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Boat speed in still water = 12 km/h, stream speed = 4 km/h. Speed downstream:",
        "choices": ["8 km/h", "12 km/h", "16 km/h", "48 km/h"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Mean of 5 numbers is 30. If one is excluded the mean becomes 28. Excluded number is:",
        "choices": ["32", "36", "38", "42"],
        "correct_idx": 2,
        "difficulty_b": 0.5,
    },
    {
        "stem": "If 25% of a number is 50, the number is:",
        "choices": ["100", "150", "200", "250"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Discount of 20% on ₹500 marked price gives selling price:",
        "choices": ["₹400", "₹420", "₹450", "₹480"],
        "correct_idx": 0,
        "difficulty_b": -1.0,
    },
    {
        "stem": "If selling price = ₹540 and gain = 20%, cost price =",
        "choices": ["₹400", "₹450", "₹500", "₹520"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "₹6000 invested at 10% p.a. compounded annually grows in 3 years to:",
        "choices": ["₹7,260", "₹7,800", "₹7,986", "₹8,000"],
        "correct_idx": 2,
        "difficulty_b": 0.5,
    },
    {
        "stem": "If a sum doubles itself in 5 years at simple interest, the rate p.a. is:",
        "choices": ["10%", "15%", "20%", "25%"],
        "correct_idx": 2,
        "difficulty_b": 0.0,
    },
    {
        "stem": "A car travels 60 km in 1 h 30 min. Average speed is:",
        "choices": ["30 km/h", "40 km/h", "45 km/h", "50 km/h"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
]

_ALGEBRA: list[_Q] = [
    {
        "stem": "If x + y = 10 and x − y = 4, then x =",
        "choices": ["3", "5", "7", "9"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "(a + b)² equals:",
        "choices": ["a² + b²", "a² + 2ab + b²", "a² − 2ab + b²", "ab"],
        "correct_idx": 1,
        "difficulty_b": -1.5,
    },
    {
        "stem": "Roots of x² − 5x + 6 = 0 are:",
        "choices": ["1, 6", "2, 3", "−2, −3", "−1, −6"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "If α and β are the roots of ax² + bx + c = 0, then α + β =",
        "choices": ["b/a", "−b/a", "c/a", "−c/a"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Discriminant of x² − 4x + 4 = 0 is:",
        "choices": ["−16", "0", "8", "16"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "If 2ˣ = 32, x =",
        "choices": ["3", "4", "5", "6"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "log₁₀(100) =",
        "choices": ["1", "2", "3", "10"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Sum of an arithmetic progression with first term a, common difference d, n terms is:",
        "choices": [
            "n(a + d)/2",
            "(n/2)(2a + (n−1)d)",
            "n(a + (n−1)d)",
            "a + nd",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "10th term of an AP with a = 5 and d = 3 is:",
        "choices": ["27", "30", "32", "35"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Common ratio of the GP 2, 6, 18, 54, ... is:",
        "choices": ["2", "3", "4", "6"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "If x² + 1/x² = 7, then x + 1/x =",
        "choices": ["±2", "±3", "±4", "±5"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Solution of inequality 2x − 5 > 7 is:",
        "choices": ["x < 6", "x > 6", "x ≥ 6", "x ≤ 6"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "If f(x) = 2x + 3, f⁻¹(7) =",
        "choices": ["1", "2", "3", "4"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Number of real roots of x² + 2x + 5 = 0 is:",
        "choices": ["0", "1", "2", "Infinite"],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "If a + b + c = 0, then a³ + b³ + c³ =",
        "choices": ["0", "abc", "3abc", "−3abc"],
        "correct_idx": 2,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Solution of |x − 3| < 2 is:",
        "choices": ["x ∈ (1, 5)", "x ∈ (−5, 5)", "x ∈ (−2, 5)", "x > 5"],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Sum of infinite GP a + ar + ar² + ... (|r| < 1) is:",
        "choices": ["a/(1 − r)", "a(1 − r)", "a/(1 + r)", "a × r"],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Roots α, β of x² − 7x + 10 = 0. α² + β² =",
        "choices": ["29", "39", "49", "59"],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "If logₐ b = 1/2, then b² =",
        "choices": ["a", "a²", "a³", "1/a"],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "If polynomial p(x) has p(2) = 0, then (x − 2) is a:",
        "choices": ["Factor", "Root", "Quadratic", "Constant"],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
]

_READING_COMPREHENSION: list[_Q] = [
    {
        "stem": "Best definition of inference (in reading comprehension) is a conclusion drawn:",
        "choices": [
            "Directly stated by the author",
            "Logically from evidence in the text + reasoning",
            "From outside knowledge unrelated to the passage",
            "By guessing randomly",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Tone of an academic argumentative passage is most likely:",
        "choices": ["Sarcastic", "Reverent", "Analytical / objective", "Whimsical"],
        "correct_idx": 2,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Identifying the main idea of a passage typically requires looking at:",
        "choices": [
            "Only the first sentence",
            "Only the last sentence",
            "The thesis + supporting points across paragraphs",
            "Only the longest paragraph",
        ],
        "correct_idx": 2,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The synonym of 'lucid' is:",
        "choices": ["Confusing", "Clear", "Hidden", "Forceful"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "If a passage uses extensive hedging language ('may', 'might', 'could'), the author is most likely:",
        "choices": [
            "Advancing certainty",
            "Conveying tentativeness or speculation",
            "Mocking the topic",
            "Speaking authoritatively",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Antonym of 'verbose' is:",
        "choices": ["Talkative", "Concise", "Loquacious", "Rambling"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "An author's bias is best detected by:",
        "choices": [
            "Word choice and selective presentation of evidence",
            "Number of paragraphs",
            "Length of the title",
            "Use of bullet points",
        ],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "A topic sentence usually appears at the:",
        "choices": ["Start of the paragraph", "Middle of the paragraph", "End only", "Anywhere irregularly"],
        "correct_idx": 0,
        "difficulty_b": -0.5,
    },
    {
        "stem": "'Ostensibly' most nearly means:",
        "choices": ["Obviously", "Apparently / on the surface", "Privately", "Vehemently"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "When a passage ends with 'Hence, the policy fails on every count', the author is:",
        "choices": [
            "Endorsing the policy",
            "Concluding against the policy",
            "Asking the reader's opinion",
            "Expressing uncertainty",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Synonym of 'augment' is:",
        "choices": ["Reduce", "Increase / enhance", "Confine", "Confuse"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Critical reading involves:",
        "choices": [
            "Accepting all claims at face value",
            "Evaluating arguments, evidence, and assumptions",
            "Memorising the passage word-for-word",
            "Skipping technical sections",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The structure 'compare and contrast' is most useful for:",
        "choices": [
            "Persuading the reader to act",
            "Highlighting similarities and differences between subjects",
            "Telling a story chronologically",
            "Defining a single term",
        ],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Pronoun reference: in the sentence 'The committee deferred its decision', 'its' refers to:",
        "choices": ["A different committee", "The committee", "The decision", "An external party"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Inference question: a passage states 'electricity demand peaked at 9 PM'. The most directly inferable claim is:",
        "choices": [
            "Electricity is cheap at 9 PM",
            "Most users were active at 9 PM",
            "Solar generation peaked at 9 PM",
            "The grid failed at 9 PM",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "'Cogent' most nearly means:",
        "choices": ["Confused", "Convincing / clear", "Hostile", "Tedious"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "When asked to identify the 'central idea', the answer is:",
        "choices": [
            "A minor example in the text",
            "The single thesis the entire passage supports",
            "A counterargument the author rejects",
            "The author's name",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "'Ubiquitous' most nearly means:",
        "choices": ["Rare", "Hidden", "Present everywhere", "Antique"],
        "correct_idx": 2,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Question 'What is the author's primary purpose?' is best answered by examining the:",
        "choices": [
            "Single most colourful word",
            "Overall argumentative arc and conclusions",
            "First sentence only",
            "Footnotes only",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "If a passage uses the word 'paradox', it indicates:",
        "choices": [
            "A simple definition",
            "An apparent contradiction worth examining",
            "A factual error",
            "An emotional outburst",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
]

_GRAMMAR_AND_VOCABULARY: list[_Q] = [
    {
        "stem": "Choose the correct sentence:",
        "choices": [
            "He don't know the answer.",
            "He doesn't know the answer.",
            "He didn't knew the answer.",
            "He not know the answer.",
        ],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Past tense of 'go' is:",
        "choices": ["Goed", "Went", "Gone", "Going"],
        "correct_idx": 1,
        "difficulty_b": -1.5,
    },
    {
        "stem": "Choose the correctly spelled word:",
        "choices": ["Recieve", "Receive", "Receeve", "Receave"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "The plural of 'criterion' is:",
        "choices": ["Criterions", "Criteria", "Criterias", "Criterion's"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "A word that describes a noun is a/an:",
        "choices": ["Verb", "Adjective", "Adverb", "Pronoun"],
        "correct_idx": 1,
        "difficulty_b": -1.5,
    },
    {
        "stem": "Antonym of 'transparent':",
        "choices": ["Opaque", "Clear", "Glassy", "Visible"],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Synonym of 'meticulous':",
        "choices": ["Careless", "Thorough / careful", "Hurried", "Neglectful"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Identify the active voice form of: 'The book was read by Anika.'",
        "choices": [
            "Anika read the book.",
            "Anika reads the book.",
            "Anika is reading the book.",
            "The book reads Anika.",
        ],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Pick the sentence with subject-verb agreement:",
        "choices": [
            "The list of items are on the desk.",
            "The list of items is on the desk.",
            "The lists of items is on the desk.",
            "The list of item are on the desk.",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Choose the correct preposition: 'She is good ____ chess.'",
        "choices": ["in", "at", "on", "by"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Synonym of 'ephemeral':",
        "choices": ["Eternal", "Short-lived", "Tangible", "Permanent"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "'Their/There/They're' usage: which is correct? 'They are bringing ____ books.'",
        "choices": ["there", "they're", "their", "they"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Choose the correctly punctuated sentence:",
        "choices": [
            "However; we couldn't go.",
            "However we couldn't go.",
            "However, we couldn't go.",
            "However: we couldn't go.",
        ],
        "correct_idx": 2,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Identify the type of clause: 'because it was raining'",
        "choices": ["Independent clause", "Subordinate (dependent) clause", "Phrase", "Compound sentence"],
        "correct_idx": 1,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Antonym of 'voluntary':",
        "choices": ["Compulsory", "Willing", "Free", "Spontaneous"],
        "correct_idx": 0,
        "difficulty_b": 0.0,
    },
    {
        "stem": "Past participle of 'write' is:",
        "choices": ["Wrote", "Written", "Writing", "Writed"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Tense of 'I have been studying for three hours' is:",
        "choices": ["Present perfect", "Present perfect continuous", "Past perfect", "Future perfect"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The phrase 'a stitch in time saves nine' is a:",
        "choices": ["Metaphor", "Idiom / proverb", "Pun", "Hyperbole"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Choose the comparative degree of 'good':",
        "choices": ["Better", "Best", "Gooder", "More good"],
        "correct_idx": 0,
        "difficulty_b": -1.0,
    },
    {
        "stem": "'Effect' (as a noun) means:",
        "choices": ["To bring about", "Result / outcome", "To influence", "Pretend to feel"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
]

_DATA_INTERPRETATION: list[_Q] = [
    {
        "stem": "If a pie chart shows Sales:Marketing:Ops = 90°:120°:150° of total budget, the largest share is:",
        "choices": ["Sales", "Marketing", "Ops", "Equal"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "On a bar chart of revenue (in ₹ crore) for 5 years showing 10, 20, 25, 22, 35, the year with highest revenue is:",
        "choices": ["Year 1", "Year 2", "Year 3", "Year 5"],
        "correct_idx": 3,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Mean of {2, 4, 6, 8, 10} is:",
        "choices": ["5", "6", "7", "8"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Median of {3, 5, 7, 9, 11} is:",
        "choices": ["3", "5", "7", "11"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Mode of {1, 2, 2, 3, 4} is:",
        "choices": ["1", "2", "3", "No mode"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Range of {12, 7, 15, 9, 5, 20} is:",
        "choices": ["10", "12", "15", "20"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Profit grew from ₹100 to ₹130. Percentage growth is:",
        "choices": ["15%", "25%", "30%", "33%"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "If a company's revenue doubles every 2 years, after 6 years it has multiplied by:",
        "choices": ["2", "4", "6", "8"],
        "correct_idx": 3,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Average of 5, 10, 15, 20, 25 is:",
        "choices": ["10", "15", "20", "25"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "If 60% of 200 students like maths, the count is:",
        "choices": ["100", "120", "140", "160"],
        "correct_idx": 1,
        "difficulty_b": -1.0,
    },
    {
        "stem": "Standard deviation gives a measure of:",
        "choices": [
            "Centre of the data",
            "Spread of the data",
            "Total of the data",
            "Median of the data",
        ],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "The probability of getting heads in a fair coin flip is:",
        "choices": ["0", "1/4", "1/2", "1"],
        "correct_idx": 2,
        "difficulty_b": -1.0,
    },
    {
        "stem": "If P(A) = 0.4 and P(B) = 0.5 and they are mutually exclusive, P(A ∪ B) =",
        "choices": ["0.2", "0.7", "0.9", "1.0"],
        "correct_idx": 2,
        "difficulty_b": 0.0,
    },
    {
        "stem": "If a die is rolled, probability of an even number is:",
        "choices": ["1/6", "1/3", "1/2", "2/3"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
    },
    {
        "stem": "Number of arrangements of letters in 'BOOK' is:",
        "choices": ["12", "24", "8", "6"],
        "correct_idx": 0,
        "difficulty_b": 0.5,
    },
    {
        "stem": "Number of ways to choose 3 students from 10 is:",
        "choices": ["10", "30", "120", "720"],
        "correct_idx": 2,
        "difficulty_b": 0.0,
    },
    {
        "stem": "If sales increased from 200 to 250 units, the percentage increase is:",
        "choices": ["20%", "25%", "30%", "50%"],
        "correct_idx": 1,
        "difficulty_b": -0.5,
    },
    {
        "stem": "On a line graph trending upward then downward, the trend is best described as:",
        "choices": ["Monotonic increase", "Inverted-U pattern (peak then decline)", "Monotonic decrease", "Constant"],
        "correct_idx": 1,
        "difficulty_b": 0.0,
    },
    {
        "stem": "If a sample of 50 has mean 20 and another sample of 100 has mean 26, combined mean is:",
        "choices": ["22", "23", "24", "25"],
        "correct_idx": 2,
        "difficulty_b": 0.5,
    },
    {
        "stem": "If two events A and B are independent and P(A) = 0.3, P(B) = 0.4, then P(A ∩ B) =",
        "choices": ["0.07", "0.10", "0.12", "0.70"],
        "correct_idx": 2,
        "difficulty_b": 0.5,
    },
]


# ─────────────────────────────────────────────────────────────────────────
# Bank — keyed by canonical topic title (must match catalog migrations).
# ─────────────────────────────────────────────────────────────────────────

TOPIC_QUESTIONS: dict[str, list[_Q]] = {
    "Mechanics": _MECHANICS,
    "Thermodynamics": _THERMODYNAMICS,
    "Electrostatics": _ELECTROSTATICS,
    "Physical Chemistry": _PHYSICAL_CHEMISTRY,
    "Organic Chemistry": _ORGANIC_CHEMISTRY,
    "Calculus": _CALCULUS,
    "Coordinate Geometry": _COORDINATE_GEOMETRY,
    "Cell Biology": _CELL_BIOLOGY,
    "Genetics": _GENETICS,
    "Mechanics & Waves": _MECHANICS_AND_WAVES,
    "Optics": _OPTICS,
    "Inorganic Chemistry": _INORGANIC_CHEMISTRY,
    "Organic Chemistry (NEET)": _ORGANIC_CHEMISTRY_NEET,
    "Indian Constitution": _INDIAN_CONSTITUTION,
    "Governance": _GOVERNANCE,
    "Ancient India": _ANCIENT_INDIA,
    "Modern India": _MODERN_INDIA,
    "Physical Geography": _PHYSICAL_GEOGRAPHY,
    "Indian Geography": _INDIAN_GEOGRAPHY,
    "Arithmetic": _ARITHMETIC,
    "Algebra": _ALGEBRA,
    "Reading Comprehension": _READING_COMPREHENSION,
    "Grammar & Vocabulary": _GRAMMAR_AND_VOCABULARY,
    "Data Interpretation": _DATA_INTERPRETATION,
}


def expected_count_per_topic() -> int:
    """Sanity check used by the seeders — every topic must have exactly
    20 questions for the per-topic UUID generation to stay deterministic."""
    return 20
