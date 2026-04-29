// Package discover precomputes the four Discover-page rails on a 3h cron and
// caches them in Redis. The HTTP handler reads from cache only and applies a
// cheap per-user filter where needed (rails 3 and 4).
//
// Rails:
//   - TopAnnotations    fully cron'd; same JSON for everyone.
//   - TrendingPages     fully cron'd.
//   - TopAuthors        cron'd candidate pool of ~50; viewer's follow-set
//                       and self get filtered out at request time.
//   - URLPool           cron'd pool of recently-active public URLs with
//                       latest annotations attached; intersected with the
//                       viewer's distinct-annotated URLs at request time.
//
// Each rail is independent — a failure in one does not abort the rest of the
// refresh.
package discover

import (
	"context"
	"encoding/json"
	"log"
	"strconv"
	"time"

	"scholic/internal/database"
	"scholic/internal/models"

	"gorm.io/gorm"
)

// Tunables. Pool sizes are larger than the visible rail size so per-user
// filtering still has enough material after dropping followed/self users
// or URLs the viewer hasn't read.
const (
	topAnnotationsLimit            = 30
	trendingPagesLimit             = 12
	trendingPagesFallbackThreshold = 6
	topAuthorsPoolSize             = 50
	topAuthorsFallbackThreshold    = 8
	urlPoolSize                    = 200
	urlPoolPerURL                  = 6
	trendingWindow                 = 7 * 24 * time.Hour
	authorsWindow                  = 14 * 24 * time.Hour
)

// TrendingPage is a denormalised URL summary for the "Pages getting buzz" rail.
type TrendingPage struct {
	URL         string `json:"url"`
	Title       string `json:"title"`
	Favicon     string `json:"favicon"`
	Domain      string `json:"domain"`
	Description string `json:"description"`
	Image       string `json:"image"`
	Annotators  int64  `json:"annotators"`
	Annotations int64  `json:"annotations"`
}

// TopAuthor is a candidate-pool entry for "People to follow". The handler
// drops anyone the viewer already follows + self before returning.
type TopAuthor struct {
	ID               uint   `json:"id"`
	Username         string `json:"username"`
	FirstName        string `json:"firstName"`
	LastName         string `json:"lastName"`
	ProfilePicture   string `json:"profilePicture"`
	Bio              string `json:"bio"`
	MemberNumber     uint   `json:"memberNumber"`
	ShowMemberNumber bool   `json:"showMemberNumber"`
	AnnotationCount  int64  `json:"annotationCount"`
	FollowerCount    int64  `json:"followerCount"`
}

// PoolURL groups a recently-active URL with its latest public annotations.
// Used by the "On pages you've read" rail — the handler keeps only entries
// whose URL also appears in the viewer's annotation history.
type PoolURL struct {
	URL         string               `json:"url"`
	Title       string               `json:"title"`
	Favicon     string               `json:"favicon"`
	Domain      string               `json:"domain"`
	Annotations []models.Annotation  `json:"annotations"`
}

// Run kicks off the precompute loop. Calls RefreshAll once immediately so the
// cache is warm by the time the first request lands, then on every interval.
func Run(interval time.Duration) {
	if err := RefreshAll(context.Background()); err != nil {
		log.Printf("[Discover] initial refresh failed: %v", err)
	}
	t := time.NewTicker(interval)
	defer t.Stop()
	for range t.C {
		if err := RefreshAll(context.Background()); err != nil {
			log.Printf("[Discover] scheduled refresh failed: %v", err)
		}
	}
}

// RefreshAll runs all four precompute jobs and writes them to Redis. Errors
// from individual rails are logged but do not abort the rest.
func RefreshAll(ctx context.Context) error {
	start := time.Now()

	if err := refreshTopAnnotations(ctx); err != nil {
		log.Printf("[Discover] top_annotations: %v", err)
	}
	if err := refreshTrendingPages(ctx); err != nil {
		log.Printf("[Discover] trending_pages: %v", err)
	}
	if err := refreshTopAuthors(ctx); err != nil {
		log.Printf("[Discover] top_authors: %v", err)
	}
	if err := refreshURLPool(ctx); err != nil {
		log.Printf("[Discover] url_pool: %v", err)
	}

	now := time.Now().Unix()
	_ = database.CacheSet(ctx, KeyLastRefresh, strconv.FormatInt(now, 10), 0)

	log.Printf("[Discover] refresh complete in %s", time.Since(start))
	return nil
}

