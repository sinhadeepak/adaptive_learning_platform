package alpflags

import (
	"context"
	"strings"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func newTestClient(t *testing.T, handler http.Handler, fallbacks map[string]bool) (*Client, *httptest.Server) {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	c := New(Options{
		InstitutionURL: srv.URL,
		Fallbacks:      fallbacks,
	})
	return c, srv
}

func writeFlag(w http.ResponseWriter, name string, def bool, overrides ...flagOverrideJSON) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(flagDetail{Name: name, DefaultValue: def, Overrides: overrides})
}

func TestEvaluate_GlobalDefault(t *testing.T) {
	c, _ := newTestClient(t,
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/flags/email_channel_enabled" {
				t.Fatalf("unexpected path: %s", r.URL.Path)
			}
			writeFlag(w, "email_channel_enabled", true)
		}),
		map[string]bool{"email_channel_enabled": false},
	)

	v, err := c.Evaluate(context.Background(), "email_channel_enabled", "")
	if err != nil {
		t.Fatal(err)
	}
	if !v {
		t.Errorf("want true, got %v", v)
	}
}

func TestEvaluate_TenantOverrideBeatsDefault(t *testing.T) {
	c, _ := newTestClient(t,
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			writeFlag(w, "irt_model_enabled", false,
				flagOverrideJSON{TenantID: "tenant-A", Value: true},
				flagOverrideJSON{TenantID: "tenant-B", Value: false},
			)
		}),
		map[string]bool{"irt_model_enabled": false},
	)

	cases := []struct {
		tenant string
		want   bool
	}{
		{"tenant-A", true},
		{"tenant-B", false},
		{"tenant-C", false},
		{"", false},
	}
	for _, tc := range cases {
		got, err := c.Evaluate(context.Background(), "irt_model_enabled", tc.tenant)
		if err != nil {
			t.Fatalf("tenant=%q: %v", tc.tenant, err)
		}
		if got != tc.want {
			t.Errorf("tenant=%q: want %v, got %v", tc.tenant, tc.want, got)
		}
	}
}

func TestEvaluate_CacheAvoidsSecondCall(t *testing.T) {
	var calls atomic.Int64
	c, _ := newTestClient(t,
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			calls.Add(1)
			writeFlag(w, "email_channel_enabled", true)
		}),
		map[string]bool{"email_channel_enabled": false},
	)

	for i := 0; i < 3; i++ {
		v, err := c.Evaluate(context.Background(), "email_channel_enabled", "")
		if err != nil || !v {
			t.Fatalf("iter %d: v=%v err=%v", i, v, err)
		}
	}
	if got := calls.Load(); got != 1 {
		t.Errorf("expected 1 institution call, got %d", got)
	}
}

func TestFetch_500FallsBack(t *testing.T) {
	c, _ := newTestClient(t,
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "boom", 500)
		}),
		map[string]bool{"checkout_enabled": false},
	)

	v, err := c.Evaluate(context.Background(), "checkout_enabled", "")
	if err != nil {
		t.Fatal(err)
	}
	if v {
		t.Errorf("want fallback false, got true")
	}
}

func TestFetch_404FallsBack(t *testing.T) {
	c, _ := newTestClient(t,
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			http.NotFound(w, nil)
		}),
		map[string]bool{"new_experiment": true},
	)

	v, err := c.Evaluate(context.Background(), "new_experiment", "")
	if err != nil {
		t.Fatal(err)
	}
	if !v {
		t.Errorf("want fallback true, got false")
	}
}

func TestEvaluate_UnknownFallbackErrors(t *testing.T) {
	c, _ := newTestClient(t,
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "boom", 500)
		}),
		map[string]bool{},
	)

	_, err := c.Evaluate(context.Background(), "undeclared_flag", "")
	if err == nil {
		t.Fatal("expected error for undeclared fallback")
	}
	if !errors.Is(err, err) {
		// just sanity-check it's a real error
	}
}

