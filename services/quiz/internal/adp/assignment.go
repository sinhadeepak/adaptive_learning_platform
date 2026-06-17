// A/B assignment for Phase B2 controlled rollout.
//
// Hash-based, sticky-per-user. Given a fraction f ∈ [0, 1] and a
// user_id, deterministically decide whether the user is in the ADP
// arm. Same user always lands in the same arm — critical for an A/B
// where a flip mid-session would corrupt the measurement.
package adp

import (
	"hash/fnv"

	"github.com/google/uuid"
)

// AssignArm returns true when the user is in the ADP arm given the
// configured fraction. Hashes the user_id with FNV-1a (fast, no
// crypto dependency, sufficient for unbiased bucketing).
//
//	fraction = 0.0 → always false (legacy IRT)
//	fraction = 1.0 → always true (ADP everywhere)
//	fraction = 0.5 → ~50% of users land in ADP
//
// Deterministic: AssignArm(uid, 0.5) returns the same value across
// process restarts.
func AssignArm(userID uuid.UUID, fraction float64) bool {
	if fraction <= 0 {
		return false
	}
	if fraction >= 1 {
		return true
	}
	h := fnv.New64a()
	_, _ = h.Write(userID[:])
	// Map the 64-bit hash to a fraction in [0, 1).
	bucket := float64(h.Sum64()) / float64(^uint64(0))
	return bucket < fraction
}