// refreshTopAnnotations: rank public annotations from the last 7 days by
// reactions×2 + comments×3, take the top N, preload User + reactions.
func refreshTopAnnotations(ctx context.Context) error {
	cutoff := time.Now().Add(-trendingWindow)

	type scoreRow struct {
		AnnotationID uint
	}
	var ids []scoreRow

	rawSQL := `
		SELECT a.id AS annotation_id
		FROM annotations a
		LEFT JOIN reactions r ON r.annotation_id = a.id
		LEFT JOIN comments c ON c.annotation_id = a.id AND c.deleted_at IS NULL
		WHERE a.is_private = false
		  AND a.deleted_at IS NULL
		  AND a.created_at > ?
		GROUP BY a.id, a.created_at
		ORDER BY (COUNT(DISTINCT r.id) * 2 + COUNT(DISTINCT c.id) * 3) DESC,
		         a.created_at DESC
		LIMIT ?
	`
	if err := database.DB.Raw(rawSQL, cutoff, topAnnotationsLimit).Scan(&ids).Error; err != nil {
		return err
	}

	annotationIDs := make([]uint, 0, len(ids))
	for _, r := range ids {
		annotationIDs = append(annotationIDs, r.AnnotationID)
	}

	var annotations []models.Annotation
	if len(annotationIDs) > 0 {
		if err := database.DB.
			Preload("User").
			Preload("Comments", func(db *gorm.DB) *gorm.DB {
				return db.Order("created_at ASC").Limit(5)
			}).
			Preload("Comments.User").
			Where("id IN ?", annotationIDs).
			Find(&annotations).Error; err != nil {
			return err
		}
	}

	// Restore the score-order (Find loses it).
	order := make(map[uint]int, len(annotationIDs))
	for i, id := range annotationIDs {
		order[id] = i
	}
	sorted := make([]models.Annotation, len(annotations))
	for _, a := range annotations {
		sorted[order[a.ID]] = a
	}

	// Comment counts + reactions (anonymous viewer — MyReaction left empty).
	commentCounts := batchCommentCounts(annotationIDs)
	for i := range sorted {
		sorted[i].CommentCount = commentCounts[sorted[i].ID]
	}
	populateAnonymousReactions(sorted)

	return writeJSON(ctx, KeyTopAnnotations, sorted)
}

// refreshTrendingPages: distinct-annotator count per URL over last 7 days.
// Falls back to all-time data when the recent window doesn't have enough URLs
// to fill the rail — keeps the rail looking populated on small datasets.
// Title/favicon picked from each URL's most recent annotation.
func refreshTrendingPages(ctx context.Context) error {
	pages, err := queryTrendingPages(time.Now().Add(-trendingWindow))
	if err != nil {
		return err
	}
	if len(pages) < trendingPagesFallbackThreshold {
		fallback, ferr := queryTrendingPages(time.Time{}) // zero time → no cutoff
		if ferr == nil && len(fallback) > len(pages) {
			pages = fallback
		}
	}
	if pages == nil {
		pages = []TrendingPage{}
	}
	return writeJSON(ctx, KeyTrendingPages, pages)
}

// queryTrendingPages runs the trending-pages aggregation with an optional
// created_at cutoff. Pass time.Time{} to query all-time.
func queryTrendingPages(cutoff time.Time) ([]TrendingPage, error) {
	hasCutoff := !cutoff.IsZero()

	cutoffPredicate := ""
	args := []interface{}{}
	if hasCutoff {
		cutoffPredicate = "AND created_at > ?"
		args = append(args, cutoff)
	}
	args = append(args, trendingPagesLimit)

	rawSQL := `
		WITH ranked AS (
			SELECT url,
			       COUNT(DISTINCT user_id) AS annotators,
			       COUNT(*) AS annotations
			FROM annotations
			WHERE is_private = false
			  AND deleted_at IS NULL
			  ` + cutoffPredicate + `
			GROUP BY url
			ORDER BY annotators DESC, annotations DESC
			LIMIT ?
		),
		latest AS (
			SELECT DISTINCT ON (url)
			       url, link_title, link_favicon, link_domain, link_description, link_image
			FROM annotations
			WHERE url IN (SELECT url FROM ranked)
			  AND is_private = false
			  AND deleted_at IS NULL
			ORDER BY url, created_at DESC
		)
		SELECT r.url, l.link_title AS title, l.link_favicon AS favicon,
		       l.link_domain AS domain, l.link_description AS description,
		       l.link_image AS image, r.annotators, r.annotations
		FROM ranked r
		JOIN latest l ON l.url = r.url
		ORDER BY r.annotators DESC, r.annotations DESC
	`

	var pages []TrendingPage
	if err := database.DB.Raw(rawSQL, args...).Scan(&pages).Error; err != nil {
		return nil, err
	}
	return pages, nil
}

