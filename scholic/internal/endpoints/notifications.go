package endpoints

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"scholic/internal/database"
	"scholic/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	NotificationFollow    = "follow"
	NotificationComment   = "comment"
	NotificationReaction  = "reaction"
	NotificationMention   = "mention"
	NotificationReply     = "reply"
	NotificationSharedDoc = "shared_doc"
)

var mentionPattern = regexp.MustCompile(`(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,30})`)

// createNotification stores a notification unless it would notify the actor
// about their own action.
func createNotification(userID, actorID uint, notificationType string, annotationID, commentID *uint) {
	if userID == 0 || actorID == 0 || userID == actorID {
		return
	}

	notification := models.Notification{
		UserID:       userID,
		ActorID:      actorID,
		Type:         notificationType,
		AnnotationID: annotationID,
		CommentID:    commentID,
	}
	_ = database.DB.Create(&notification).Error
}

func uintPtr(v uint) *uint {
	return &v
}

func extractMentionUsernames(text string) []string {
	matches := mentionPattern.FindAllStringSubmatch(text, -1)
	if len(matches) == 0 {
		return []string{}
	}

	seen := make(map[string]bool, len(matches))
	usernames := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) < 3 {
			continue
		}
		username := strings.ToLower(strings.TrimSpace(match[2]))
		if username == "" || seen[username] {
			continue
		}
		seen[username] = true
		usernames = append(usernames, username)
	}
	return usernames
}

func notifyMentionedUsers(actorID uint, text string, annotationID, commentID *uint, previousText string, skipUserIDs ...uint) {
	usernames := extractMentionUsernames(text)
	if len(usernames) == 0 {
		return
	}

	if previousText != "" {
		previous := make(map[string]bool)
		for _, username := range extractMentionUsernames(previousText) {
			previous[username] = true
		}

		filtered := usernames[:0]
		for _, username := range usernames {
			if !previous[username] {
				filtered = append(filtered, username)
			}
		}
		usernames = filtered
		if len(usernames) == 0 {
			return
		}
	}

	skip := make(map[uint]bool, len(skipUserIDs))
	for _, id := range skipUserIDs {
		skip[id] = true
	}

	var users []models.User
	if err := database.DB.
		Where("LOWER(username) IN ?", usernames).
		Find(&users).Error; err != nil {
		return
	}

	for _, user := range users {
		if skip[user.ID] {
			continue
		}
		createNotification(user.ID, actorID, NotificationMention, annotationID, commentID)
	}
}

// mentionedUserIDSet resolves @mention tokens in `text` to a set of user IDs.
// Used by reply / shared-doc helpers to suppress duplicate notifications when
// a user is already getting a (more specific) mention notification.
func mentionedUserIDSet(text string) map[uint]bool {
	usernames := extractMentionUsernames(text)
	if len(usernames) == 0 {
		return nil
	}
	var ids []uint
	if err := database.DB.Model(&models.User{}).
		Where("LOWER(username) IN ?", usernames).
		Pluck("id", &ids).Error; err != nil {
		return nil
	}
	set := make(map[uint]bool, len(ids))
	for _, id := range ids {
		set[id] = true
	}
	return set
}

// notifyThreadParticipants notifies users who already commented on the same
// annotation that there's a new comment in the thread. Skips the actor, the
// annotation owner (they get NotificationComment), and anyone @mentioned in
// the new comment (they get NotificationMention).
func notifyThreadParticipants(actorID, annotationOwnerID, annotationID, commentID uint, commentText string) {
	var participantIDs []uint
	if err := database.DB.Model(&models.Comment{}).
		Distinct("user_id").
		Where("annotation_id = ? AND user_id != ? AND user_id != ?", annotationID, actorID, annotationOwnerID).
		Pluck("user_id", &participantIDs).Error; err != nil {
		return
	}
	if len(participantIDs) == 0 {
		return
	}

	skip := mentionedUserIDSet(commentText)
	for _, userID := range participantIDs {
		if skip[userID] {
			continue
		}
		createNotification(userID, actorID, NotificationReply, uintPtr(annotationID), uintPtr(commentID))
	}
}

// notifySharedDocAnnotators notifies followers of the actor who've also
// publicly annotated the same URL that the actor just annotated it. Skips
// users @mentioned in the new annotation (they get NotificationMention).
func notifySharedDocAnnotators(actorID, annotationID uint, url, annotationText string) {
	if url == "" {
		return
	}
	var recipientIDs []uint
	if err := database.DB.
		Table("annotations a").
		Distinct("a.user_id").
		Joins("JOIN follows f ON f.follower_id = a.user_id AND f.following_id = ?", actorID).
		Where("a.url = ? AND a.is_private = ? AND a.user_id != ? AND a.id != ? AND a.deleted_at IS NULL", url, false, actorID, annotationID).
		Pluck("a.user_id", &recipientIDs).Error; err != nil {
		return
	}
	if len(recipientIDs) == 0 {
		return
	}

	skip := mentionedUserIDSet(annotationText)
	for _, userID := range recipientIDs {
		if skip[userID] {
			continue
		}
		createNotification(userID, actorID, NotificationSharedDoc, uintPtr(annotationID), nil)
	}
}

// GetNotifications handles GET /api/notifications.
func GetNotifications(c *gin.Context) {
	userIDVal, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDVal.(uint)

	limit, err := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if err != nil || limit <= 0 || limit > 50 {
		limit = 20
	}
	offset, err := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if err != nil || offset < 0 {
		offset = 0
	}

	query := database.DB.Model(&models.Notification{}).
		Where("user_id = ?", userID)

	var total int64
	query.Count(&total)

	var notifications []models.Notification
	if err := query.
		Preload("Actor").
		Preload("Annotation", func(db *gorm.DB) *gorm.DB {
			return db.Select("id", "user_id", "url", "quote_text", "text", "type", "image_url", "link_title", "link_domain", "created_at")
		}).
		Preload("Comment", func(db *gorm.DB) *gorm.DB {
			return db.Select("id", "annotation_id", "user_id", "text", "created_at")
		}).
		Order("created_at DESC").
		Limit(limit).Offset(offset).
		Find(&notifications).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch notifications"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"notifications": notifications,
		"total":         total,
		"limit":         limit,
		"offset":        offset,
	})
}

// GetUnreadNotificationCount handles GET /api/notifications/unread-count.
func GetUnreadNotificationCount(c *gin.Context) {
	userIDVal, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var count int64
	database.DB.Model(&models.Notification{}).
		Where("user_id = ? AND read_at IS NULL", userIDVal.(uint)).
		Count(&count)

	c.JSON(http.StatusOK, gin.H{"count": count})
}

// MarkNotificationRead handles POST /api/notifications/:id/read.
func MarkNotificationRead(c *gin.Context) {
	userIDVal, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	notificationID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid notification ID"})
		return
	}

	now := time.Now()
	result := database.DB.Model(&models.Notification{}).
		Where("id = ? AND user_id = ?", notificationID, userIDVal.(uint)).
		Update("read_at", now)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to mark notification read"})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Notification not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"readAt": now})
}

// MarkAllNotificationsRead handles POST /api/notifications/read-all.
func MarkAllNotificationsRead(c *gin.Context) {
	userIDVal, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	now := time.Now()
	if err := database.DB.Model(&models.Notification{}).
		Where("user_id = ? AND read_at IS NULL", userIDVal.(uint)).
		Update("read_at", now).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to mark notifications read"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"readAt": now})
}
