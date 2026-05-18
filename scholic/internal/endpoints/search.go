package endpoints

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"scholic/internal/database"
	"scholic/internal/models"

	"github.com/gin-gonic/gin"
)

// Search handles GET /api/search
//
// Unified search endpoint — annotations and users in one call.
//
// Query params:
//
//	q         text to search (quote_text + text + url for annotations; username/name for users; metadata for documents)
//	type      "all" | "annotations" | "users" | "documents"  (default "all")
//	username  scope annotation results to a specific user's public annotations
//	domain    filter annotations by link_domain (partial match)
//	color     filter by highlight_color — repeat param for multiple (e.g. color=hex1&color=hex2)
//	limit     max results per section (default 20, max 50)
//	offset    pagination offset
func Search(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	searchType := c.DefaultQuery("type", "all")
	scopeUsername := strings.TrimSpace(c.Query("username"))
	domain := strings.TrimSpace(c.Query("domain"))

	// Support multiple colors via repeated param
	rawColors := c.QueryArray("color")
	colors := make([]string, 0, len(rawColors))
	for _, col := range rawColors {
		col = strings.TrimSpace(col)
		if col != "" {
			colors = append(colors, strings.ToLower(col))
		}
	}

	limit, err := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if err != nil || limit <= 0 || limit > 50 {
		limit = 20
	}
	offset, err := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if err != nil || offset < 0 {
		offset = 0
	}

	authedUserID, authed := c.Get("userID")
	out := gin.H{"limit": limit, "offset": offset}

	// ── Annotations ───────────────────────────────────────────────────────────
	if searchType == "all" || searchType == "annotations" {
		anns, total := doAnnotationSearch(q, scopeUsername, domain, colors, authed, authedUserID, limit, offset)
		out["annotations"] = anns
		out["annotationsTotal"] = total
	}

	// ── Users ─────────────────────────────────────────────────────────────────
	if searchType == "all" || searchType == "users" {
		users, total := doUserSearch(q, authed, authedUserID)
		out["users"] = users
		out["usersTotal"] = total
	}

	// ── Documents ─────────────────────────────────────────────────────────────
	if searchType == "all" || searchType == "documents" {
		documents, total := doDocumentSearch(q, scopeUsername, limit, offset)
		out["documents"] = documents
		out["documentsTotal"] = total
	}

	c.JSON(http.StatusOK, out)
}

func doAnnotationSearch(
	q, scopeUsername, domain string,
	colors []string,
	authed bool, authedUserID interface{},
	limit, offset int,
) ([]models.Annotation, int64) {
	// Require at least one filter — avoids dumping the full table
	hasFilter := q != "" || scopeUsername != "" || domain != "" || len(colors) > 0
	if !hasFilter {
		return []models.Annotation{}, 0
	}

	db := database.DB.Model(&models.Annotation{})

	// Privacy: authenticated users see their own private annotations too
	if authed {
		db = db.Where(
			"(annotations.is_private = false OR annotations.user_id = ?)",
			authedUserID,
		)
	} else {
		db = db.Where("annotations.is_private = false")
	}

	// Full-text search across quote, note, and URL
	if q != "" {
		like := "%" + q + "%"
		db = db.Where(
			"(annotations.quote_text ILIKE ? OR annotations.text ILIKE ? OR annotations.url ILIKE ?)",
			like, like, like,
		)
	}

	// Username scope: resolve to user_id to avoid JOIN on preloaded User table
	if scopeUsername != "" {
		var scopeUser models.User
		if err := database.DB.Select("id").
			Where("username = ?", scopeUsername).
			First(&scopeUser).Error; err != nil {
			return []models.Annotation{}, 0
		}
		db = db.Where("annotations.user_id = ?", scopeUser.ID)
	}

	// Domain filter (partial match)
	if domain != "" {
		db = db.Where("annotations.link_domain ILIKE ?", "%"+domain+"%")
	}

	// Color filter — case-insensitive, multiple colors = OR
	if len(colors) > 0 {
		db = db.Where("LOWER(annotations.highlight_color) IN ?", colors)
	}

	var total int64
	db.Count(&total)

	var results []models.Annotation
	db.Preload("User").
		Order("annotations.created_at DESC").
		Limit(limit).Offset(offset).
		Find(&results)

	// Batch comment counts (avoids N+1)
	ids := make([]uint, len(results))
	for i, a := range results {
		ids[i] = a.ID
	}
	counts := batchCommentCounts(ids)
	for i := range results {
		results[i].CommentCount = counts[results[i].ID]
	}

	var viewerID uint
	if authed {
		if u, ok := authedUserID.(uint); ok {
			viewerID = u
		}
	}
	populateReactionsForUser(viewerID, results)
	models.ResolveLinkPreviewImageVisibility(results)

	return results, total
}

type userSearchResult struct {
	ID               uint   `json:"id"`
	Username         string `json:"username"`
	FirstName        string `json:"firstName"`
	LastName         string `json:"lastName"`
	ProfilePicture   string `json:"profilePicture"`
	Bio              string `json:"bio"`
	MemberNumber     uint   `json:"memberNumber"`
	ShowMemberNumber bool   `json:"showMemberNumber"`
	FollowersCount   int64  `json:"followersCount"`
	IsFollowing      bool   `json:"isFollowing"`
}

func doUserSearch(q string, authed bool, authedUserID interface{}) ([]userSearchResult, int64) {
	if q == "" {
		return []userSearchResult{}, 0
	}
	like := "%" + q + "%"
	var users []models.User
	var total int64
	db := database.DB.Model(&models.User{}).
		Where(
			"username ILIKE ? OR first_name ILIKE ? OR last_name ILIKE ?",
			like, like, like,
		)
	db.Count(&total)
	db.Select("id, username, first_name, last_name, profile_picture, bio, member_number, show_member_number").
		Limit(10).Find(&users)

	if len(users) == 0 {
		return []userSearchResult{}, total
	}

	userIDs := make([]uint, len(users))
	for i, u := range users {
		userIDs[i] = u.ID
	}

	followersMap, _ := batchFollowCounts(userIDs)
	var isFollowingMap map[uint]bool
	if authed {
		if uid, ok := authedUserID.(uint); ok {
			isFollowingMap = batchIsFollowing(uid, userIDs)
		}
	}

	out := make([]userSearchResult, len(users))
	for i, u := range users {
		out[i] = userSearchResult{
			ID:               u.ID,
			Username:         u.Username,
			FirstName:        u.FirstName,
			LastName:         u.LastName,
			ProfilePicture:   u.ProfilePicture,
			Bio:              u.Bio,
			MemberNumber:     u.MemberNumber,
			ShowMemberNumber: u.ShowMemberNumber,
			FollowersCount:   followersMap[u.ID],
			IsFollowing:      isFollowingMap[u.ID],
		}
	}
	return out, total
}

func doDocumentSearch(q, scopeUsername string, limit, offset int) ([]DocumentResponse, int64) {
	documents, total := searchDocuments(context.Background(), q, scopeUsername, limit, offset)
	if len(documents) == 0 {
		return []DocumentResponse{}, total
	}

	results := make([]DocumentResponse, 0, len(documents))
	for _, document := range documents {
		results = append(results, formatDocument(document))
	}
	return results, total
}