// refreshTopAuthors: top public-annotation contributors over last 14 days.
// Builds a candidate pool larger than the visible rail so per-user filtering
// at request time still has material to show. Falls back to all-time when
// the recent window is sparse.
func refreshTopAuthors(ctx context.Context) error {
	authors, err := queryTopAuthors(time.Now().Add(-authorsWindow))
	if err != nil {
		return err
	}
	if len(authors) < topAuthorsFallbackThreshold {
		fallback, ferr := queryTopAuthors(time.Time{})
		if ferr == nil && len(fallback) > len(authors) {
			authors = fallback
		}
	}

	if len(authors) > 0 {
		ids := make([]uint, len(authors))
		for i, a := range authors {
			ids[i] = a.ID
		}
		followers, _ := batchFollowCounts(ids)
		for i := range authors {
			authors[i].FollowerCount = followers[authors[i].ID]
		}
	}
	if authors == nil {
		authors = []TopAuthor{}
	}
	return writeJSON(ctx, KeyTopAuthors, authors)
}

// queryTopAuthors runs the top-authors aggregation with an optional
// created_at cutoff on the joined annotations. Pass time.Time{} for all-time.
func queryTopAuthors(cutoff time.Time) ([]TopAuthor, error) {
	hasCutoff := !cutoff.IsZero()
	cutoffPredicate := ""
	args := []interface{}{}
	if hasCutoff {
		cutoffPredicate = "AND a.created_at > ?"
		args = append(args, cutoff)
	}
	args = append(args, topAuthorsPoolSize)

	rawSQL := `
		SELECT u.id, u.username, u.first_name, u.last_name,
		       u.profile_picture, u.bio, u.member_number, u.show_member_number,
		       COUNT(a.id) AS annotation_count
		FROM users u
		JOIN annotations a ON a.user_id = u.id
		WHERE a.is_private = false
		  AND a.deleted_at IS NULL
		  ` + cutoffPredicate + `
		  AND u.deleted_at IS NULL
		  AND u.onboarded = true
		GROUP BY u.id
		ORDER BY annotation_count DESC, u.id ASC
		LIMIT ?
	`
	var authors []TopAuthor
	if err := database.DB.Raw(rawSQL, args...).Scan(&authors).Error; err != nil {
		return nil, err
	}
	return authors, nil
}

