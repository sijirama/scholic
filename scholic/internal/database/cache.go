package database

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Cache TTLs — centralised so they're easy to tune.
const (
	TTLAnnotationsURL = 1 * time.Minute   // annotations for a specific page URL
	TTLFeed           = 2 * time.Minute   // personalised feed results
	TTLUserProfile    = 10 * time.Minute  // public profile + follower counts
	TTLRecentlyRead   = 5 * time.Minute   // recently-read sites per user
	TTLFriendsReading = 3 * time.Minute   // pages people the user follows have annotated recently
)

// Cache key helpers — all keys are prefixed with "scholic:" for namespacing.
//
// Invalidation strategy:
//   - CreateAnnotation  → delete AnnotationsURLKey(url) + RecentlyReadKey(username) + FeedKey("*")
//   - DeleteAnnotation  → delete AnnotationsURLKey(url) + RecentlyReadKey(username) + FeedKey("*")
//   - UpdateProfile     → delete UserProfileKey(username)

func AnnotationsURLKey(encodedURL string) string {
	return "scholic:annotations:" + encodedURL
}

func FeedKeyPattern() string {
	return "scholic:feed:*"
}

func FeedKey(userID uint, limit, offset int) string {
	return fmt.Sprintf("scholic:feed:%d:%d:%d", userID, limit, offset)
}

func UserProfileKey(username string) string {
	return "scholic:profile:" + username
}

// RecentlyReadPageKey is the exact cache key for one page of recently-read results.
// Paginated separately so each page is independently cached.
func RecentlyReadPageKey(username string, limit, offset int) string {
	return fmt.Sprintf("scholic:recently_read:%s:%d:%d", username, limit, offset)
}

// RecentlyReadKeyPattern matches ALL cached pages for a user.
// Use this for invalidation — clears every page at once.
func RecentlyReadKeyPattern(username string) string {
	return fmt.Sprintf("scholic:recently_read:%s:*", username)
}

// FriendsReadingPageKey is the exact cache key for one page of friends-reading
// (pages from users the given user follows).
func FriendsReadingPageKey(username string, limit, offset int) string {
	return fmt.Sprintf("scholic:friends_reading:%s:%d:%d", username, limit, offset)
}

// CacheGet returns the cached string value for key.
// Returns ("", nil) on a cache miss so callers can distinguish miss from error.
func CacheGet(ctx context.Context, key string) (string, error) {
	val, err := Redis.Get(ctx, key).Result()
	if err == redis.Nil {
		return "", nil
	}
	return val, err
}

// CacheSet stores a string value with a TTL.
func CacheSet(ctx context.Context, key, value string, ttl time.Duration) error {
	return Redis.Set(ctx, key, value, ttl).Err()
}

// CacheDelete removes one or more exact keys.
func CacheDelete(ctx context.Context, keys ...string) error {
	if len(keys) == 0 {
		return nil
	}
	return Redis.Del(ctx, keys...).Err()
}

// CacheDeletePattern removes all keys matching a glob pattern (e.g. "scholic:feed:*").
// Uses SCAN under the hood to avoid blocking with KEYS on large datasets.
func CacheDeletePattern(ctx context.Context, pattern string) error {
	var cursor uint64
	for {
		keys, nextCursor, err := Redis.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			return err
		}
		if len(keys) > 0 {
			if err := Redis.Del(ctx, keys...).Err(); err != nil {
				return err
			}
		}
		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}
	return nil
}
