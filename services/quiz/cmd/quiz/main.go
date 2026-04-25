// Quiz service entry point.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/adaptive-learn/quiz/internal/adaptive"
	"github.com/adaptive-learn/quiz/internal/config"
	"github.com/adaptive-learn/quiz/internal/db"
	"github.com/adaptive-learn/quiz/internal/flags"
	"github.com/adaptive-learn/quiz/internal/server"
	"github.com/adaptive-learn/quiz/internal/store"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("config.load_failed", "error", err)
		os.Exit(1)
	}

	startupCtx, cancelStartup := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelStartup()

	flagClient, err := flags.New(startupCtx, logger)
	if err != nil {
		logger.Error("flags.connect_failed", "error", err)
		os.Exit(1)
	}
	defer func() {
		_ = flagClient.Close()
	}()

	pool, err := db.New(startupCtx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("db.connect_failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	st := store.New(pool)
	adaptiveClient := adaptive.NewHTTPClient(cfg.AdaptiveURL,
		time.Duration(cfg.AdaptiveTimeoutMS)*time.Millisecond)
	sess := server.NewSessionService(st, flagClient, adaptiveClient, cfg.SessionTTL)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           server.Router(logger, sess, flagClient),
		ReadHeaderTimeout: 5 * time.Second,
	}

	logger.Info("service.startup", "service", "quiz", "port", cfg.Port,
		"environment", cfg.Environment, "log_level", "INFO")

	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server.failed", "error", err)
			os.Exit(1)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("server.shutdown_failed", "error", err)
		os.Exit(1)
	}
	logger.Info("service.shutdown")
}
