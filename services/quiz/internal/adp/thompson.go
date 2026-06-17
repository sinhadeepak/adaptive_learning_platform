// Package adp — Adaptive Difficulty Progression.
//
// Mirrors the Python alp-stats primitives (BetaBinomialPosterior +
// ThompsonSampler) in Go. Same math, same tests, lives next to the
// hot-path Quiz session machinery so question selection stays
// single-service (no cross-language RPC).
//
// Why duplicate the math? alp-stats is Python; Quiz Go's pickNext
// runs in < 100 ms per call. Calling out to learning for every
// question selection would triple the latency. The math is closed-
// form (one logistic + one beta sample) so the duplication is
// cheap, and the two implementations validate each other.
package adp

import (
	"math/rand/v2"
	"sort"

	"github.com/google/uuid"
)

// FlowCorridor returns the (low, high) difficulty band the engine
// considers eligible given a student's current θ.
//
// Defaults (lower = -0.3, upper = +0.5) come straight from the
// catalogue §15 — Csikszentmihalyi flow + Bjork desirable-difficulty.
func FlowCorridor(theta, lowerOffset, upperOffset float64) (lo, hi float64) {
	return theta + lowerOffset, theta + upperOffset
}

// DefaultCorridor returns the platform-canonical flow band.
func DefaultCorridor(theta float64) (lo, hi float64) {
	return FlowCorridor(theta, -0.3, 0.5)
}

// Candidate represents one calibrated question eligible for selection.
//
// The Thompson sampler draws one sample from each candidate's Beta
// posterior (built from observed answer-correctness) and picks the
// highest sampled-probability arm.
type Candidate struct {
	QuestionID uuid.UUID

	// IRT difficulty (logit scale). Used only for corridor filtering;
	// the bandit decision uses the Beta posterior of past correctness.
	B float64

	// Observed history — populated from question_calibration.
	NAttempts int
	NCorrect  int
}

// BetaPosterior on this candidate, using Jeffreys (α=0.5, β=0.5) prior
// when no observations exist.
func (c Candidate) posteriorAlphaBeta() (float64, float64) {
	alpha := 0.5 + float64(c.NCorrect)
	beta := 0.5 + float64(c.NAttempts-c.NCorrect)
	if beta < 0 {
		beta = 0.5
	}
	return alpha, beta
}

// ThompsonPick picks one candidate using Thompson sampling.
//
// Each candidate's posterior is sampled once; the candidate with
// the highest draw wins. With no observations every arm samples
// from Beta(0.5, 0.5) → mostly random — which is exactly what we
// want for cold-start exploration. As correct/wrong observations
// accumulate, the posterior tightens and the sampler converges on
// the items with the best "this student gets it right at the right
// difficulty" profile.
//
// `rng` is injected for deterministic testing. Production callers
// pass `rand.New(rand.NewPCG(seed1, seed2))` or similar.
func ThompsonPick(candidates []Candidate, rng *rand.Rand) (Candidate, bool) {
	if len(candidates) == 0 {
		return Candidate{}, false
	}
	bestIdx := -1
	bestDraw := -1.0
	for i, c := range candidates {
		alpha, beta := c.posteriorAlphaBeta()
		draw := sampleBeta(alpha, beta, rng)
		if draw > bestDraw {
			bestDraw = draw
			bestIdx = i
		}
	}
	if bestIdx < 0 {
		return Candidate{}, false
	}
	return candidates[bestIdx], true
}

// FilterByCorridor restricts candidates to those whose B parameter
// lies in [lo, hi]. The caller decides the corridor — Thompson
// only sees what's eligible.
func FilterByCorridor(candidates []Candidate, lo, hi float64) []Candidate {
	out := candidates[:0]
	for _, c := range candidates {
		if c.B >= lo && c.B <= hi {
			out = append(out, c)
		}
	}
	// Return a copy so we don't keep aliasing the caller's slice
	// header in a confusing way (out shares backing array with input).
	cpy := make([]Candidate, len(out))
	copy(cpy, out)
	return cpy
}

// sampleBeta draws one variate from Beta(α, β) via the gamma ratio
// X = G(α) / (G(α) + G(β)), where G(k) ~ Gamma(k, 1). Pure-Go, no
// external deps, matches scipy.stats.beta.rvs distributions to
// the precision of the underlying RNG.
func sampleBeta(alpha, beta float64, rng *rand.Rand) float64 {
	x := sampleGamma(alpha, rng)
	y := sampleGamma(beta, rng)
	if x+y == 0 {
		return 0.5
	}
	return x / (x + y)
}

// sampleGamma — Marsaglia-Tsang method for shape ≥ 1, plus the
// "boost" trick for shape < 1 (uses Beta(shape, 1) augmentation).
// See Marsaglia & Tsang (2000) "A simple method for generating
// gamma variables."
func sampleGamma(shape float64, rng *rand.Rand) float64 {
	if shape < 1.0 {
		// Boost shape to ≥ 1, then unboost.
		u := rng.Float64()
		return sampleGamma(shape+1.0, rng) * pow(u, 1.0/shape)
	}
	d := shape - 1.0/3.0
	c := 1.0 / (3.0 * sqrtNewton(d))
	for {
		var x, v float64
		for {
			x = rng.NormFloat64()
			v = 1.0 + c*x
			if v > 0 {
				break
			}
		}
		v = v * v * v
		u := rng.Float64()
		if u < 1.0-0.0331*(x*x)*(x*x) {
			return d * v
		}
		// log(u) < 0.5 x² + d (1 − v + log v)
		if logFast(u) < 0.5*x*x+d*(1.0-v+logFast(v)) {
			return d * v
		}
	}
}

// SortByExpectedReward — utility for testing / debugging. Sorts a
// slice of candidates by their posterior mean descending.
func SortByExpectedReward(candidates []Candidate) {
	sort.Slice(candidates, func(i, j int) bool {
		a, b := candidates[i].posteriorAlphaBeta()
		c, d := candidates[j].posteriorAlphaBeta()
		return a/(a+b) > c/(c+d)
	})
}
