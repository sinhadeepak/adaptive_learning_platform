package alptelemetry

import (
	"context"
	"log/slog"
)

// SlogHandler wraps a slog.Handler and adds the current trace-id (from ctx)
// as the `trace_id` attribute on every record. Mirrors the Python lib's
// structlog processor so logs cross-correlate one-for-one.
//
// Wire it once at startup:
//
//	base := slog.NewJSONHandler(os.Stdout, nil)
//	slog.SetDefault(slog.New(alptelemetry.NewSlogHandler(base)))
type SlogHandler struct {
	inner slog.Handler
}

// NewSlogHandler decorates `inner` with trace-id injection.
func NewSlogHandler(inner slog.Handler) *SlogHandler {
	return &SlogHandler{inner: inner}
}

func (h *SlogHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.inner.Enabled(ctx, level)
}

func (h *SlogHandler) Handle(ctx context.Context, record slog.Record) error {
	if tid := TraceIDFromContext(ctx); tid != "" {
		record.AddAttrs(slog.String("trace_id", tid))
	}
	return h.inner.Handle(ctx, record)
}

func (h *SlogHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &SlogHandler{inner: h.inner.WithAttrs(attrs)}
}

func (h *SlogHandler) WithGroup(name string) slog.Handler {
	return &SlogHandler{inner: h.inner.WithGroup(name)}
}
