package middleware

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"scholic/internal/limits"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// limiterStore holds one token-bucket per key (IP or user ID). Idle buckets
// are evicted by a background goroutine so the map can't grow unbounded under
// scan-style traffic.
type limiterStore struct {
	mu      sync.Mutex
	buckets map[string]*limiterEntry
	rate    rate.Limit
	burst   int
	ttl     time.Duration
}

type limiterEntry struct {
	limiter *rate.Limiter
	seen    time.Time
}

func newLimiterStore(perMinute, burst int, ttl time.Duration) *limiterStore {
	s := &limiterStore{
		buckets: make(map[string]*limiterEntry),
		rate:    rate.Limit(float64(perMinute) / 60.0),
		burst:   burst,
		ttl:     ttl,
	}
	go s.gcLoop()
	return s
}

func (s *limiterStore) gcLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		cutoff := time.Now().Add(-s.ttl)
		s.mu.Lock()
		for k, e := range s.buckets {
			if e.seen.Before(cutoff) {
				delete(s.buckets, k)
			}
		}
		s.mu.Unlock()
	}
}

func (s *limiterStore) allow(key string) bool {
	s.mu.Lock()
	e, ok := s.buckets[key]
	if !ok {
		e = &limiterEntry{limiter: rate.NewLimiter(s.rate, s.burst)}
		s.buckets[key] = e
	}
	e.seen = time.Now()
	limiter := e.limiter
	s.mu.Unlock()
	return limiter.Allow()
}

var (
	ipStore        = newLimiterStore(limits.IPRequestsPerMinute, limits.IPBurst, limits.LimiterIdleTTL)
	userWriteStore = newLimiterStore(limits.UserWritesPerMinute, limits.UserWriteBurst, limits.LimiterIdleTTL)
)

// IPRateLimit throttles every request by client IP. Configure the rate via
// limits.IPRequestsPerMinute / limits.IPBurst.
func IPRateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if ip == "" {
			c.Next()
			return
		}
		if !ipStore.allow(ip) {
			c.Header("Retry-After", "1")
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "Too many requests. Please slow down."})
			c.Abort()
			return
		}
		c.Next()
	}
}

// UserWriteRateLimit throttles writes per authenticated user. Mount it AFTER
// AuthMiddleware on the route group that owns the write endpoints.
//
// If the request isn't authenticated this middleware is a no-op — the
// per-IP limit and the auth middleware already cover that case.
func UserWriteRateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		v, ok := c.Get("userID")
		if !ok {
			c.Next()
			return
		}
		userID, ok := v.(uint)
		if !ok || userID == 0 {
			c.Next()
			return
		}
		if !userWriteStore.allow(strconv.FormatUint(uint64(userID), 10)) {
			c.Header("Retry-After", "1")
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "You're posting too quickly. Slow down a bit."})
			c.Abort()
			return
		}
		c.Next()
	}
}
