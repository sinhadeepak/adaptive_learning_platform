package alptelemetry

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestParseTraceparent_Recognised(t *testing.T) {
	tid := ParseTraceparent("00-0123456789abcdef0123456789abcdef-aaaaaaaaaaaaaaaa-01")
	if tid != "0123456789abcdef0123456789abcdef" {
		t.Errorf("unexpected: %q", tid)
	}
}

func TestParseTraceparent_Uppercase(t *testing.T) {
	tid := ParseTraceparent("00-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA-bbbbbbbbbbbbbbbb-00")
	if tid != strings.Repeat("a", 32) {
		t.Errorf("unexpected: %q", tid)
	}
}

func TestParseTraceparent_RejectsInvalid(t *testing.T) {
	cases := []string{
		"",
		"garbage",
		"00-short-aaaaaaaaaaaaaaaa-01",
		"00-" + strings.Repeat("0", 32) + "-aaaaaaaaaaaaaaaa-01", // all-zero invalid
	}
	for _, c := range cases {
		if got := ParseTraceparent(c); got != "" {
			t.Errorf("ParseTraceparent(%q) = %q, want empty", c, got)
		}
	}
}

func TestGenerateTraceID_FormatAndUniqueness(t *testing.T) {
	seen := make(map[string]struct{})
	for i := 0; i < 100; i++ {
		tid := GenerateTraceID()
		if len(tid) != 32 {
			t.Fatalf("len: %v", tid)
		}
		seen[tid] = struct{}{}
	}
	if len(seen) != 100 {
		t.Errorf("expected 100 unique, got %d", len(seen))
	}
}

func TestMiddleware_PropagatesInboundHeader(t *testing.T) {
	inbound := "00-11111111111111111111111111111111-2222222222222222-01"
	var seen string
	h := Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = TraceIDFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set(TraceparentHeader, inbound)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if seen != strings.Repeat("1", 32) {
		t.Errorf("ctx trace-id mismatch: %q", seen)
	}
	if !strings.HasPrefix(rec.Header().Get(TraceparentHeader), "00-"+strings.Repeat("1", 32)+"-") {
		t.Errorf("response header mismatch: %q", rec.Header().Get(TraceparentHeader))
	}
}

func TestMiddleware_GeneratesWhenInboundMissing(t *testing.T) {
	var seen string
	h := Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = TraceIDFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if len(seen) != 32 {
		t.Errorf("expected generated 32-hex, got %q", seen)
	}
	if !strings.Contains(rec.Header().Get(TraceparentHeader), seen) {
		t.Errorf("response header missing generated id")
	}
}

func TestSetOutboundHeader_AttachesWhenBound(t *testing.T) {
	ctx := WithTraceID(context.Background(), strings.Repeat("c", 32))
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "http://x/", nil)
	SetOutboundHeader(ctx, req)
	if got := req.Header.Get(TraceparentHeader); !strings.HasPrefix(got, "00-"+strings.Repeat("c", 32)+"-") {
		t.Errorf("outbound header mismatch: %q", got)
	}
}

func TestSetOutboundHeader_DoesNotClobber(t *testing.T) {
	ctx := WithTraceID(context.Background(), strings.Repeat("d", 32))
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "http://x/", nil)
	req.Header.Set(TraceparentHeader, "explicit-value")
	SetOutboundHeader(ctx, req)
	if got := req.Header.Get(TraceparentHeader); got != "explicit-value" {
		t.Errorf("clobbered: %q", got)
	}
}

func TestSlogHandler_AddsTraceIDFromContext(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(NewSlogHandler(slog.NewJSONHandler(&buf, nil)))
	ctx := WithTraceID(context.Background(), strings.Repeat("e", 32))
	logger.InfoContext(ctx, "hello")

	var rec map[string]any
	if err := json.Unmarshal(bytes.TrimSpace(buf.Bytes()), &rec); err != nil {
		t.Fatal(err)
	}
	if rec["trace_id"] != strings.Repeat("e", 32) {
		t.Errorf("trace_id: %v", rec["trace_id"])
	}
	if rec["msg"] != "hello" {
		t.Errorf("msg: %v", rec["msg"])
	}
}

func TestSlogHandler_NoAttrWhenUnbound(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(NewSlogHandler(slog.NewJSONHandler(&buf, nil)))
	logger.Info("no-trace")
	var rec map[string]any
	if err := json.Unmarshal(bytes.TrimSpace(buf.Bytes()), &rec); err != nil {
		t.Fatal(err)
	}
	if _, ok := rec["trace_id"]; ok {
		t.Errorf("trace_id should not appear when unbound: %v", rec)
	}
}
