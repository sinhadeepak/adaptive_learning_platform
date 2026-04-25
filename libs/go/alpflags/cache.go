package alpflags

import (
	"sync"
	"time"
)

type cacheKey struct {
	flag   string
	tenant string // empty string == no tenant
}

type cacheEntry struct {
	value     bool
	expiresAt time.Time
}

// ttlCache is a thread-safe TTL cache keyed by (flag, tenant).
// invalidate(flag) drops every tenant entry for that flag in one shot.
type ttlCache struct {
	mu  sync.Mutex
	ttl time.Duration
	m   map[cacheKey]cacheEntry
}

func newTTLCache(ttl time.Duration) *ttlCache {
	return &ttlCache{ttl: ttl, m: make(map[cacheKey]cacheEntry)}
}

func (c *ttlCache) get(k cacheKey) (bool, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[k]
	if !ok {
		return false, false
	}
	if time.Now().After(e.expiresAt) {
		delete(c.m, k)
		return false, false
	}
	return e.value, true
}

func (c *ttlCache) put(k cacheKey, v bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.m[k] = cacheEntry{value: v, expiresAt: time.Now().Add(c.ttl)}
}

// invalidate drops every entry for the given flag (across all tenants).
func (c *ttlCache) invalidate(flag string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for k := range c.m {
		if k.flag == flag {
			delete(c.m, k)
		}
	}
}

func (c *ttlCache) size() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.m)
}
