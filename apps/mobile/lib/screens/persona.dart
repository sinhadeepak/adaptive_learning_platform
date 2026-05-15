// LegacyAudience helper — branches the UX between two very different
// audiences without forking the entire app:
//
//   junior  — CBSE Class 6-10 students. Lower density, no AIR, no Rank
//             tab until they have something meaningful to track.
//   senior  — JEE / NEET / UPSC / CAT aspirants. Full analytics density,
//             Rank tab once at least one session has been attempted.
//
// `LegacyAudience` is derived from the user's *active* exam (their first
// selection in profile.exams). When no exam is selected we default to
// junior — quieter / less intimidating for first-time users.
//
// **Aurora v3 / Wave 2 migration note**: this Junior/Senior split is a
// pre-Persona-system shim. The richer four-mode persona system shipped
// in W2.0 (Kid / Teen / Aspirant / Learner) supersedes it — see
// `apps/mobile/lib/aurora/persona.dart` and §4 of the master spec.
// This file was renamed from `Persona` → `LegacyAudience` to clear the
// type collision; the file itself is scheduled for deletion when
// MainScaffold is replaced by PersonaShell (Wave 2 W2.5/W2.6).

/// Pre-Aurora-v3 binary audience split derived from the active exam code.
/// Do not extend; use the Aurora v3 [Persona] system for new flows.
enum LegacyAudience {
  junior,
  senior;

  bool get isJunior => this == LegacyAudience.junior;
  bool get isSenior => this == LegacyAudience.senior;
}

/// Junior-family exam codes. Currently just CBSE (Class 8-9 today,
/// Class 10 once seeded). Extend here when more school-level exams
/// land in the catalog (ICSE, IB MYP etc.).
const Set<String> _juniorExamCodes = {'CBSE'};

LegacyAudience legacyAudienceForExamCode(String? code) {
  if (code == null || code.isEmpty) return LegacyAudience.junior;
  return _juniorExamCodes.contains(code)
      ? LegacyAudience.junior
      : LegacyAudience.senior;
}

/// Whether the Rank tab should be visible in the bottom nav.
///
///   - Juniors never see it (rank-trajectory is meaningless before
///     they have a competitive-exam blueprint to project against).
///   - Seniors see it once they have *earned* it — i.e. they've done
///     at least one practice session, so the rank trajectory has any
///     real signal to plot.
bool shouldShowRankTab({
  required LegacyAudience audience,
  required bool hasAnySession,
}) {
  if (audience.isJunior) return false;
  return hasAnySession;
}
