package adp

import (
	"math/rand/v2"
	"testing"

	"github.com/google/uuid"
)

// Regret test: over 200 rounds against a 2-arm bandit (true rates
// 0.7 and 0.3), Thompson should converge on the "good" arm.
//
// Mirror of the alp-stats Python regret test in
// libs/python/alp_stats/tests/test_thompson.py — same setup, same
// pass criterion (≥ 70% picks in the late half land on 'good').
func TestThompsonConvergesOnBestArm(t *testing.T) {
	rng := rand.New(rand.NewPCG(42, 17))
	good := Candidate{QuestionID: uuid.New(), B: 0.0}
	bad := Candidate{QuestionID: uuid.New(), B: 0.0}

	truth := map[uuid.UUID]float64{
		good.QuestionID: 0.7,
		bad.QuestionID:  0.3,
	}

	candidates := []Candidate{good, bad}
	picks := []uuid.UUID{}

	for i := 0; i < 200; i++ {
		choice, ok := ThompsonPick(candidates, rng)
		if !ok {
			t.Fatalf("Thompson failed to pick at round %d", i)
		}
		picks = append(picks, choice.QuestionID)
		// Simulate the reward.
		correct := rng.Float64() < truth[choice.QuestionID]
		// Update the chosen candidate's history.
		for idx := range candidates {
			if candidates[idx].QuestionID == choice.QuestionID {
				candidates[idx].NAttempts++
				if correct {
					candidates[idx].NCorrect++
				}
				break
			}
		}
	}

	// In the second half, the good arm should dominate.
	lateGood := 0
	for _, p := range picks[100:] {
		if p == good.QuestionID {
			lateGood++
		}
	}
	share := float64(lateGood) / 100.0
	if share < 0.70 {
		t.Errorf("expected ≥70%% good-arm picks in late half, got %.2f", share)
	}
}

func TestThompsonBeatsRandomBaseline(t *testing.T) {
	rng := rand.New(rand.NewPCG(13, 91))
	a := Candidate{QuestionID: uuid.New(), B: 0.0}
	b := Candidate{QuestionID: uuid.New(), B: 0.0}
	c := Candidate{QuestionID: uuid.New(), B: 0.0}
	truth := map[uuid.UUID]float64{
		a.QuestionID: 0.8,
		b.QuestionID: 0.5,
		c.QuestionID: 0.2,
	}
	candidates := []Candidate{a, b, c}

	// Thompson run.
	tsReward := 0
	for i := 0; i < 300; i++ {
		ch, _ := ThompsonPick(candidates, rng)
		correct := rng.Float64() < truth[ch.QuestionID]
		for idx := range candidates {
			if candidates[idx].QuestionID == ch.QuestionID {
				candidates[idx].NAttempts++
				if correct {
					candidates[idx].NCorrect++
					tsReward++
				}
				break
			}
		}
	}

	// Random baseline — separate RNG to avoid sharing state.
	rngBase := rand.New(rand.NewPCG(13, 91))
	baselineReward := 0
	ids := []uuid.UUID{a.QuestionID, b.QuestionID, c.QuestionID}
	for i := 0; i < 300; i++ {
		choice := ids[rngBase.IntN(len(ids))]
		if rngBase.Float64() < truth[choice] {
			baselineReward++
		}
	}

	if tsReward < baselineReward+30 {
		t.Errorf("Thompson (%d) should beat random (%d) by ≥30 reward", tsReward, baselineReward)
	}
}

func TestFlowCorridorBounds(t *testing.T) {
	lo, hi := DefaultCorridor(0.5)
	if lo != 0.2 {
		t.Errorf("lo: want 0.2 got %v", lo)
	}
	if hi != 1.0 {
		t.Errorf("hi: want 1.0 got %v", hi)
	}
}

func TestFilterByCorridor(t *testing.T) {
	cands := []Candidate{
		{QuestionID: uuid.New(), B: -2.0},
		{QuestionID: uuid.New(), B: 0.3},
		{QuestionID: uuid.New(), B: 0.7},
		{QuestionID: uuid.New(), B: 2.5},
	}
	filtered := FilterByCorridor(cands, 0.0, 1.0)
	if len(filtered) != 2 {
		t.Errorf("want 2 corridor-eligible items, got %d", len(filtered))
	}
	for _, c := range filtered {
		if c.B < 0.0 || c.B > 1.0 {
			t.Errorf("filtered item B=%.2f outside corridor", c.B)
		}
	}
}

func TestPCorrect3PL(t *testing.T) {
	// At θ = b, σ component is 0.5 → P = c + (1-c)*0.5.
	p := PCorrect(0.0, 0.0, 1.0, 0.25)
	if p < 0.624 || p > 0.626 {
		t.Errorf("P at θ=b with c=0.25 should be ~0.625, got %.4f", p)
	}
	// At θ << b: P → c (the guessing floor).
	p2 := PCorrect(-5.0, 0.0, 1.0, 0.25)
	if p2 > 0.27 {
		t.Errorf("P at θ=-5 with c=0.25 should be near 0.25, got %.4f", p2)
	}
	// At θ >> b: P → 1.
	p3 := PCorrect(5.0, 0.0, 1.0, 0.0)
	if p3 < 0.99 {
		t.Errorf("P at θ=+5 should be near 1.0, got %.4f", p3)
	}
}
