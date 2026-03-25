package endpoints

import (
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"scholic/internal/database"
	"scholic/internal/models"
	"scholic/internal/scraper"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// CreateAnnotationRequest is the JSON body for creating a new annotation.
type CreateAnnotationRequest struct {
	URL       string `json:"url" binding:"required"`
	Selectors string `json:"selectors" binding:"required"`
	Text      string `json:"text"`
	QuoteText string `json:"quoteText"`
	IsPrivate bool   `json:"isPrivate"`
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

	annotation := models.Annotation{
		UserID:          userID.(uint),
		URL:             req.URL,
		Selectors:       req.Selectors,
		Text:            req.Text,
		QuoteText:       req.QuoteText,
		IsPrivate:       req.IsPrivate,
		LinkTitle:       linkTitle,
		LinkDescription: linkDesc,
		LinkImage:       linkImage,
		LinkFavicon:     linkFavicon,
		LinkDomain:      linkDomain,
	}

	if err := database.DB.Create(&annotation).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create annotation"})
		return
	}

	// Reload with user data
	database.DB.Preload("User").First(&annotation, annotation.ID)

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

	var annotations []models.Annotation

	// Check if user is authenticated
	userID, exists := c.Get("userID")

	if exists {
		// Authenticated: return user's annotations (both private and public)
		// plus other users' public annotations
		database.DB.Preload("User").Preload("Comments").Preload("Comments.User").Where(
			"(user_id = ? AND url = ?) OR (url = ? AND is_private = ?)",
			userID, url, url, false,
		).Order("created_at DESC").Find(&annotations)
	} else {
		// Not authenticated: return only public annotations
		database.DB.Preload("User").Preload("Comments").Preload("Comments.User").Where(
			"url = ? AND is_private = ?", url, false,
		).Order("created_at DESC").Find(&annotations)
	}

	c.JSON(http.StatusOK, annotations)
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

	c.JSON(http.StatusOK, gin.H{"message": "Annotation deleted"})
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

	// Calculate total comment count for each annotation (since Preload Limit affects the slice)
	for i := range annotations {
		var count int64
		database.DB.Model(&models.Comment{}).Where("annotation_id = ?", annotations[i].ID).Count(&count)
		annotations[i].CommentCount = count
	}

	c.JSON(http.StatusOK, gin.H{
		"annotations": annotations,
		"total":       total,
		"limit":       limit,
		"offset":      offset,
	})
}
