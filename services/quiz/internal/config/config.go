// Package config loads quiz service settings from the environment.
package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Settings struct {
	Port           string
	DatabaseURL    string
	NATSURL        string
	InstitutionURL string
	SessionTTL     time.Duration
	MigrationsDir  string
	JWTSecret      string
	Environment    string
}

func Load() (Settings, error) {
	s := Settings{
		Port:           getenv("QUIZ_PORT", "8000"),
		DatabaseURL:    getenv("QUIZ_DATABASE_URL", "postgres://postgres:postgres@localhost:35432/quiz?sslmode=disable"),
		NATSURL:        getenv("QUIZ_NATS_URL", "nats://localhost:34222"),
		InstitutionURL: getenv("QUIZ_INSTITUTION_BASE_URL", "http://localhost:38008"),
		MigrationsDir:  getenv("QUIZ_MIGRATIONS_DIR", "migrations"),
		JWTSecret:      getenv("QUIZ_JWT_SECRET", "dev-only-change-me-in-staging-at-least-32-bytes-long"),
		Environment:    getenv("QUIZ_ENVIRONMENT", "local"),
	}
	ttlMin, err := strconv.Atoi(getenv("QUIZ_SESSION_TTL_MIN", "90"))
	if err != nil {
		return s, fmt.Errorf("invalid QUIZ_SESSION_TTL_MIN: %w", err)
	}
	s.SessionTTL = time.Duration(ttlMin) * time.Minute
	return s, nil
}

func getenv(k, fallback string) string {
	if v, ok := os.LookupEnv(k); ok && v != "" {
		return v
	}
	return fallback
}
