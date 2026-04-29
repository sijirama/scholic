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
	NotificationFollow   = "follow"
	NotificationComment  = "comment"
	NotificationReaction = "reaction"
	NotificationMention  = "mention"
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