// refreshURLPool: most-recently-active public URLs paired with up to N latest
// annotations each. The handler intersects this with the viewer's annotation
// URLs to produce the "On pages you've read" rail.
func refreshURLPool(ctx context.Context) error {
	type urlRow struct {
		URL     string
		Title   string
		Favicon string
		Domain  string
	}
	var urls []urlRow
	urlSQL := `
		SELECT DISTINCT ON (url)
		       url,
		       link_title    AS title,
		       link_favicon  AS favicon,
		       link_domain   AS domain
		FROM annotations
		WHERE is_private = false AND deleted_at IS NULL
		ORDER BY url, created_at DESC
		LIMIT ?
	`
	if err := database.DB.Raw(urlSQL, urlPoolSize).Scan(&urls).Error; err != nil {
		return err
	}
	if len(urls) == 0 {
		return writeJSON(ctx, KeyURLPool, []PoolURL{})
	}

	urlList := make([]string, len(urls))
	for i, u := range urls {
		urlList[i] = u.URL
	}

	// Pull all candidate annotations in one query, sorted newest-first per URL.
	// We slice down to urlPoolPerURL per URL in Go — Postgres doesn't have a
	// clean per-group LIMIT short of window functions, and N is small.
	annoSQL := `
		SELECT a.*
		FROM annotations a
		WHERE a.url IN ?
		  AND a.is_private = false
		  AND a.deleted_at IS NULL
		ORDER BY a.url, a.created_at DESC
	`
	var allAnnotations []models.Annotation
	if err := database.DB.Raw(annoSQL, urlList).Scan(&allAnnotations).Error; err != nil {
		return err
	}

	// Preload Users for the annotation set.
	userSet := make(map[uint]bool, len(allAnnotations))
	for _, a := range allAnnotations {
		userSet[a.UserID] = true
	}
	userIDs := make([]uint, 0, len(userSet))
	for id := range userSet {
		userIDs = append(userIDs, id)
	}
	users := make(map[uint]models.User, len(userIDs))
	if len(userIDs) > 0 {
		var us []models.User
		database.DB.Where("id IN ?", userIDs).Find(&us)
		for _, u := range us {
			users[u.ID] = u
		}
	}

	// Cap per-URL and attach users.
	byURL := make(map[string][]models.Annotation, len(urlList))
	for _, a := range allAnnotations {
		if len(byURL[a.URL]) >= urlPoolPerURL {
			continue
		}
		a.User = users[a.UserID]
		byURL[a.URL] = append(byURL[a.URL], a)
	}

	// Reactions in one batch across the whole pool.
	allIDs := make([]uint, 0, len(allAnnotations))
	for _, list := range byURL {
		for _, a := range list {
			allIDs = append(allIDs, a.ID)
		}
	}
	reactionCounts := batchReactionCounts(allIDs)
	commentCounts := batchCommentCounts(allIDs)

	pool := make([]PoolURL, 0, len(urls))
	for _, u := range urls {
		anns := byURL[u.URL]
		if len(anns) == 0 {
			continue
		}
		for i := range anns {
			anns[i].ReactionCounts = reactionCounts[anns[i].ID]
			anns[i].CommentCount = commentCounts[anns[i].ID]
		}
		pool = append(pool, PoolURL{
			URL:         u.URL,
			Title:       u.Title,
			Favicon:     u.Favicon,
			Domain:      u.Domain,
			Annotations: anns,
		})
	}

	return writeJSON(ctx, KeyURLPool, pool)
}

// writeJSON marshals v and SETs it under key with no expiry.
func writeJSON(ctx context.Context, key string, v interface{}) error {
	bytes, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return database.CacheSet(ctx, key, string(bytes), 0)
}

// ── lightweight helpers, intentionally duplicated from endpoints/helpers.go
//    so this package doesn't import the endpoints package.

func batchCommentCounts(annotationIDs []uint) map[uint]int64 {
	result := make(map[uint]int64, len(annotationIDs))
	if len(annotationIDs) == 0 {
		return result
	}
	type row struct {
		AnnotationID uint
		Count        int64
	}
	var rows []row
	database.DB.Model(&models.Comment{}).
		Select("annotation_id, COUNT(*) as count").
		Where("annotation_id IN ?", annotationIDs).
		Group("annotation_id").
		Find(&rows)
	for _, r := range rows {
		result[r.AnnotationID] = r.Count
	}
	return result
}

func batchReactionCounts(annotationIDs []uint) map[uint]map[string]int64 {
	result := make(map[uint]map[string]int64, len(annotationIDs))
	if len(annotationIDs) == 0 {
		return result
	}
	type row struct {
		AnnotationID uint
		Emoji        string
		Count        int64
	}
	var rows []row
	database.DB.Model(&models.Reaction{}).
		Select("annotation_id, emoji, COUNT(*) as count").
		Where("annotation_id IN ?", annotationIDs).
		Group("annotation_id, emoji").
		Find(&rows)
	for _, r := range rows {
		if result[r.AnnotationID] == nil {
			result[r.AnnotationID] = make(map[string]int64)
		}
		result[r.AnnotationID][r.Emoji] = r.Count
	}
	return result
}

func batchFollowCounts(userIDs []uint) (followers map[uint]int64, following map[uint]int64) {
	followers = make(map[uint]int64, len(userIDs))
	following = make(map[uint]int64, len(userIDs))
	if len(userIDs) == 0 {
		return
	}
	type row struct {
		UserID uint
		Count  int64
	}
	var rows []row
	database.DB.Model(&models.Follow{}).
		Select("following_id as user_id, COUNT(*) as count").
		Where("following_id IN ?", userIDs).
		Group("following_id").
		Find(&rows)
	for _, r := range rows {
		followers[r.UserID] = r.Count
	}
	return
}

func populateAnonymousReactions(annotations []models.Annotation) {
	if len(annotations) == 0 {
		return
	}
	ids := make([]uint, len(annotations))
	for i, a := range annotations {
		ids[i] = a.ID
	}
	counts := batchReactionCounts(ids)
	for i := range annotations {
		annotations[i].ReactionCounts = counts[annotations[i].ID]
	}
}
