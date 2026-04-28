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

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/adaptive-learn/alptelemetry"
	"github.com/adaptive-learn/quiz/internal/adaptive"
	"github.com/adaptive-learn/quiz/internal/config"
	"github.com/adaptive-learn/quiz/internal/content"
	"github.com/adaptive-learn/quiz/internal/db"
	"github.com/adaptive-learn/quiz/internal/events"
	"github.com/adaptive-learn/quiz/internal/flags"
	"github.com/adaptive-learn/quiz/internal/server"
	"github.com/adaptive-learn/quiz/internal/store"
)

func main() {
	// Wrap the JSON handler with alptelemetry's slog handler so every record
	// produced inside a request scope carries the bound trace-id.
	base := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	logger := slog.New(alptelemetry.NewSlogHandler(base))
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
	httpAdaptive := adaptive.NewHTTPClient(cfg.AdaptiveURL,
		time.Duration(cfg.AdaptiveTimeoutMS)*time.Millisecond)
	// GAP-01: wrap with circuit breaker. Trips after 5 consecutive failures;
	// `pickNext` already falls back to local heuristic on any error so a
	// tripped breaker degrades gracefully. Metrics exported at /metrics.
	adaptiveClient := adaptive.NewBreakerClient(httpAdaptive, prometheus.DefaultRegisterer)

	publisher := events.Connect(cfg.NATSURL, logger)
	defer func() { _ = publisher.Close() }()

	// Content → Quiz bridge (Sprint 3): mirror published questions into our
	// bank. Best-effort — failures are logged but don't gate startup.
	contentSub, contentSubErr := events.StartContentSubscriber(cfg.NATSURL, pool, logger)
	if contentSubErr != nil {
		logger.Warn("content_subscriber.start_failed", "error", contentSubErr)
	} else {
		defer func() { _ = contentSub.Close() }()
	}

	sess := server.NewSessionService(st, flagClient, adaptiveClient, publisher, cfg.SessionTTL).
		WithJWTSecret(cfg.JWTSecret).
		WithContentClient(content.New(cfg.ContentURL))

	mux := http.NewServeMux()
	mux.Handle("/", server.Router(logger, sess, flagClient))
	mux.Handle("/metrics", promhttp.Handler())
	srv := &http.Server{
		Addr: ":" + cfg.Port,
		// Trace-id middleware is the OUTERMOST handler so every downstream
		// request scope carries a bound trace-id available to slog.
		Handler:           alptelemetry.Middleware(mux),
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
