package endpoints

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"scholic/internal/database"
	"scholic/internal/models"
	"scholic/internal/scraper"
	"scholic/internal/services/media"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// CreateAnnotationRequest is the JSON body for creating a new annotation.
type CreateAnnotationRequest struct {
	URL            string `json:"url" binding:"required"`
	Selectors      string `json:"selectors" binding:"required"`
	Text           string `json:"text"`
	QuoteText      string `json:"quoteText"`
	IsPrivate      bool   `json:"isPrivate"`
	Type           string `json:"type"`           // text, image, html, etc.
	Image          string `json:"image"`          // base64 encoded image data (for type="image")
	PDFHash        string `json:"pdfHash"`        // Digital fingerprint of the PDF
	PDFPage        int    `json:"pdfPage"`        // Page number within the PDF
	HighlightColor string `json:"highlightColor"` // User-chosen pastel highlight color (hex)
}

// CreateAnnotation handles POST /api/annotations
//
// Creates a new annotation for the authenticated user. The request body must
// include the URL and selectors (JSON string). Text and QuoteText are optional.
//
// The selectors field contains the anchoring data needed to re-find the
// annotation on the page after a reload. It's stored as-is (JSON string)
// in the database's JSONB column.
func CreateAnnotation(c *gin.Context) {
	// Get the authenticated user's ID from the middleware context
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req CreateAnnotationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Scrape metadata for rich link previews
	var linkTitle, linkDesc, linkImage, linkFavicon, linkDomain string
	meta, err := scraper.ExtractMetadata(req.URL)
	if err == nil && meta != nil {
		linkTitle = meta.Title
		linkDesc = meta.Description
		linkImage = meta.Image
		linkFavicon = meta.Favicon
		linkDomain = meta.Domain
	} else { // Fallback if scrape fails
		if parsedURL, parseErr := url.Parse(req.URL); parseErr == nil {
			linkDomain = strings.TrimPrefix(parsedURL.Host, "www.")
		}
	}

	// Handle image upload if type is image and image data is provided
	var imageUrl string
	if req.Type == "image" && req.Image != "" {
		// Expecting data:image/png;base64,... format
		parts := strings.Split(req.Image, ",")
		if len(parts) == 2 {
			base64Data := parts[1]
			data, err := base64.StdEncoding.DecodeString(base64Data)
			if err == nil {
				// Upload to R2
				r2 := media.GetR2Service()
				// Construct a pseudo-multipart header for the name/type
				filename := "screenshot.png"
				res, uploadErr := r2.UploadBytes(c.Request.Context(), data, filename, "image/png", "annotations")
				if uploadErr == nil {
					imageUrl = res.URL
				} else {
					// Log the error (can't using logging package here easily without import)
					// fmt.Printf("[Scholic] R2 upload failed: %v\n", uploadErr)
				}
			}
		}
	}

	highlightColor := req.HighlightColor
	if highlightColor == "" {
		highlightColor = "#A8D5B5"
	}

	annotation := models.Annotation{
		UserID:          userID.(uint),
		URL:             req.URL,
		Selectors:       req.Selectors,
		Text:            req.Text,
		QuoteText:       req.QuoteText,
		IsPrivate:       req.IsPrivate,
		Type:            req.Type,
		ImageURL:        imageUrl,
		PDFHash:         req.PDFHash,
		PDFPage:         req.PDFPage,
		LinkTitle:       linkTitle,
		LinkDescription: linkDesc,
		LinkImage:       linkImage,
		LinkFavicon:     linkFavicon,
		LinkDomain:      linkDomain,
		HighlightColor:  highlightColor,
	}

	if err := database.DB.Create(&annotation).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create annotation"})
		return
	}

	// Reload with user data
	if err := database.DB.Preload("User").First(&annotation, annotation.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Annotation created but failed to reload"})
		return
	}

	// Invalidate caches — annotations for this URL, and (only for public annotations)
	// ALL recently-read pages for this user and all feed caches.
	// Private annotations never affect the recently-read or feed surfaces.
	username := annotation.User.Username
	annotationURL := req.URL
	isPublic := !annotation.IsPrivate
	if isPublic {
		notifyMentionedUsers(annotation.UserID, annotation.Text, uintPtr(annotation.ID), nil, "")
		notifySharedDocAnnotators(annotation.UserID, annotation.ID, annotation.URL, annotation.Text)
	}
	go func() {
		ctx := context.Background()
		database.CacheDelete(ctx, database.AnnotationsURLKey(annotationURL))
		if isPublic {
			if username != "" {
				database.CacheDeletePattern(ctx, database.RecentlyReadKeyPattern(username))
			}
			database.CacheDeletePattern(ctx, database.FeedKeyPattern())
		}
	}()

	c.JSON(http.StatusCreated, annotation)
}

