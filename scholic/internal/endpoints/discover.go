package endpoints

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strconv"
	"time"

	"scholic/internal/database"
	"scholic/internal/discover"
	"scholic/internal/models"

	"github.com/gin-gonic/gin"
)

const (
	discoverFirstReadDelay = 100 * time.Millisecond
	peopleToFollowDisplay  = 30
	onPagesDisplay         = 12
)

// GetDiscover handles GET /api/discover
//
// Reads precomputed rails from Redis. The first request after server start
// retries once with a small delay so the warm-up tick has a chance to land.
// Per-user filtering is applied to the people-to-follow + on-pages-youve-read
// rails using the viewer's follow set + URL set; the global rails are returned
// as-is.
func GetDiscover(c *gin.Context) {
	ctx := c.Request.Context()

	topAnnotationsJSON, _ := readDiscoverWithRetry(ctx, discover.KeyTopAnnotations)
	trendingPagesJSON, _ := readDiscoverWithRetry(ctx, discover.KeyTrendingPages)
	topAuthorsJSON, _ := database.CacheGet(ctx, discover.KeyTopAuthors)
	urlPoolJSON, _ := database.CacheGet(ctx, discover.KeyURLPool)
	lastRefreshStr, _ := database.CacheGet(ctx, discover.KeyLastRefresh)

	var viewerID uint
	if uid, ok := c.Get("userID"); ok {
		if u, ok := uid.(uint); ok {
			viewerID = u
		}
	}

	peopleToFollow := filterPeopleToFollow(viewerID, topAuthorsJSON)
	onPagesYouveRead := filterOnPagesYouveRead(viewerID, urlPoolJSON)

	var lastRefresh int64
	if lastRefreshStr != "" {
		lastRefresh, _ = strconv.ParseInt(lastRefreshStr, 10, 64)
	}

	c.JSON(http.StatusOK, gin.H{
		"trendingAnnotations": rawJSON(topAnnotationsJSON),
		"trendingPages":       rawJSON(trendingPagesJSON),
		"peopleToFollow":      peopleToFollow,
		"onPagesYouveRead":    onPagesYouveRead,
		"lastRefresh":         lastRefresh,
	})
}

// RefreshDiscover handles POST /api/admin/discover/refresh
//
// Triggers a synchronous RefreshAll. Token-gated by ADMIN_REFRESH_TOKEN env
// var (Authorization: Bearer <token>). If the env var is unset the endpoint
// is disabled — fail closed.
func RefreshDiscover(c *gin.Context) {
	want := os.Getenv("ADMIN_REFRESH_TOKEN")
	if want == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "not enabled"})
		return
	}
	got := c.GetHeader("Authorization")
	if got != "Bearer "+want {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if err := discover.RefreshAll(c.Request.Context()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// readDiscoverWithRetry reads a key, and if empty, sleeps briefly and retries
// once. Covers the narrow window between server start and the warm-up tick
// finishing.
func readDiscoverWithRetry(ctx context.Context, key string) (string, error) {
	val, err := database.CacheGet(ctx, key)
	if err == nil && val != "" {
		return val, nil
	}
	select {
	case <-time.After(discoverFirstReadDelay):
	case <-ctx.Done():
		return "", ctx.Err()
	}
	return database.CacheGet(ctx, key)
}

// rawJSON wraps a JSON string so gin will splice it into the response without
// re-marshalling. Returns an empty array on miss so the frontend doesn't have
// to handle null.
func rawJSON(s string) json.RawMessage {
	if s == "" {
		return json.RawMessage("[]")
	}
	return json.RawMessage(s)
}

// filterPeopleToFollow drops the viewer + anyone they already follow from the
// cached author pool, then trims to the visible size. Anonymous viewers see
// the pool unchanged (capped).
func filterPeopleToFollow(viewerID uint, poolJSON string) []discover.TopAuthor {
	if poolJSON == "" {
		return []discover.TopAuthor{}
	}
	var pool []discover.TopAuthor
	if err := json.Unmarshal([]byte(poolJSON), &pool); err != nil {
		return []discover.TopAuthor{}
	}

	if viewerID == 0 {
		if len(pool) > peopleToFollowDisplay {
			return pool[:peopleToFollowDisplay]
		}
		return pool
	}

	ids := make([]uint, 0, len(pool))
	for _, a := range pool {
		ids = append(ids, a.ID)
	}
	following := batchIsFollowing(viewerID, ids)

	out := make([]discover.TopAuthor, 0, peopleToFollowDisplay)
	for _, a := range pool {
		if a.ID == viewerID || following[a.ID] {
			continue
		}
		out = append(out, a)
		if len(out) >= peopleToFollowDisplay {
			break
		}
	}
	return out
}

// filterOnPagesYouveRead intersects the cached URL pool with the viewer's
// distinct annotation URLs and flattens to a chronologically-ordered set of
// annotations. Anonymous viewers get nothing.
func filterOnPagesYouveRead(viewerID uint, poolJSON string) []models.Annotation {
	if viewerID == 0 || poolJSON == "" {
		return []models.Annotation{}
	}
	var pool []discover.PoolURL
	if err := json.Unmarshal([]byte(poolJSON), &pool); err != nil {
		return []models.Annotation{}
	}

	urlList := make([]string, len(pool))
	for i, p := range pool {
		urlList[i] = p.URL
	}
	if len(urlList) == 0 {
		return []models.Annotation{}
	}

	var viewerURLs []string
	database.DB.Model(&models.Annotation{}).
		Where("user_id = ? AND is_private = false AND deleted_at IS NULL AND url IN ?", viewerID, urlList).
		Distinct("url").
		Pluck("url", &viewerURLs)
	if len(viewerURLs) == 0 {
		return []models.Annotation{}
	}
	viewerURLSet := make(map[string]bool, len(viewerURLs))
	for _, u := range viewerURLs {
		viewerURLSet[u] = true
	}

	out := make([]models.Annotation, 0, onPagesDisplay*4)
	urlsKept := 0
	for _, p := range pool {
		if !viewerURLSet[p.URL] {
			continue
		}
		for _, a := range p.Annotations {
			if a.UserID == viewerID {
				continue
			}
			out = append(out, a)
		}
		urlsKept++
		if urlsKept >= onPagesDisplay {
			break
		}
	}

	// Newest first across the flattened set.
	sortAnnotationsByCreatedDesc(out)

	// Stamp viewer's MyReaction on the visible set.
	if len(out) > 0 {
		ids := make([]uint, len(out))
		for i, a := range out {
			ids[i] = a.ID
		}
		mine := batchMyReactions(viewerID, ids)
		for i := range out {
			out[i].MyReaction = mine[out[i].ID]
		}
	}
	return out
}

func sortAnnotationsByCreatedDesc(anns []models.Annotation) {
	for i := 1; i < len(anns); i++ {
		for j := i; j > 0 && anns[j].CreatedAt.After(anns[j-1].CreatedAt); j-- {
			anns[j], anns[j-1] = anns[j-1], anns[j]
		}
	}
}
