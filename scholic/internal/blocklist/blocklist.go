// Package blocklist owns the static list of URL patterns where Scholic should
// be invisible (high-churn feeds, canvas/WebGL apps, real-time messengers).
//
// Source of truth is patterns.json checked into the repo. On startup the
// loader validates every regex compiles under Go's RE2 (the same engine the
// extension's JS RegExp can match — RE2 forbids lookaround/backreferences,
// so anything that loads here is also valid in the browser) and pushes the
// JSON to Redis under blocklistKey. The HTTP endpoint reads from Redis only.
package blocklist

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"time"

	"scholic/internal/database"
)

// Pattern is the JSON-friendly serialization shipped to the extension.
//
// Either Hostname (exact match) or HostnameRegex (RE2 string) is required.
// BlockPath / AllowPath are optional regex strings; absence means "match all".
type Pattern struct {
	Hostname      string `json:"hostname,omitempty"`
	HostnameRegex string `json:"hostnameRegex,omitempty"`
	BlockPath     string `json:"blockPath,omitempty"`
	AllowPath     string `json:"allowPath,omitempty"`
	Reason        string `json:"reason"`
}

const (
	blocklistKey = "scholic:blocklist:v1"
	blocklistTTL = 0 // no expiry; only rewritten on app startup
)

//go:embed patterns.json
var patternsJSON []byte

// LoadAndCache parses patterns.json, validates every regex compiles, and
// pushes the canonical JSON to Redis. Idempotent — safe to call on every
// startup. Failures are logged but non-fatal so the app still boots.
func LoadAndCache() {
	patterns, err := parseAndValidate(patternsJSON)
	if err != nil {
		log.Printf("[Blocklist] Failed to load patterns.json: %v", err)
		return
	}

	bytes, err := json.Marshal(patterns)
	if err != nil {
		log.Printf("[Blocklist] Failed to marshal patterns: %v", err)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := database.CacheSet(ctx, blocklistKey, string(bytes), blocklistTTL); err != nil {
		log.Printf("[Blocklist] Failed to cache to Redis: %v", err)
		return
	}
	log.Printf("[Blocklist] Loaded %d patterns into Redis", len(patterns))
}

// FetchFromCache returns the cached JSON string. On a Redis miss it re-loads
// from the embedded file (so the API never returns an empty list just because
// Redis got flushed mid-flight).
func FetchFromCache(ctx context.Context) (string, error) {
	val, err := database.CacheGet(ctx, blocklistKey)
	if err != nil {
		return "", err
	}
	if val != "" {
		return val, nil
	}

	patterns, err := parseAndValidate(patternsJSON)
	if err != nil {
		return "", err
	}
	bytes, err := json.Marshal(patterns)
	if err != nil {
		return "", err
	}
	// Best-effort re-cache; ignore error — the response can still be served.
	_ = database.CacheSet(ctx, blocklistKey, string(bytes), blocklistTTL)
	return string(bytes), nil
}

func parseAndValidate(data []byte) ([]Pattern, error) {
	var patterns []Pattern
	if err := json.Unmarshal(data, &patterns); err != nil {
		return nil, fmt.Errorf("parse patterns.json: %w", err)
	}
	for i, p := range patterns {
		if p.Hostname == "" && p.HostnameRegex == "" {
			return nil, fmt.Errorf("pattern %d: requires hostname or hostnameRegex", i)
		}
		if p.HostnameRegex != "" {
			if _, err := regexp.Compile(p.HostnameRegex); err != nil {
				return nil, fmt.Errorf("pattern %d hostnameRegex: %w", i, err)
			}
		}
		if p.BlockPath != "" {
			if _, err := regexp.Compile(p.BlockPath); err != nil {
				return nil, fmt.Errorf("pattern %d blockPath: %w", i, err)
			}
		}
		if p.AllowPath != "" {
			if _, err := regexp.Compile(p.AllowPath); err != nil {
				return nil, fmt.Errorf("pattern %d allowPath: %w", i, err)
			}
		}
	}
	return patterns, nil
}
