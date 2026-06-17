// EAP — Expected A Posteriori ability estimator.
//
// Discrete-grid implementation mirroring alp_stats.IRTModel.
// Grid: θ ∈ [-4, +4] step 0.05 → 161 nodes. Same 3PL formula:
//
//     P(correct | θ) = c + (1 − c) × σ(a × (θ − b))
//
// Posterior:
//     prior(θ) = Normal(prior_mean, prior_sd)
//     likelihood(responses | θ) = Π_i P_i^k_i × (1 − P_i)^(1 − k_i)
//     posterior(θ) ∝ prior × likelihood
//     θ̂ = E[posterior] (the EAP point estimate)
//     SE = √Var[posterior]
//
// Vectorised over the grid using flat slices; no external deps.
// Per-call cost is ~10 µs for 30 observations × 161 grid points.
package adp

import "math"

// EAPResult is the posterior mean + SE returned by Estimate.
type EAPResult struct {
	Theta float64
	SE    float64
}

// Observation is one answered item — its 3PL parameters + whether
// the student got it right.
type Observation struct {
	B, A, C float64
	Correct bool
}

// EAPEstimator holds the grid + prior so the work isn't repeated.
type EAPEstimator struct {
	grid      []float64
	priorMean float64
	priorSD   float64
}

// NewEAP builds the estimator. Default grid: [-4, 4] step 0.05.
// Prior: N(0, 1) — the standard psychometric default.
func NewEAP() *EAPEstimator {
	return NewEAPWith(-4.0, 4.0, 0.05, 0.0, 1.0)
}

// NewEAPWith allows the caller to override grid range/step and prior.
// Used by F2a (screening-prior path) which seeds prior_mean from the
// readiness_seed of the diagnostic test.
func NewEAPWith(lo, hi, step, priorMean, priorSD float64) *EAPEstimator {
	n := int(math.Floor((hi-lo)/step)) + 1
	grid := make([]float64, n)
	for i := range grid {
		grid[i] = lo + float64(i)*step
	}
	return &EAPEstimator{
		grid:      grid,
		priorMean: priorMean,
		priorSD:   priorSD,
	}
}

// Estimate computes posterior mean + SE given the observations.
// Caller-supplied priorMean / priorSD override the constructor's
// values for this call (useful for per-call screening priors).
func (e *EAPEstimator) Estimate(
	obs []Observation,
	priorMean, priorSD float64,
) EAPResult {
	if priorSD <= 0 {
		priorSD = e.priorSD
	}
	if priorMean == 0 && len(obs) == 0 {
		// No data and no override → return the prior itself.
		return EAPResult{Theta: e.priorMean, SE: priorSD}
	}

	// Compute log-posterior at every grid node.
	logPost := make([]float64, len(e.grid))
	for i, th := range e.grid {
		// log-prior: Normal kernel.
		z := (th - priorMean) / priorSD
		logPost[i] = -0.5 * z * z
		// log-likelihood: sum over observations.
		for _, o := range obs {
			z2 := o.A * (th - o.B)
			sig := Logistic(z2)
			p := o.C + (1.0-o.C)*sig
			// Clamp for numerical safety.
			if p < 1e-10 {
				p = 1e-10
			} else if p > 1.0-1e-10 {
				p = 1.0 - 1e-10
			}
			if o.Correct {
				logPost[i] += math.Log(p)
			} else {
				logPost[i] += math.Log(1.0 - p)
			}
		}
	}

	// Subtract max for stability then normalise.
	maxLP := logPost[0]
	for _, v := range logPost {
		if v > maxLP {
			maxLP = v
		}
	}
	sum := 0.0
	post := make([]float64, len(logPost))
	for i, v := range logPost {
		post[i] = math.Exp(v - maxLP)
		sum += post[i]
	}
	for i := range post {
		post[i] /= sum
	}

	// E[θ] and Var[θ].
	mean := 0.0
	for i, p := range post {
		mean += e.grid[i] * p
	}
	variance := 0.0
	for i, p := range post {
		d := e.grid[i] - mean
		variance += d * d * p
	}
	return EAPResult{Theta: mean, SE: math.Sqrt(variance)}
}