// GetAnnotations handles GET /api/annotations?url=<url>
//
// Returns all annotations for a given URL. If the user is authenticated,
// returns both their private highlights and public annotations.
// If not authenticated, returns only public annotations.
//
// The URL query parameter is required and must match exactly.
func GetAnnotations(c *gin.Context) {
	url := c.Query("url")
	if url == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url query parameter is required"})
		return
	}

	limit, err := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if err != nil || limit <= 0 || limit > 100 {
		limit = 50
	}
	offset, err := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if err != nil || offset < 0 {
		offset = 0
	}

	var annotations []models.Annotation
	var total int64

	userID, exists := c.Get("userID")

	var query *gorm.DB
	if exists {
		query = database.DB.Model(&models.Annotation{}).Where(
			"(user_id = ? AND url = ?) OR (url = ? AND is_private = ?)",
			userID, url, url, false,
		)
	} else {
		query = database.DB.Model(&models.Annotation{}).Where(
			"url = ? AND is_private = ?", url, false,
		)
	}

	query.Count(&total)
	query.Preload("User").Preload("Comments").Preload("Comments.User").
		Order("created_at DESC").Limit(limit).Offset(offset).Find(&annotations)

	populateReactions(c, annotations)

	c.JSON(http.StatusOK, gin.H{
		"annotations": annotations,
		"total":       total,
		"limit":       limit,
		"offset":      offset,
	})
}

// DeleteAnnotation handles DELETE /api/annotations/:id
//
// Deletes an annotation by ID. Only the owner can delete their annotations.
func DeleteAnnotation(c *gin.Context) {
	// Get the authenticated user's ID
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	// Parse annotation ID from URL parameter
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid annotation ID"})
		return
	}

	// Find the annotation and verify ownership
	var annotation models.Annotation
	if err := database.DB.First(&annotation, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Annotation not found"})
		return
	}

	if annotation.UserID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only delete your own annotations"})
		return
	}

	// Soft delete (GORM soft delete via DeletedAt)
	if err := database.DB.Delete(&annotation).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete annotation"})
		return
	}

	// Invalidate caches — same surfaces as CreateAnnotation.
	// Only public annotation deletions affect recently-read and feed caches.
	// Capture needed values before the goroutine runs (annotation may be GC'd).
	deletedURL := annotation.URL
	deletedUserID := annotation.UserID
	deletedIsPublic := !annotation.IsPrivate
	go func() {
		ctx := context.Background()
		database.CacheDelete(ctx, database.AnnotationsURLKey(deletedURL))
		if deletedIsPublic {
			var user models.User
			if err := database.DB.Select("username").First(&user, deletedUserID).Error; err == nil && user.Username != "" {
				database.CacheDeletePattern(ctx, database.RecentlyReadKeyPattern(user.Username))
			}
			database.CacheDeletePattern(ctx, database.FeedKeyPattern())
		}
	}()

	c.JSON(http.StatusOK, gin.H{"message": "Annotation deleted"})
}

type UpdateAnnotationRequest struct {
	Text           string `json:"text"`
	HighlightColor string `json:"highlightColor"`
}

// UpdateAnnotation handles PUT /api/annotations/:id
func UpdateAnnotation(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid annotation ID"})
		return
	}

	var annotation models.Annotation
	if err := database.DB.First(&annotation, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Annotation not found"})
		return
	}

	if annotation.UserID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only edit your own annotations"})
		return
	}
	previousText := annotation.Text

	var req UpdateAnnotationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	annotation.Text = req.Text
	if req.HighlightColor != "" {
		annotation.HighlightColor = req.HighlightColor
	}
	if err := database.DB.Save(&annotation).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update annotation"})
		return
	}

	if err := database.DB.Preload("User").First(&annotation, annotation.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Updated but failed to reload"})
		return
	}

	if !annotation.IsPrivate {
		notifyMentionedUsers(annotation.UserID, annotation.Text, uintPtr(annotation.ID), nil, previousText)
	}

	c.JSON(http.StatusOK, annotation)
}

// GetAnnotation handles GET /api/annotations/:id
func GetAnnotation(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid annotation ID"})
		return
	}

	var annotation models.Annotation
	if err := database.DB.Preload("User").Preload("Comments", func(db *gorm.DB) *gorm.DB {
		return db.Order("created_at ASC")
	}).Preload("Comments.User").First(&annotation, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Annotation not found"})
		return
	}

	// If private, only the owner can see it
	if annotation.IsPrivate {
		userID, exists := c.Get("userID")
		if !exists || userID.(uint) != annotation.UserID {
			c.JSON(http.StatusNotFound, gin.H{"error": "Annotation not found"})
			return
		}
	}

	// Set comment count
	var commentCount int64
	database.DB.Model(&models.Comment{}).Where("annotation_id = ?", annotation.ID).Count(&commentCount)
	annotation.CommentCount = commentCount

	// Reuse the slice helper on a one-element slice so single-fetch reads
	// surface the same shape as list reads.
	one := []models.Annotation{annotation}
	populateReactions(c, one)
	annotation = one[0]

	c.JSON(http.StatusOK, annotation)
}

