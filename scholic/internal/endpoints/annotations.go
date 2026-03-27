package endpoints

import (
	"encoding/base64"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"scholic/internal/database"
	"scholic/internal/models"
	"scholic/internal/scraper"
	"scholic/internal/services/media"

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
	Type      string `json:"type"`      // text, image, html, etc.
	Image     string `json:"image"`     // base64 encoded image data (for type="image")
	PDFHash   string `json:"pdfHash"`   // Digital fingerprint of the PDF
	PDFPage   int    `json:"pdfPage"`   // Page number within the PDF
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

type UpdateAnnotationRequest struct {
	Text string `json:"text"`
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

	var req UpdateAnnotationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	annotation.Text = req.Text
	if err := database.DB.Save(&annotation).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update annotation"})
		return
	}

	if err := database.DB.Preload("User").First(&annotation, annotation.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Updated but failed to reload"})
		return
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

	c.JSON(http.StatusOK, gin.H{
		"annotations": annotations,
		"total":       total,
		"limit":       limit,
		"offset":      offset,
	})
}