func TestInvalidateDropsAllTenantEntries(t *testing.T) {
	var calls atomic.Int64
	c, _ := newTestClient(t,
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			calls.Add(1)
			writeFlag(w, "irt_model_enabled", false,
				flagOverrideJSON{TenantID: "tenant-A", Value: true},
			)
		}),
		map[string]bool{"irt_model_enabled": false},
	)

	if _, err := c.Evaluate(context.Background(), "irt_model_enabled", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Evaluate(context.Background(), "irt_model_enabled", "tenant-A"); err != nil {
		t.Fatal(err)
	}
	if got := c.CacheSize(); got != 2 {
		t.Errorf("want cache size 2, got %d", got)
	}
	if got := calls.Load(); got != 2 {
		t.Errorf("want 2 fetches, got %d", got)
	}

	c.cache.invalidate("irt_model_enabled")
	if got := c.CacheSize(); got != 0 {
		t.Errorf("want cache size 0 after invalidate, got %d", got)
	}

	if _, err := c.Evaluate(context.Background(), "irt_model_enabled", ""); err != nil {
		t.Fatal(err)
	}
	if got := calls.Load(); got != 3 {
		t.Errorf("want 3 fetches after re-eval, got %d", got)
	}
}

// ---- GAP-25 OnDecision hook ----

func TestOnDecision_LabelsCacheVsInstitution(t *testing.T) {
	var decisions []Decision
	c := New(Options{
		InstitutionURL: "",
		Fallbacks:      map[string]bool{"email_channel_enabled": false},
		OnDecision:     func(d Decision) { decisions = append(decisions, d) },
	})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeFlag(w, "email_channel_enabled", true)
	}))
	t.Cleanup(srv.Close)
	c.opts.InstitutionURL = srv.URL

	// First call — institution path.
	if _, err := c.Evaluate(context.Background(), "email_channel_enabled", ""); err != nil {
		t.Fatal(err)
	}
	if len(decisions) != 1 || decisions[0].Source != "institution" || !decisions[0].Value {
		t.Fatalf("expected 1 decision source=institution value=true, got %+v", decisions)
	}

	// Second call — cache path.
	if _, err := c.Evaluate(context.Background(), "email_channel_enabled", ""); err != nil {
		t.Fatal(err)
	}
	if len(decisions) != 2 || decisions[1].Source != "cache" {
		t.Fatalf("expected 2nd decision source=cache, got %+v", decisions)
	}
}

func TestOnDecision_LabelsFallbackWithReason(t *testing.T) {
	var decisions []Decision
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)
	c := New(Options{
		InstitutionURL: srv.URL,
		Fallbacks:      map[string]bool{"checkout_enabled": false},
		OnDecision:     func(d Decision) { decisions = append(decisions, d) },
	})

	v, err := c.Evaluate(context.Background(), "checkout_enabled", "")
	if err != nil || v {
		t.Fatalf("want false fallback, got v=%v err=%v", v, err)
	}
	if len(decisions) != 1 {
		t.Fatalf("want 1 decision, got %d", len(decisions))
	}
	if decisions[0].Source != "fallback" {
		t.Errorf("want source=fallback, got %q", decisions[0].Source)
	}
	if !strings.Contains(decisions[0].FallbackReason, "institution_error") {
		t.Errorf("want fallback_reason to carry institution_error, got %q", decisions[0].FallbackReason)
	}
}

func TestOnDecision_HookPanicDoesNotBreakEvaluate(t *testing.T) {
	c := New(Options{
		InstitutionURL: "",
		Fallbacks:      map[string]bool{"x": true},
		OnDecision:     func(_ Decision) { panic("logging crashed") },
	})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeFlag(w, "x", true)
	}))
	t.Cleanup(srv.Close)
	c.opts.InstitutionURL = srv.URL

	v, err := c.Evaluate(context.Background(), "x", "")
	if err != nil {
		t.Fatalf("hook panic should not surface; got %v", err)
	}
	if !v {
		t.Errorf("evaluate must still return correct value")
	}
}
