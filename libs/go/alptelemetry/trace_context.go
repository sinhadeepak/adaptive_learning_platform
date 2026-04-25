// Package alptelemetry implements W3C trace-context propagation for ALP Go
// services. Pairs with the Python alp_telemetry lib for cross-language
// trace-id continuity — same field name (trace_id), same fallback shape, so
// a single log query stitches a request across Python ↔ Go hops.
package alptelemetry

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"regexp"
	"strings"
)

const (
	// TraceparentHeader is the W3C standard inbound + outbound header.
	TraceparentHeader = "traceparent"
	// invalidTraceID is the W3C-reserved sentinel — treat as "no trace".
	invalidTraceID = "00000000000000000000000000000000"
)

// 00-<32-hex>-<16-hex>-<2-hex>
var traceparentRE = regexp.MustCompile(`^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$`)

type ctxKey struct{}

// ParseTraceparent extracts the 32-hex trace-id from a `traceparent` header
// value. Returns "" for empty / malformed / all-zero inputs (never an error
// — propagation is best-effort).
func ParseTraceparent(header string) string {
	header = strings.ToLower(strings.TrimSpace(header))
	m := traceparentRE.FindStringSubmatch(header)
	if m == nil {
		return ""
	}
	tid := m[2]
	if tid == invalidTraceID {
		return ""
	}
	return tid
}

// GenerateTraceID returns a fresh W3C-compliant 32-hex trace-id (16 random
// bytes). Falls back to all-zeroes only if crypto/rand catastrophically
// fails — caller should treat that as a system-level error.
func GenerateTraceID() string {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "" // signal failure; let the middleware decide whether to drop the request
	}
	return hex.EncodeToString(buf[:])
}

// WithTraceID returns a context carrying the given trace-id, accessible
// later via TraceIDFromContext.
func WithTraceID(ctx context.Context, traceID string) context.Context {
	return context.WithValue(ctx, ctxKey{}, traceID)
}

// TraceIDFromContext returns the trace-id bound to ctx (or "" if none).
func TraceIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(ctxKey{}).(string); ok {
		return v
	}
	return ""
}

// FormatTraceparent produces a header value for outbound calls. Span-id is
// "0" * 16 until a real OTEL SDK wires actual spans in Sprint 5+.
func FormatTraceparent(traceID string) string {
	if traceID == "" {
		return ""
	}
	return "00-" + traceID + "-0000000000000000-01"
}

// SetOutboundHeader attaches the current trace-id (from ctx) onto an
// outbound *http.Request as a `traceparent` header. No-op when ctx has no
// trace bound or when the request already carries the header (caller-supplied
// values win — they may be re-issuing for a child span).
func SetOutboundHeader(ctx context.Context, req *http.Request) {
	if req.Header.Get(TraceparentHeader) != "" {
		return
	}
	tid := TraceIDFromContext(ctx)
	if tid == "" {
		return
	}
	req.Header.Set(TraceparentHeader, FormatTraceparent(tid))
}
