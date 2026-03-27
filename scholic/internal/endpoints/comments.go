package endpoints

import (
	"net/http"
	"strconv"

	"scholic/internal/database"
	"scholic/internal/models"

	"github.com/gin-gonic/gin"
)

type CreateCommentRequest struct {
	Text string `json:"text" binding:"required"`
}

// CreateComment handles POST /api/annotations/:id/comments
func CreateComment(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	annotationID := c.Param("id")

	// Ensure annotation exists
	var annotation models.Annotation
	if err := database.DB.First(&annotation, annotationID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Annotation not found"})
		return
	}

	var req CreateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	comment := models.Comment{
		AnnotationID: annotation.ID,
		UserID:       userID.(uint),
		Text:         req.Text,
	}

	if err := database.DB.Create(&comment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create comment"})
		return
	}

	// Preload the user so the frontend gets avatar/name immediately
	if err := database.DB.Preload("User").First(&comment, comment.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Comment created but failed to reload"})
		return
	}

	c.JSON(http.StatusCreated, comment)
}

// GetComments handles GET /api/annotations/:id/comments
func GetComments(c *gin.Context) {
	annotationID := c.Param("id")
	limitStr := c.DefaultQuery("limit", "10")
	offsetStr := c.DefaultQuery("offset", "0")

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 || limit > 50 {
		limit = 10
	}
	offset, err := strconv.Atoi(offsetStr)
	if err != nil || offset < 0 {
		offset = 0
	}

	var comments []models.Comment
	var total int64

	// Ensure annotation exists
	var annotation models.Annotation
	if err := database.DB.First(&annotation, annotationID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Annotation not found"})
		return
	}

	// Count comments (not annotations)
	database.DB.Model(&models.Comment{}).Where("annotation_id = ?", annotationID).Count(&total)

	// Fetch paginated comments
	if err := database.DB.Preload("User").
		Where("annotation_id = ?", annotationID).
		Order("created_at ASC"). // Comments are usually shown in chronological order
		Limit(limit).
		Offset(offset).
		Find(&comments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch comments"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"comments": comments,
		"total":    total,
		"limit":    limit,
		"offset":   offset,
	})
}
