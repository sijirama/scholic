package endpoints

import (
	"log"
	"net/http"
	"os"

	"scholic/internal/database"
	"scholic/internal/models"
	"scholic/internal/utils/jwt"

	"github.com/gin-gonic/gin"
	"github.com/markbates/goth/gothic"
)

func AuthGoogle(c *gin.Context) {
	provider := c.Param("provider")
	if provider == "" {
		provider = "google" // Fallback
	}
	
	log.Printf("[Auth] Initiating auth for provider: %s", provider)

	// Add provider to query params so gothic can find it
	q := c.Request.URL.Query()
	q.Set("provider", provider)
	c.Request.URL.RawQuery = q.Encode()

	gothic.BeginAuthHandler(c.Writer, c.Request)
}

func AuthGoogleCallback(c *gin.Context) {
	provider := c.Param("provider")
	if provider == "" {
		provider = "google"
	}

	// Add provider to query params so gothic can find it
	q := c.Request.URL.Query()
	q.Set("provider", provider)
	c.Request.URL.RawQuery = q.Encode()

	gothUser, err := gothic.CompleteUserAuth(c.Writer, c.Request)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	result := database.DB.Where("google_id = ?", gothUser.UserID).First(&user)

	if result.Error != nil {
		// Determine next member number
		var userCount int64
		database.DB.Model(&models.User{}).Count(&userCount)

		// Create new user
		user = models.User{
			GoogleID:       gothUser.UserID,
			Email:          gothUser.Email,
			FirstName:      gothUser.FirstName,
			LastName:       gothUser.LastName,
			ProfilePicture: gothUser.AvatarURL,
			Onboarded:      false,
			MemberNumber:   uint(userCount + 1),
		}
		database.DB.Create(&user)
	}

	// Generate JWT
	token, err := jwt.GenerateToken(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	// Set cookie
	jwt.SetTokenCookie(c.Writer, token)

	// Redirect to frontend
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:5173"
	}

	if !user.Onboarded {
		c.Redirect(http.StatusTemporaryRedirect, frontendURL+"/onboarding")
	} else {
		c.Redirect(http.StatusTemporaryRedirect, frontendURL+"/feed")
	}
}

func AuthLogout(c *gin.Context) {
	jwt.ClearTokenCookie(c.Writer)
	c.JSON(http.StatusOK, gin.H{"message": "Logged out"})
}

func AuthMe(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, user)
}

func AuthToken(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	token, err := jwt.GenerateToken(userID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": token})
}

func AuthOnboard(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		log.Println("[Auth] Onboard failed: userID not found in context")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req struct {
		Username string `json:"username" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("[Auth] Onboard failed: invalid JSON binding for user %v: %v", userID, err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	log.Printf("[Auth] Attempting to onboard user %v with username: %s", userID, req.Username)

	// Check if username is taken
	var existingUser models.User
	if err := database.DB.Where("username = ?", req.Username).First(&existingUser).Error; err == nil {
		log.Printf("[Auth] Onboard failed: username %s already taken", req.Username)
		c.JSON(http.StatusConflict, gin.H{"error": "Username is already taken"})
		return
	}

	// Update user
	if err := database.DB.Model(&models.User{}).Where("id = ?", userID).Updates(map[string]interface{}{
		"username":  req.Username,
		"onboarded": true,
	}).Error; err != nil {
		log.Printf("[Auth] Onboard failed: database error for user %v: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user"})
		return
	}

	log.Printf("[Auth] User %v successfully onboarded as %s", userID, req.Username)
	c.JSON(http.StatusOK, gin.H{"message": "Onboarding complete"})
}
