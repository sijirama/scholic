package database

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/redis/go-redis/v9"
)

// Redis is the shared Redis client. Use this for all cache operations.
var Redis *redis.Client

// InitializeRedis connects to Redis and verifies the connection with a PING.
//
// Connection is configured from environment variables. Two formats are supported:
//
//	REDIS_URL  — full connection string, e.g. redis://default:password@host:6379/0
//	             Takes precedence over the individual vars below.
//	REDIS_HOST / REDIS_PORT / REDIS_PASSWORD — individual vars (default: localhost:6379)
//
// Calls log.Fatal on failure — the server should not start without Redis.
func InitializeRedis() {
	var opts *redis.Options
	var displayAddr string

	if redisURL := os.Getenv("REDIS_URL"); redisURL != "" {
		// Parse the full connection string (redis:// or rediss:// for TLS)
		parsed, err := redis.ParseURL(redisURL)
		if err != nil {
			log.Fatalf("[Scholic] Invalid REDIS_URL: %v", err)
		}
		opts = parsed
		displayAddr = opts.Addr
	} else {
		host := os.Getenv("REDIS_HOST")
		port := os.Getenv("REDIS_PORT")
		password := os.Getenv("REDIS_PASSWORD")
		if host == "" {
			host = "localhost"
		}
		if port == "" {
			port = "6379"
		}
		displayAddr = fmt.Sprintf("%s:%s", host, port)
		opts = &redis.Options{
			Addr:     displayAddr,
			Password: password,
			DB:       0,
		}
	}

	Redis = redis.NewClient(opts)

	ctx := context.Background()
	if _, err := Redis.Ping(ctx).Result(); err != nil {
		log.Fatalf("[Scholic] Failed to connect to Redis at %s — %v", displayAddr, err)
	}

	log.Printf("[Scholic] Redis connected at %s", displayAddr)
}
