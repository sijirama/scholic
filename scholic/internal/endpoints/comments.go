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

	if !annotation.IsPrivate {
		actorID := userID.(uint)
		createNotification(annotation.UserID, actorID, NotificationComment, uintPtr(annotation.ID), uintPtr(comment.ID))
		notifyMentionedUsers(actorID, comment.Text, uintPtr(annotation.ID), uintPtr(comment.ID), "", annotation.UserID)
	}

	c.JSON(http.StatusCreated, comment)
}

type UpdateCommentRequest struct {
	Text string `json:"text" binding:"required"`
}

// UpdateComment handles PUT /api/annotations/:id/comments/:commentId
func UpdateComment(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	commentIDStr := c.Param("commentId")
	commentID, err := strconv.ParseUint(commentIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	var comment models.Comment
	if err := database.DB.First(&comment, commentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found"})
		return
	}

	if comment.UserID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only edit your own comments"})
		return
	}
	previousText := comment.Text

	var req UpdateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	comment.Text = req.Text
	if err := database.DB.Save(&comment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update comment"})
		return
	}

	if err := database.DB.Preload("User").First(&comment, comment.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Updated but failed to reload"})
		return
	}

	var annotation models.Annotation
	if err := database.DB.Select("id, user_id, is_private").First(&annotation, comment.AnnotationID).Error; err == nil && !annotation.IsPrivate {
		notifyMentionedUsers(userID.(uint), comment.Text, uintPtr(annotation.ID), uintPtr(comment.ID), previousText, annotation.UserID)
	}

	c.JSON(http.StatusOK, comment)
}

// DeleteComment handles DELETE /api/annotations/:id/comments/:commentId
func DeleteComment(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	commentIDStr := c.Param("commentId")
	commentID, err := strconv.ParseUint(commentIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	var comment models.Comment
	if err := database.DB.First(&comment, commentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found"})
		return
	}

	if comment.UserID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only delete your own comments"})
		return
	}

	if err := database.DB.Delete(&comment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete comment"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Comment deleted"})
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
