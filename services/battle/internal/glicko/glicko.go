// Package glicko implements the Glicko-2 rating update algorithm
// (Glickman, 2013). Pure functions over (rating, rd, volatility);
// caller persists the new state.
//
// Conventions:
//   - Public inputs/outputs are on the Glicko-1 scale (rating ~1500,
//     RD 30–350) because that's what humans intuit. Internally we
//     convert to µ = (R - 1500) / 173.7178 and φ = RD / 173.7178.
//   - One "rating period" = one battle (per ADR-0027). For multi-match
//     batches use UpdateWithResults with all opponents at once.
//   - Default system constant τ = 0.5 — moderate volatility movement.

package glicko

import "math"

const (
	// SCALE — conversion factor between Glicko-1 R/RD and Glicko-2 µ/φ.
	scale = 173.7178
	// Default τ from the spec (volatility constraint).
	tau = 0.5
	// Convergence tolerance for the volatility iteration.
	epsilon = 1e-6
)

// Player is the public rating state. Use NewPlayer for a fresh entrant.
type Player struct {
	R          float64 // rating (Glicko-1 scale)
	RD         float64 // rating deviation
	Volatility float64
}

// NewPlayer returns the standard cold-start state: R=1500, RD=350,
// volatility=0.06. Matches the schema default in 001_battle_schema.sql.
func NewPlayer() Player {
	return Player{R: 1500, RD: 350, Volatility: 0.06}
}

// Result is one observed outcome vs an opponent. Score is 1 for a win,
// 0.5 for a draw, 0 for a loss.
type Result struct {
	Opponent Player
	Score    float64
}

// Update applies the Glicko-2 rating update for a single rating period
// with the supplied results. Returns the new player state.
//
// Pass results=nil to apply only the inactivity step (RD widens). The
// "did not play" path is documented in §5 of the spec.
func Update(p Player, results []Result) Player {
	mu, phi := toG2(p.R, p.RD)
	sigma := p.Volatility

	if len(results) == 0 {
		// No activity: φ' = sqrt(φ² + σ²)
		phi = math.Sqrt(phi*phi + sigma*sigma)
		r, rd := fromG2(mu, phi)
		return Player{R: r, RD: rd, Volatility: sigma}
	}

	// Step 3 — variance v
	var sumGSquaredE, sumGtimesSE float64
	for _, res := range results {
		oppMu, oppPhi := toG2(res.Opponent.R, res.Opponent.RD)
		gPhi := g(oppPhi)
		eVal := e(mu, oppMu, oppPhi)
		sumGSquaredE += gPhi * gPhi * eVal * (1 - eVal)
		sumGtimesSE += gPhi * (res.Score - eVal)
	}
	v := 1.0 / sumGSquaredE

	// Step 4 — Δ (improvement estimate)
	delta := v * sumGtimesSE

	// Step 5 — new volatility (iterative)
	a := math.Log(sigma * sigma)
	f := func(x float64) float64 {
		ex := math.Exp(x)
		num := ex * (delta*delta - phi*phi - v - ex)
		den := 2 * (phi*phi + v + ex) * (phi*phi + v + ex)
		return num/den - (x-a)/(tau*tau)
	}

	A := a
	var B float64
	if delta*delta > phi*phi+v {
		B = math.Log(delta*delta - phi*phi - v)
	} else {
		k := 1.0
		for f(a-k*tau) < 0 {
			k++
		}
		B = a - k*tau
	}

	fA := f(A)
	fB := f(B)
	for math.Abs(B-A) > epsilon {
		C := A + (A-B)*fA/(fB-fA)
		fC := f(C)
		if fC*fB <= 0 {
			A = B
			fA = fB
		} else {
			fA /= 2
		}
		B = C
		fB = fC
	}

	newSigma := math.Exp(A / 2)

	// Step 6 — pre-rating-period φ*
	phiStar := math.Sqrt(phi*phi + newSigma*newSigma)

	// Step 7 — new φ' and µ'
	newPhi := 1.0 / math.Sqrt(1.0/(phiStar*phiStar)+1.0/v)
	newMu := mu + newPhi*newPhi*sumGtimesSE

	newR, newRD := fromG2(newMu, newPhi)
	return Player{R: newR, RD: newRD, Volatility: newSigma}
}

// ── Internal helpers ─────────────────────────────────────────────────

func toG2(r, rd float64) (mu, phi float64) {
	return (r - 1500) / scale, rd / scale
}

func fromG2(mu, phi float64) (r, rd float64) {
	return mu*scale + 1500, phi * scale
}

// g(φ) — opponent-deviation discount.
func g(phi float64) float64 {
	return 1.0 / math.Sqrt(1+3*phi*phi/(math.Pi*math.Pi))
}

// e(µ, µⱼ, φⱼ) — expected score against opponent j.
func e(mu, oppMu, oppPhi float64) float64 {
	return 1.0 / (1.0 + math.Exp(-g(oppPhi)*(mu-oppMu)))
}
