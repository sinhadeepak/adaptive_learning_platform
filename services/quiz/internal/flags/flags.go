// Package flags wires the alpflags SDK into the Quiz service.
//
// GAP-16: Quiz consumes:
//   - irt_model_enabled (default false) — when true, use 3PL IRT cold-start;
//     when false, use binary-search cold-start (Sprint 1 default; SPIKE-01 informs Sprint 2 flip).
package flags

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/adaptive-learn/alpflags"
)

// Fallbacks declares every flag Quiz consumes plus its hardcoded fallback.
// Missing fallback at evaluation time is a build-time bug.
var Fallbacks = map[string]bool{
	"irt_model_enabled": false,
}

// New constructs a flag client from environment configuration.
// Returns a client that has been Connect()'d (NATS subscription up, if reachable).
func New(ctx context.Context, logger *slog.Logger) (*alpflags.Client, error) {
	// Read both names — QUIZ_INSTITUTION_BASE_URL is the canonical one (matches
	// internal/config); QUIZ_INSTITUTION_URL was used by an earlier draft. Keep
	// both so existing dev .env files don't silently fall back to localhost.
	institutionURL := envDefault("QUIZ_INSTITUTION_BASE_URL", envDefault("QUIZ_INSTITUTION_URL", "http://localhost:38008"))
	natsURL := envDefault("QUIZ_NATS_URL", "nats://localhost:34222")

	c := alpflags.New(alpflags.Options{
		InstitutionURL: institutionURL,
		NatsURL:        natsURL,
		Fallbacks:      Fallbacks,
		CacheTTL:       30 * time.Second,
		Logger:         logger,
		OnDecision:     alpflags.SlogDecisionHook("quiz", logger),
	})
	if err := c.Connect(ctx); err != nil {
		return nil, err
	}
	return c, nil
}

func envDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
