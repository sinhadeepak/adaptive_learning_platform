// Circuit breaker around the adaptive HTTP client (GAP-01 closure).
//
// The breaker wraps every call to /irt/ability + /irt/select-next so a flapping
// or dead Adaptive Engine doesn't cascade slowness/timeouts back into Quiz —
// once the failure rate crosses the threshold the breaker trips OPEN and
// `Ability/SelectNext` return ErrBreakerOpen immediately. SessionService's
// `pickNext` already falls back to the local closest-difficulty heuristic on
// any error, so a tripped breaker degrades gracefully.
//
// Prometheus metrics exposed for ops dashboards + PagerDuty alerts:
//   alp_quiz_adaptive_breaker_state{state} — gauge (0 = closed, 1 = half-open, 2 = open)
//   alp_quiz_adaptive_breaker_requests_total{op, outcome} — counter
//   alp_quiz_adaptive_breaker_state_changes_total{from, to} — counter
//
// Tuning: 5 consecutive failures over a 60-second window trips the breaker;
// it tries one probe after a 30-second timeout (HALF-OPEN). Two successes
// while half-open close it again. Numbers from GAP-01 LLD; tunable via env
// once we have staging telemetry.

package adaptive

import (
	"context"
	"errors"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/sony/gobreaker"
)

var ErrBreakerOpen = errors.New("adaptive: circuit breaker open")

type BreakerClient struct {
	inner Client
	cb    *gobreaker.CircuitBreaker
	m     *breakerMetrics
}

// NewBreakerClient wraps `inner` with a circuit breaker. The breaker uses the
// gobreaker defaults that match the GAP-01 LLD numbers and emits Prometheus
// metrics through the supplied registry. Pass `prometheus.DefaultRegisterer`
// in production; tests pass a fresh registry to avoid duplicate registration.
func NewBreakerClient(inner Client, reg prometheus.Registerer) *BreakerClient {
	m := newBreakerMetrics(reg)
	cb := gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name: "adaptive-engine",
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			return counts.ConsecutiveFailures >= 5
		},
		OnStateChange: func(_ string, from, to gobreaker.State) {
			m.stateChanges.WithLabelValues(from.String(), to.String()).Inc()
			m.state.Set(stateValue(to))
		},
	})
	m.state.Set(stateValue(gobreaker.StateClosed))
	return &BreakerClient{inner: inner, cb: cb, m: m}
}

// State exposes the current breaker state for tests / introspection.
func (b *BreakerClient) State() gobreaker.State { return b.cb.State() }

func (b *BreakerClient) Ability(ctx context.Context, req AbilityRequest) (AbilityResponse, error) {
	out, err := b.cb.Execute(func() (any, error) {
		resp, err := b.inner.Ability(ctx, req)
		b.m.observe("ability", err)
		return resp, err
	})
	if err != nil {
		if errors.Is(err, gobreaker.ErrOpenState) || errors.Is(err, gobreaker.ErrTooManyRequests) {
			b.m.requests.WithLabelValues("ability", "rejected").Inc()
			return AbilityResponse{}, ErrBreakerOpen
		}
		return AbilityResponse{}, err
	}
	return out.(AbilityResponse), nil
}

func (b *BreakerClient) SelectNext(ctx context.Context, req SelectNextRequest) (SelectNextResponse, error) {
	out, err := b.cb.Execute(func() (any, error) {
		resp, err := b.inner.SelectNext(ctx, req)
		b.m.observe("select_next", err)
		return resp, err
	})
	if err != nil {
		if errors.Is(err, gobreaker.ErrOpenState) || errors.Is(err, gobreaker.ErrTooManyRequests) {
			b.m.requests.WithLabelValues("select_next", "rejected").Inc()
			return SelectNextResponse{}, ErrBreakerOpen
		}
		return SelectNextResponse{}, err
	}
	return out.(SelectNextResponse), nil
}

func stateValue(s gobreaker.State) float64 {
	switch s {
	case gobreaker.StateClosed:
		return 0
	case gobreaker.StateHalfOpen:
		return 1
	case gobreaker.StateOpen:
		return 2
	}
	return -1
}

type breakerMetrics struct {
	state        prometheus.Gauge
	requests     *prometheus.CounterVec
	stateChanges *prometheus.CounterVec
}

func newBreakerMetrics(reg prometheus.Registerer) *breakerMetrics {
	m := &breakerMetrics{
		state: prometheus.NewGauge(prometheus.GaugeOpts{
			Namespace: "alp_quiz",
			Subsystem: "adaptive_breaker",
			Name:      "state",
			Help:      "Current circuit breaker state for Adaptive Engine (0=closed, 1=half-open, 2=open).",
		}),
		requests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: "alp_quiz",
			Subsystem: "adaptive_breaker",
			Name:      "requests_total",
			Help:      "Adaptive Engine requests through the breaker, by op + outcome (success/failure/rejected).",
		}, []string{"op", "outcome"}),
		stateChanges: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: "alp_quiz",
			Subsystem: "adaptive_breaker",
			Name:      "state_changes_total",
			Help:      "Adaptive Engine breaker state transitions.",
		}, []string{"from", "to"}),
	}
	// Best-effort registration: tests pass a fresh registry; production
	// passes the global one which may already have these names if the
	// service hot-reloads. AlreadyRegistered is silently ignored.
	for _, c := range []prometheus.Collector{m.state, m.requests, m.stateChanges} {
		if err := reg.Register(c); err != nil {
			var are prometheus.AlreadyRegisteredError
			if errors.As(err, &are) {
				// Reuse the existing collectors so all instances share counters.
				if existing, ok := are.ExistingCollector.(prometheus.Gauge); ok && c == any(m.state).(prometheus.Collector) {
					m.state = existing
				}
			}
		}
	}
	return m
}

func (m *breakerMetrics) observe(op string, err error) {
	outcome := "success"
	if err != nil {
		outcome = "failure"
	}
	m.requests.WithLabelValues(op, outcome).Inc()
}

// Compile-time guard: BreakerClient implements Client.
var _ Client = (*BreakerClient)(nil)
