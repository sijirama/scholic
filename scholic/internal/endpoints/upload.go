package endpoints

import (
	"log"
	"net/http"

	"scholic/internal/database"
	"scholic/internal/models"
	"scholic/internal/services/media"

	"github.com/gin-gonic/gin"
)

// UploadAvatar handles POST /api/upload/avatar
func UploadAvatar(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	if !media.IsR2Available() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "File storage is not configured"})
		return
	}

	file, header, err := c.Request.FormFile("avatar")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file provided"})
		return
	}
	defer file.Close()

	// Validate file type
	contentType := header.Header.Get("Content-Type")
	if contentType != "image/jpeg" && contentType != "image/png" && contentType != "image/webp" && contentType != "image/gif" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed"})
		return
	}

	// Validate file size (max 5MB)
	if header.Size > 5*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File too large. Maximum size is 5MB"})
		return
	}

	// Upload to R2
	result, err := media.UploadFile(c.Request.Context(), file, header, "avatars")
	if err != nil {
		log.Printf("[Upload] Failed to upload avatar for user %v: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload file"})
		return
	}

	// Update user's profile picture
	if err := database.DB.Model(&models.User{}).Where("id = ?", userID).Update("profile_picture", result.URL).Error; err != nil {
		log.Printf("[Upload] Failed to update profile picture for user %v: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update profile"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"url": result.URL,
	})
}
