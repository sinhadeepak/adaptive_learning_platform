// Package config — env-driven config for the battle service.
package config

import (
	"errors"
	"os"
	"strconv"
)

type Config struct {
	HTTPAddr    string
	DatabaseURL string
	JWTSecret   string
	// Matchmaker tuning.
	QueueWidenAfterSec int    // wait this long at the initial band before widening
	QueueTimeoutSec    int    // give up after this long
	QuestionTimerSec   int    // per-question countdown
	QuestionsPerMatch  int    // total questions in a match
	LearningBaseURL    string // for /catalog blueprint fetch
	QuizBaseURL        string // for question text fetch
}

func Load() (Config, error) {
	cfg := Config{
		HTTPAddr:           env("BATTLE_HTTP_ADDR", ":8000"),
		DatabaseURL:        env("BATTLE_DATABASE_URL", ""),
		JWTSecret:          env("BATTLE_JWT_SECRET", ""),
		QueueWidenAfterSec: envInt("BATTLE_QUEUE_WIDEN_AFTER_SEC", 30),
		QueueTimeoutSec:    envInt("BATTLE_QUEUE_TIMEOUT_SEC", 120),
		QuestionTimerSec:   envInt("BATTLE_QUESTION_TIMER_SEC", 30),
		QuestionsPerMatch:  envInt("BATTLE_QUESTIONS_PER_MATCH", 10),
		LearningBaseURL:    env("BATTLE_LEARNING_BASE_URL", "http://learning:8000"),
		QuizBaseURL:        env("BATTLE_QUIZ_BASE_URL", "http://quiz:8000"),
	}
	if cfg.DatabaseURL == "" {
		return cfg, errors.New("BATTLE_DATABASE_URL is required")
	}
	if cfg.JWTSecret == "" {
		return cfg, errors.New("BATTLE_JWT_SECRET is required")
	}
	return cfg, nil
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envInt(k string, def int) int {
	if v := os.Getenv(k); v != "" {
		n, err := strconv.Atoi(v)
		if err == nil {
			return n
		}
	}
	return def
}
