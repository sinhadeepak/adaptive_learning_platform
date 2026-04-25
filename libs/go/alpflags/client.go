// Package alpflags is the Go feature-flag SDK — counterpart of libs/python/alp_flags.
//
// Lookup order: local TTL cache → Institution HTTP /flags/:name → hardcoded fallback.
// Tenant override beats global default. NATS flag.changed subscription invalidates the
// cache entry on receipt; if NATS is unreachable the SDK falls through to TTL polling.
package alpflags

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/nats-io/nats.go"
)

// Options configures a Client. NatsURL is optional — empty disables NATS invalidation.
type Options struct {
	InstitutionURL string
	NatsURL        string
	Fallbacks      map[string]bool
	CacheTTL       time.Duration
	HTTPTimeout    time.Duration
	Logger         *slog.Logger
}

// Client evaluates feature flags. Construct via New, call Connect, then Evaluate.
// Close releases the NATS subscription.
type Client struct {
	opts   Options
	cache  *ttlCache
	http   *http.Client
	logger *slog.Logger

	mu   sync.Mutex
	nc   *nats.Conn
	sub  *nats.Subscription
}

// New constructs a Client. Fallbacks must include every flag the consumer evaluates;
// Evaluate returns an error if a flag is queried without a declared fallback.
func New(opts Options) *Client {
	if opts.CacheTTL == 0 {
		opts.CacheTTL = 30 * time.Second
	}
	if opts.HTTPTimeout == 0 {
		opts.HTTPTimeout = 1500 * time.Millisecond
	}
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	if opts.Fallbacks == nil {
		opts.Fallbacks = map[string]bool{}
	}
	return &Client{
		opts:   opts,
		cache:  newTTLCache(opts.CacheTTL),
		http:   &http.Client{Timeout: opts.HTTPTimeout},
		logger: opts.Logger,
	}
}

// Connect opens the NATS subscription if NatsURL was supplied. NATS failures are non-fatal.
func (c *Client) Connect(ctx context.Context) error {
	if c.opts.NatsURL == "" {
		return nil
	}
	c.mu.Lock()
	defer c.mu.Unlock()

	nc, err := nats.Connect(c.opts.NatsURL,
		nats.Timeout(2*time.Second),
		nats.RetryOnFailedConnect(false),
	)
	if err != nil {
		c.logger.Warn("alpflags nats connect failed; running poll-only", "err", err)
		return nil
	}
	c.nc = nc

	sub, err := nc.Subscribe("flag.changed", func(msg *nats.Msg) {
		var payload struct {
			FlagName string `json:"flag_name"`
		}
		if err := json.Unmarshal(msg.Data, &payload); err != nil {
			c.logger.Warn("alpflags bad flag.changed payload", "err", err)
			return
		}
		if payload.FlagName != "" {
			c.cache.invalidate(payload.FlagName)
		}
	})
	if err != nil {
		c.logger.Warn("alpflags nats subscribe failed", "err", err)
		nc.Close()
		c.nc = nil
		return nil
	}
	c.sub = sub
	c.logger.Info("alpflags subscribed to NATS flag.changed")
	return nil
}

// Close drains the NATS subscription. Safe to call multiple times.
func (c *Client) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.sub != nil {
		_ = c.sub.Drain()
		c.sub = nil
	}
	if c.nc != nil {
		c.nc.Close()
		c.nc = nil
	}
	return nil
}

// Evaluate looks up the flag value, preferring (in order) local cache, Institution HTTP,
// then the hardcoded fallback. Pass tenantID="" for the global default.
func (c *Client) Evaluate(ctx context.Context, flag, tenantID string) (bool, error) {
	key := cacheKey{flag: flag, tenant: tenantID}
	if v, ok := c.cache.get(key); ok {
		return v, nil
	}
	v, err := c.fetch(ctx, flag, tenantID)
	if err != nil {
		return v, err
	}
	c.cache.put(key, v)
	return v, nil
}

type flagDetail struct {
	Name         string             `json:"name"`
	DefaultValue bool               `json:"defaultValue"`
	Overrides    []flagOverrideJSON `json:"overrides"`
}

type flagOverrideJSON struct {
	TenantID string `json:"tenantId"`
	Value    bool   `json:"value"`
}

func (c *Client) fetch(ctx context.Context, flag, tenantID string) (bool, error) {
	url := fmt.Sprintf("%s/flags/%s", c.opts.InstitutionURL, flag)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return c.fallback(flag, fmt.Errorf("build request: %w", err))
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return c.fallback(flag, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return c.fallback(flag, errors.New("flag_unknown"))
	}
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return c.fallback(flag, fmt.Errorf("institution status %d: %s", resp.StatusCode, body))
	}

	var detail flagDetail
	if err := json.NewDecoder(resp.Body).Decode(&detail); err != nil {
		return c.fallback(flag, fmt.Errorf("decode: %w", err))
	}

	if tenantID != "" {
		for _, o := range detail.Overrides {
			if o.TenantID == tenantID {
				return o.Value, nil
			}
		}
	}
	return detail.DefaultValue, nil
}

func (c *Client) fallback(flag string, reason error) (bool, error) {
	v, ok := c.opts.Fallbacks[flag]
	if !ok {
		return false, fmt.Errorf("alpflags: no fallback for flag %q (declare it in Options.Fallbacks): %w", flag, reason)
	}
	c.logger.Warn("alpflags using hardcoded fallback", "flag", flag, "reason", reason)
	return v, nil
}

// CacheSize is exposed for tests and operational metrics.
func (c *Client) CacheSize() int { return c.cache.size() }
