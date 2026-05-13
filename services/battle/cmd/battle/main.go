// Battle service entry point. F7 (ADR-0027).
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

	"github.com/adaptive-learn/battle/internal/config"
	"github.com/adaptive-learn/battle/internal/db"
	"github.com/adaptive-learn/battle/internal/server"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("battle.config_failed", "error", err)
		os.Exit(1)
	}

	dbCtx, dbCancel := context.WithTimeout(context.Background(), 10*time.Second)
	pool, err := db.New(dbCtx, cfg.DatabaseURL)
	dbCancel()
	if err != nil {
		logger.Error("battle.db_failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	bgCtx, bgCancel := context.WithCancel(context.Background())
	defer bgCancel()
	srv := server.New(cfg, logger, pool)
	srv.StartBackground(bgCtx)
	httpSrv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           srv.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	logger.Info("battle.listening", "addr", cfg.HTTPAddr)

	errCh := make(chan error, 1)
	go func() {
		if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)

	select {
	case s := <-sig:
		logger.Info("battle.shutdown", "signal", s.String())
	case err := <-errCh:
		logger.Error("battle.serve_failed", "error", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = httpSrv.Shutdown(ctx)
	srv.Shutdown(ctx)
}
