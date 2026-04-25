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

// Router builds the HTTP routes for the quiz service.
func Router(logger *slog.Logger, flags FlagEvaluator) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", health)
	mux.HandleFunc("GET /ready", ready)
	mux.HandleFunc("POST /quiz/sessions/start", startSession(logger, flags))
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

type startSessionRequest struct {
	TopicID  string `json:"topicId"`
	UserID   string `json:"userId"`
	TenantID string `json:"tenantId,omitempty"`
}

type startSessionResponse struct {
	SessionID string `json:"sessionId"`
	Strategy  string `json:"strategy"` // "irt" | "binary_search"
}

// startSession demonstrates flag-gated branching using the alpflags Go SDK.
// Sprint 1 records the chosen strategy in the response so we can verify it in
// tests + smoke. Sprint 2 hooks the adaptive-engine gRPC client behind the IRT
// branch and the local fallback behind the binary_search branch.
func startSession(logger *slog.Logger, flags FlagEvaluator) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req startSessionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeProblem(w, http.StatusBadRequest, "bad_request", "Invalid JSON body")
			return
		}
		if req.TopicID == "" || req.UserID == "" {
			writeProblem(w, http.StatusBadRequest, "missing_field", "topicId and userId are required")
			return
		}

		strategy := "binary_search"
		if flags != nil {
			useIRT, err := flags.Evaluate(r.Context(), "irt_model_enabled", req.TenantID)
			if err != nil {
				logger.Warn("flag.evaluate.failed", "flag", "irt_model_enabled", "err", err)
			} else if useIRT {
				strategy = "irt"
			}
		}

		writeJSON(w, http.StatusCreated, startSessionResponse{
			SessionID: newSessionID(),
			Strategy:  strategy,
		})
	}
}

func newSessionID() string {
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
