package adaptive

import (
	"context"
	"errors"
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/sony/gobreaker"
)

// stubInner implements Client and returns whatever its fields say.
type stubInner struct {
	abilityErr  error
	selectErr   error
	abilityCall int
	selectCall  int
}

func (s *stubInner) Ability(_ context.Context, _ AbilityRequest) (AbilityResponse, error) {
	s.abilityCall++
	if s.abilityErr != nil {
		return AbilityResponse{}, s.abilityErr
	}
	return AbilityResponse{Theta: 0.5, SE: 0.5, N: 1}, nil
}

func (s *stubInner) SelectNext(_ context.Context, _ SelectNextRequest) (SelectNextResponse, error) {
	s.selectCall++
	if s.selectErr != nil {
		return SelectNextResponse{}, s.selectErr
	}
	id := "x"
	return SelectNextResponse{ItemID: &id}, nil
}

func newBreaker(t *testing.T, inner Client) *BreakerClient {
	t.Helper()
	// Fresh registry per test so Prometheus collectors don't collide.
	return NewBreakerClient(inner, prometheus.NewRegistry())
}

func TestBreakerPassesThroughOnSuccess(t *testing.T) {
	inner := &stubInner{}
	bc := newBreaker(t, inner)
	resp, err := bc.Ability(context.Background(), AbilityRequest{})
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if resp.Theta != 0.5 {
		t.Errorf("want theta=0.5, got %v", resp.Theta)
	}
	if bc.State() != gobreaker.StateClosed {
		t.Errorf("breaker should still be CLOSED after success, got %v", bc.State())
	}
}

func TestBreakerTripsAfterConsecutiveFailures(t *testing.T) {
	inner := &stubInner{abilityErr: errors.New("boom")}
	bc := newBreaker(t, inner)
	// 5 consecutive failures => trip
	for i := 0; i < 5; i++ {
		_, err := bc.Ability(context.Background(), AbilityRequest{})
		if err == nil {
			t.Fatalf("step %d: expected error", i)
		}
		if !errors.Is(err, inner.abilityErr) {
			t.Errorf("step %d: want underlying err, got %v", i, err)
		}
	}
	if bc.State() != gobreaker.StateOpen {
		t.Fatalf("after 5 failures breaker must be OPEN, got %v", bc.State())
	}
	// 6th call should NOT reach the inner stub — it returns ErrBreakerOpen immediately.
	beforeCount := inner.abilityCall
	_, err := bc.Ability(context.Background(), AbilityRequest{})
	if !errors.Is(err, ErrBreakerOpen) {
		t.Errorf("want ErrBreakerOpen, got %v", err)
	}
	if inner.abilityCall != beforeCount {
		t.Errorf("breaker should short-circuit; inner was called %d times (was %d)", inner.abilityCall, beforeCount)
	}
}

func TestBreakerSelectNextSharesState(t *testing.T) {
	// Failures on Ability count toward the same breaker that gates SelectNext —
	// the whole adaptive engine is one upstream from Quiz's perspective.
	inner := &stubInner{abilityErr: errors.New("down")}
	bc := newBreaker(t, inner)
	for i := 0; i < 5; i++ {
		_, _ = bc.Ability(context.Background(), AbilityRequest{})
	}
	// Now SelectNext should also short-circuit.
	beforeSelect := inner.selectCall
	_, err := bc.SelectNext(context.Background(), SelectNextRequest{})
	if !errors.Is(err, ErrBreakerOpen) {
		t.Errorf("SelectNext should be rejected; got %v", err)
	}
	if inner.selectCall != beforeSelect {
		t.Errorf("inner.SelectNext should not have been called when breaker is OPEN")
	}
}
