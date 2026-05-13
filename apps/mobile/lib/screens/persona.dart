// Persona helper — branches the UX between two very different
// audiences without forking the entire app:
//
//   Junior  — CBSE Class 6-10 students. Lower density, no AIR, no Rank
//             tab until they have something meaningful to track.
//   Senior  — JEE / NEET / UPSC / CAT aspirants. Full analytics density,
//             Rank tab once at least one session has been attempted.
//
// Persona is derived from the user's *active* exam (their first
// selection in profile.exams). When no exam is selected we default to
// junior — quieter / less intimidating for first-time users.

enum Persona {
  junior,
  senior;

  bool get isJunior => this == Persona.junior;
  bool get isSenior => this == Persona.senior;
}

/// Junior-family exam codes. Currently just CBSE (Class 8-9 today,
/// Class 10 once seeded). Extend here when more school-level exams
/// land in the catalog (ICSE, IB MYP etc.).
const Set<String> _juniorExamCodes = {'CBSE'};

Persona personaForExamCode(String? code) {
  if (code == null || code.isEmpty) return Persona.junior;
  return _juniorExamCodes.contains(code) ? Persona.junior : Persona.senior;
}

/// Whether the Rank tab should be visible in the bottom nav.
///
///   - Juniors never see it (rank-trajectory is meaningless before
///     they have a competitive-exam blueprint to project against).
///   - Seniors see it once they have *earned* it — i.e. they've done
///     at least one practice session, so the rank trajectory has any
///     real signal to plot.
bool shouldShowRankTab({
  required Persona persona,
  required bool hasAnySession,
}) {
  if (persona.isJunior) return false;
  return hasAnySession;
}
