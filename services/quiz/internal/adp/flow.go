// Flow-corridor regulation — frustration / boredom detection.
//
// Per ADR-0027 §15.3:
//
//   Frustration:  ≥ 3 consecutive wrong  OR  avg solve-time > 2× median
//                 → drop b by 0.5
//   Boredom:      ≥ 5 consecutive correct AND avg solve-time < 0.5× median
//                 → raise b by 0.4
//
// This module is purely functional — caller passes in the recent
// answer stream + timing, gets back a {state, correction} response.
// All side effects (LogFlowEvent, corridor adjustment) live in the
// session pickNext path.
package adp

// FlowState is one of the three states the regulator can return.
type FlowState string

const (
	FlowNormal      FlowState = "normal"
	FlowFrustration FlowState = "frustration"
	FlowBoredom     FlowState = "boredom"
)

// AnswerSignal is one historical answer with its solve time.
type AnswerSignal struct {
	Correct bool
	TimeMs  int
}

// FlowDecision tells the caller what to do.
type FlowDecision struct {
	State          FlowState
	BAdjustment    float64 // negative = make easier, positive = make harder
	Rationale      string
}

const (
	// Configurable per ADR-0027.
	frustrationConsecutiveWrong = 3
	boredomConsecutiveCorrect   = 5
	frustrationTimeMultiplier   = 2.0
	boredomTimeMultiplier       = 0.5
	frustrationBDrop            = -0.5
	boredomBRaise               = 0.4
)

// Detect inspects the most recent answer signals (oldest-first) plus
// the concept's median solve time and returns the corrective action.
//
// `recent` should be the last N answers — the function only inspects
// up to the tail required by the thresholds (boredom needs 5, the
// max of any threshold), so passing a longer history is safe and
// cheap.
//
// `conceptMedianMs` is the per-concept median solve time across all
// students. Pass 0 to disable timing-based detection (e.g., for a
// freshly-published concept with no historical median yet).
func Detect(recent []AnswerSignal, conceptMedianMs int) FlowDecision {
	if len(recent) == 0 {
		return FlowDecision{State: FlowNormal}
	}

	// Frustration: tail-of-3 consecutive wrong.
	if len(recent) >= frustrationConsecutiveWrong {
		tail := recent[len(recent)-frustrationConsecutiveWrong:]
		allWrong := true
		for _, a := range tail {
			if a.Correct {
				allWrong = false
				break
			}
		}
		if allWrong {
			return FlowDecision{
				State:       FlowFrustration,
				BAdjustment: frustrationBDrop,
				Rationale:   "3 consecutive wrong",
			}
		}
	}

	// Time-based frustration: average solve time across the last 5
	// answers exceeds 2× the concept median.
	if conceptMedianMs > 0 && len(recent) >= 5 {
		tail := recent[len(recent)-5:]
		var sum int
		for _, a := range tail {
			sum += a.TimeMs
		}
		avg := float64(sum) / 5.0
		if avg > frustrationTimeMultiplier*float64(conceptMedianMs) {
			return FlowDecision{
				State:       FlowFrustration,
				BAdjustment: frustrationBDrop,
				Rationale:   "avg solve-time > 2× concept median",
			}
		}
	}

	// Boredom: tail-of-5 consecutive correct AND solve time < 0.5× median.
	if len(recent) >= boredomConsecutiveCorrect {
		tail := recent[len(recent)-boredomConsecutiveCorrect:]
		allCorrect := true
		var sum int
		for _, a := range tail {
			if !a.Correct {
				allCorrect = false
				break
			}
			sum += a.TimeMs
		}
		if allCorrect {
			avg := sum / boredomConsecutiveCorrect
			if conceptMedianMs == 0 || avg < int(boredomTimeMultiplier*float64(conceptMedianMs)) {
				return FlowDecision{
					State:       FlowBoredom,
					BAdjustment: boredomBRaise,
					Rationale:   "5 consecutive correct, low solve-time",
				}
			}
		}
	}

	return FlowDecision{State: FlowNormal}
}
