package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
)

const serviceName = "quiz"

// FlagEvaluator narrows the alpflags.Client surface for testability — Sprint 1 tests
// inject a stub; Sprint 2 production code passes the real client. nil disables flag
// evaluation and the session endpoint defaults to binary_search.
type FlagEvaluator interface {
	Evaluate(ctx context.Context, flag, tenantID string) (bool, error)
}

// Router builds the HTTP routes for the quiz service. Pass a non-nil session
// service for the full Sprint 2 surface; pass nil to expose only the legacy
// flag-gated /quiz/sessions/start (used by the Sprint 1 unit tests until they
// migrate to a real session service).
func Router(logger *slog.Logger, sess *SessionService, flags FlagEvaluator) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", health)
	mux.HandleFunc("GET /ready", ready)
	if sess != nil {
		mux.HandleFunc("POST /quiz/sessions/start", sess.Start(logger))
		// Sprint 12 S12-D — ASSIGNMENT mode entry point.
		mux.HandleFunc("POST /quiz/sessions/from-assignment", sess.StartFromAssignment(logger))
		// Sprint 23 (P4-S23) — MOCK_BLUEPRINT entry point.
		mux.HandleFunc("POST /quiz/sessions/from-blueprint", sess.StartFromBlueprint(logger))
		// F4 — count sessions launched from a shared-blueprint slug.
		mux.HandleFunc("GET /quiz/sessions/by-share-slug", sess.CountByShareSlug(logger))
		// Phase 1C — mistake replay (PRACTICE-mode session pre-seeded with wrong answers).
		mux.HandleFunc("POST /quiz/sessions/start-mistake-replay", sess.StartMistakeReplay(logger))
		// Phase 1D-1 — per-question detail for post-test session deep-dive.
		mux.HandleFunc("GET /quiz/sessions/{id}/per-question-time", sess.PerQuestionTime(logger))
		// Phase 1D-7 — internal batch mock-summary aggregator (used by engagement
		// national-rank to avoid N HTTP fan-outs).
		mux.HandleFunc("POST /quiz/internal/users/mock-summaries", sess.BatchUserMockSummaries(logger))
		mux.HandleFunc("GET /quiz/sessions", sess.ListSessions(logger))
		mux.HandleFunc("GET /quiz/sessions/{id}", sess.Get(logger))
		mux.HandleFunc("GET /quiz/sessions/{id}/next", sess.Next(logger))
		mux.HandleFunc("GET /quiz/sessions/{id}/items", sess.Items(logger))
		mux.HandleFunc("POST /quiz/sessions/{id}/answers", sess.Answer(logger))
		mux.HandleFunc("POST /quiz/sessions/{id}/submit", sess.Submit(logger))
		// P6-S54 — end-of-session calibration feedback (too_easy / right
		// / too_hard). Writes to quiz_sessions.calibration_feedback; the
		// column has a CHECK constraint matching the 3-value enum.
		mux.HandleFunc("PATCH /quiz/sessions/{id}/calibration", sess.PatchCalibration(logger))
		mux.HandleFunc("GET /quiz/questions", sess.ListQuestions(logger))
		mux.HandleFunc("GET /quiz/users/{userId}/answered-items", sess.UserAnsweredItems(logger))
	} else {
		mux.HandleFunc("POST /quiz/sessions/start", legacyStartSession(logger, flags))
	}
	return mux
}

func health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": serviceName,
	})
}

func ready(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ready",
		"service": serviceName,
	})
}

// legacyStartSession preserves the Sprint 1 signature: returns
// {sessionId, strategy} based purely on a flag eval, no persistence.
// Kept so existing tests keep passing without a Postgres dependency.
func legacyStartSession(logger *slog.Logger, flags FlagEvaluator) http.HandlerFunc {
	type req struct {
		TopicID  string `json:"topicId"`
		UserID   string `json:"userId"`
		TenantID string `json:"tenantId,omitempty"`
	}
	type resp struct {
		SessionID string `json:"sessionId"`
		Strategy  string `json:"strategy"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		var body req
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeProblem(w, http.StatusBadRequest, "bad_request", "Invalid JSON body")
			return
		}
		if body.TopicID == "" || body.UserID == "" {
			writeProblem(w, http.StatusBadRequest, "missing_field", "topicId and userId are required")
			return
		}
		strategy := "binary_search"
		if flags != nil {
			useIRT, err := flags.Evaluate(r.Context(), "irt_model_enabled", body.TenantID)
			if err != nil {
				logger.Warn("flag.evaluate.failed", "flag", "irt_model_enabled", "err", err)
			} else if useIRT {
				strategy = "irt"
			}
		}
		writeJSON(w, http.StatusCreated, resp{SessionID: legacySessionID(), Strategy: strategy})
	}
}

func legacySessionID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeProblem(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"code": code, "message": message})
}
