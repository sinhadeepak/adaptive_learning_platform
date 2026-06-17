// Pure-math helpers used by the ADP package. Avoids importing
// "math" everywhere so call sites read like single statements.
package adp

import "math"

// pow wraps math.Pow for readability inside the gamma sampler.
func pow(x, y float64) float64 {
	return math.Pow(x, y)
}

// sqrtNewton is a one-line wrapper kept distinct so we could swap in
// a faster (but less accurate) approximation if profiling demands.
func sqrtNewton(x float64) float64 {
	return math.Sqrt(x)
}

// logFast wraps math.Log. Distinct symbol so a future hot-path
// optimisation (e.g., table lookup) can swap in without touching
// thompson.go.
func logFast(x float64) float64 {
	return math.Log(x)
}

// Logistic is the standard logistic function σ(z) = 1 / (1 + e^-z).
// Stable for large |z|.
func Logistic(z float64) float64 {
	if z >= 0 {
		return 1.0 / (1.0 + math.Exp(-z))
	}
	ez := math.Exp(z)
	return ez / (1.0 + ez)
}

// PCorrect returns the 3PL probability of a correct response given
// ability θ and item parameters (b difficulty, a discrimination,
// c guessing). Reduces to Rasch when a=1, c=0.
func PCorrect(theta, b, a, c float64) float64 {
	z := a * (theta - b)
	return c + (1.0-c)*Logistic(z)
}
