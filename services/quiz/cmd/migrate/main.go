// Migration runner. Usage:
//
//	go run ./cmd/migrate up         # apply all pending migrations
//	go run ./cmd/migrate down 1     # roll back N steps (default 1)
//	go run ./cmd/migrate version    # current schema version
//	go run ./cmd/migrate force <v>  # mark version <v> clean (recovery)
//
// Honours QUIZ_DATABASE_URL and QUIZ_MIGRATIONS_DIR env vars.
package main

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"

	"github.com/adaptive-learn/quiz/internal/config"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))

	cfg, err := config.Load()
	if err != nil {
		logger.Error("config.load_failed", "err", err)
		os.Exit(2)
	}
	args := os.Args[1:]
	if len(args) == 0 {
		args = []string{"up"}
	}

	abs, err := filepath.Abs(cfg.MigrationsDir)
	if err != nil {
		logger.Error("resolve_migrations_dir", "err", err)
		os.Exit(2)
	}
	m, err := migrate.New("file://"+abs, cfg.DatabaseURL)
	if err != nil {
		logger.Error("migrate.new", "err", err, "dir", abs, "url", maskURL(cfg.DatabaseURL))
		os.Exit(1)
	}
	defer func() {
		srcErr, dbErr := m.Close()
		if srcErr != nil || dbErr != nil {
			logger.Warn("migrate.close", "src", srcErr, "db", dbErr)
		}
	}()

	switch args[0] {
	case "up":
		if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
			logger.Error("migrate.up", "err", err)
			os.Exit(1)
		}
	case "down":
		n := 1
		if len(args) > 1 {
			parsed, perr := strconv.Atoi(args[1])
			if perr != nil {
				logger.Error("migrate.down.bad_arg", "arg", args[1])
				os.Exit(2)
			}
			n = parsed
		}
		if err := m.Steps(-n); err != nil && !errors.Is(err, migrate.ErrNoChange) {
			logger.Error("migrate.down", "err", err)
			os.Exit(1)
		}
	case "version":
		v, dirty, err := m.Version()
		if errors.Is(err, migrate.ErrNilVersion) {
			fmt.Println("nil")
			return
		}
		if err != nil {
			logger.Error("migrate.version", "err", err)
			os.Exit(1)
		}
		fmt.Printf("%d (dirty=%t)\n", v, dirty)
	case "force":
		if len(args) < 2 {
			logger.Error("migrate.force: version required")
			os.Exit(2)
		}
		v, err := strconv.Atoi(args[1])
		if err != nil {
			logger.Error("migrate.force.bad_arg", "arg", args[1])
			os.Exit(2)
		}
		if err := m.Force(v); err != nil {
			logger.Error("migrate.force", "err", err)
			os.Exit(1)
		}
	default:
		logger.Error("unknown command", "cmd", args[0])
		os.Exit(2)
	}
	logger.Info("migrate.done", "cmd", args[0])
}

// maskURL hides the password component of a Postgres URL for logging.
func maskURL(u string) string {
	at := -1
	colon := -1
	for i, c := range u {
		if c == '@' && at == -1 {
			at = i
		}
		if c == ':' && colon == -1 && i > 8 {
			colon = i
		}
	}
	if at == -1 || colon == -1 || colon >= at {
		return u
	}
	return u[:colon+1] + "***" + u[at:]
}