// GetFeed handles GET /api/feed
//
// Returns all public annotations across all URLs, paginated.
// Includes user data for each annotation.
func GetFeed(c *gin.Context) {
	limitStr := c.DefaultQuery("limit", "20")
	offsetStr := c.DefaultQuery("offset", "0")
	tab := c.DefaultQuery("tab", "global")

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 || limit > 50 {
		limit = 20
	}
	offset, err := strconv.Atoi(offsetStr)
	if err != nil || offset < 0 {
		offset = 0
	}

	var annotations []models.Annotation
	var total int64

	query := database.DB.Model(&models.Annotation{}).Where("annotations.is_private = ?", false)

	if tab == "following" {
		userID, exists := c.Get("userID")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized to view following feed"})
			return
		}
		// Filter to only authors the current user follows
		query = query.Joins("JOIN follows ON follows.following_id = annotations.user_id").
			Where("follows.follower_id = ?", userID)
	}

	// Count total annotations for the given query
	query.Count(&total)

	// Fetch results with related models, but limit comments to 3
	query.Preload("User").
		Preload("Comments", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at ASC").Limit(5)
		}).
		Preload("Comments.User").
		Order("annotations.created_at DESC").Limit(limit).Offset(offset).Find(&annotations)

	// Batch-load comment counts (single query instead of N+1)
	annotationIDs := make([]uint, len(annotations))
	for i, a := range annotations {
		annotationIDs[i] = a.ID
	}
	commentCounts := batchCommentCounts(annotationIDs)
	for i := range annotations {
		annotations[i].CommentCount = commentCounts[annotations[i].ID]
	}

	populateReactions(c, annotations)

	c.JSON(http.StatusOK, gin.H{
		"annotations": annotations,
		"total":       total,
		"limit":       limit,
		"offset":      offset,
	})
}

// GetSitePage handles GET /api/site?url=...&author=...&timeRange=...
//
// Returns all public annotations for a given URL with optional author and
// time range filters. Also returns the list of all annotators on that URL
// so the frontend can build the author filter dropdown.
func GetSitePage(c *gin.Context) {
	urlStr := c.Query("url")
	if urlStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url query parameter is required"})
		return
	}

	authors := c.QueryArray("author") // ?author=user1&author=user2
	timeRange := c.DefaultQuery("timeRange", "all")

	userID, exists := c.Get("userID")

	// Step 1: get all unique annotators on this URL for the filter UI
	var allForURL []models.Annotation
	database.DB.Model(&models.Annotation{}).Preload("User").
		Where("url = ? AND is_private = ?", urlStr, false).
		Find(&allForURL)

	seen := map[string]bool{}
	var authorList []string
	for _, a := range allForURL {
		if a.User.Username != "" && !seen[a.User.Username] {
			seen[a.User.Username] = true
			authorList = append(authorList, a.User.Username)
		}
	}
	if authorList == nil {
		authorList = []string{}
	}

	// Step 2: build filtered query
	query := database.DB.Model(&models.Annotation{}).Preload("User").Where("annotations.url = ?", urlStr)

	if exists {
		query = query.Where("(annotations.user_id = ? OR annotations.is_private = ?)", userID, false)
	} else {
		query = query.Where("annotations.is_private = ?", false)
	}

	if len(authors) > 0 {
		var authorIDs []uint
		database.DB.Model(&models.User{}).Where("username IN ?", authors).Pluck("id", &authorIDs)
		if len(authorIDs) == 0 {
			c.JSON(http.StatusOK, gin.H{"annotations": []models.Annotation{}, "authors": authorList, "total": 0})
			return
		}
		query = query.Where("annotations.user_id IN ?", authorIDs)
	}

	now := time.Now()
	switch timeRange {
	case "today":
		start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		query = query.Where("annotations.created_at >= ?", start)
	case "week":
		query = query.Where("annotations.created_at >= ?", now.AddDate(0, 0, -7))
	case "month":
		query = query.Where("annotations.created_at >= ?", now.AddDate(0, -1, 0))
	}

	var annotations []models.Annotation
	query.Order("annotations.created_at ASC").Find(&annotations)

	// Batch comment counts
	annotationIDs := make([]uint, len(annotations))
	for i, a := range annotations {
		annotationIDs[i] = a.ID
	}
	commentCounts := batchCommentCounts(annotationIDs)
	for i := range annotations {
		annotations[i].CommentCount = commentCounts[annotations[i].ID]
	}

	populateReactions(c, annotations)

	c.JSON(http.StatusOK, gin.H{
		"annotations": annotations,
		"authors":     authorList,
		"total":       len(annotations),
	})
}
