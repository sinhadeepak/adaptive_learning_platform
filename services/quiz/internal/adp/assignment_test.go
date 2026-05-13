package adp

import (
	"math"
	"testing"

	"github.com/google/uuid"
)

func TestAssignArmEndpoints(t *testing.T) {
	uid := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	if AssignArm(uid, 0.0) {
		t.Error("fraction 0.0 must always be false")
	}
	if !AssignArm(uid, 1.0) {
		t.Error("fraction 1.0 must always be true")
	}
}

func TestAssignArmDeterministic(t *testing.T) {
	uid := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	a := AssignArm(uid, 0.5)
	b := AssignArm(uid, 0.5)
	if a != b {
		t.Error("same user + same fraction must return same arm")
	}
}

func TestAssignArmRoughlyBalanced(t *testing.T) {
	// Generate 10k synthetic uuids; check that 50% fraction lands
	// within ±5% of the expected 50/50 split.
	n := 10000
	hits := 0
	for i := 0; i < n; i++ {
		uid := uuid.New()
		if AssignArm(uid, 0.5) {
			hits++
		}
	}
	share := float64(hits) / float64(n)
	if math.Abs(share-0.5) > 0.05 {
		t.Errorf("expected ~50%% in ADP arm, got %.3f", share)
	}
}

func TestAssignArmFractionVaries(t *testing.T) {
	// 10% fraction should land ~10% of users in ADP.
	n := 10000
	hits := 0
	for i := 0; i < n; i++ {
		uid := uuid.New()
		if AssignArm(uid, 0.1) {
			hits++
		}
	}
	share := float64(hits) / float64(n)
	if math.Abs(share-0.1) > 0.03 {
		t.Errorf("expected ~10%% in ADP arm at fraction 0.1, got %.3f", share)
	}
}
