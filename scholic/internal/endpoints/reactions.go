package endpoints

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"scholic/internal/database"
	"scholic/internal/models"

	"github.com/gin-gonic/gin"
)

// MaxEmojiBytes caps the emoji payload length. Real emojis (incl. ZWJ
// sequences with skin tones) fit comfortably under this; rejecting longer
// strings prevents abuse of the field as free-text storage.
const MaxEmojiBytes = 32

type toggleReactionRequest struct {
	Emoji string `json:"emoji" binding:"required"`
}

// ToggleReaction handles POST /api/annotations/:id/reactions
//
// Twitter-style: one active reaction per (annotation, user). Body:
//
//	{ "emoji": "🔥" }
//
// Behaviour:
//
//	no existing row              → INSERT
//	existing emoji == request    → DELETE (toggle off)
//	existing emoji != request    → UPDATE (replace)
//
// Returns the fresh count map and the user's resulting emoji ("" if cleared).
// Rejects with 403 if the annotation is private.
func ToggleReaction(c *gin.Context) {
	userIDVal, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDVal.(uint)

	annotationID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid annotation ID"})
		return
	}

	var req toggleReactionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	emoji := strings.TrimSpace(req.Emoji)
	if emoji == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "emoji is required"})
		return
	}
	if len(emoji) > MaxEmojiBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "emoji too long"})
		return
	}

	var annotation models.Annotation
	if err := database.DB.Select("id, user_id, is_private").First(&annotation, annotationID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Annotation not found"})
		return
	}
	if annotation.IsPrivate {
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot react to private annotations"})
		return
	}

	var existing models.Reaction
	findErr := database.DB.
		Where("annotation_id = ? AND user_id = ?", annotationID, userID).
		First(&existing).Error

	var mine string
	if findErr == nil {
		if existing.Emoji == emoji {
			// Toggle off
			if err := database.DB.Delete(&existing).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clear reaction"})
				return
			}
			mine = ""
		} else {
			// Replace
			existing.Emoji = emoji
			if err := database.DB.Save(&existing).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update reaction"})
				return
			}
			mine = emoji
		}
	} else {
		reaction := models.Reaction{
			AnnotationID: uint(annotationID),
			UserID:       userID,
			Emoji:        emoji,
		}
		if err := database.DB.Create(&reaction).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add reaction"})
			return
		}
		mine = emoji
	}

	counts := singleReactionCounts(uint(annotationID))
	invalidateUserFeedCache(userID)
	if mine != "" {
		createNotification(annotation.UserID, userID, NotificationReaction, uintPtr(annotation.ID), nil)
	}

	c.JSON(http.StatusOK, gin.H{
		"counts": counts,
		"mine":   mine,
	})
}

// ClearReaction handles DELETE /api/annotations/:id/reactions
//
// Removes the user's reaction outright. Idempotent — succeeds even if no
// reaction exists. Used by the UI when the user clicks their own active
// emoji to deselect (alternative to toggle-via-POST).
func ClearReaction(c *gin.Context) {
	userIDVal, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDVal.(uint)

	annotationID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid annotation ID"})
		return
	}

	if err := database.DB.
		Where("annotation_id = ? AND user_id = ?", annotationID, userID).
		Delete(&models.Reaction{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clear reaction"})
		return
	}

	counts := singleReactionCounts(uint(annotationID))
	invalidateUserFeedCache(userID)

	c.JSON(http.StatusOK, gin.H{
		"counts": counts,
		"mine":   "",
	})
}

// singleReactionCounts is a thin wrapper over batchReactionCounts for the
// one-annotation case; always returns a non-nil map.
func singleReactionCounts(annotationID uint) map[string]int64 {
	all := batchReactionCounts([]uint{annotationID})
	if c, ok := all[annotationID]; ok {
		return c
	}
	return map[string]int64{}
}

// invalidateUserFeedCache busts only the reacting user's feed pages so they
// see their own updated MyReaction immediately. Other viewers see fresh
// counts after the feed cache TTL (2 min) expires — acceptable lag for a
// display-only signal.
func invalidateUserFeedCache(userID uint) {
	go func() {
		ctx := context.Background()
		database.CacheDeletePattern(ctx, fmt.Sprintf("scholic:feed:%d:*", userID))
	}()
}
