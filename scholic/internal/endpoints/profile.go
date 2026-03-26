package endpoints

import (
	"log"
	"net/http"
	"strconv"

	"scholic/internal/database"
	"scholic/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// UpdateProfileRequest is the JSON body for updating user profile.
type UpdateProfileRequest struct {
	FirstName        *string `json:"firstName"`
	LastName         *string `json:"lastName"`
	Username         *string `json:"username"`
	Bio              *string `json:"bio"`
	ShowMemberNumber *bool   `json:"showMemberNumber"`
}

// UpdateProfile handles PUT /api/auth/profile
func UpdateProfile(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req UpdateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Build update map — only update fields that were provided
	updates := map[string]interface{}{}

	if req.FirstName != nil {
		updates["first_name"] = *req.FirstName
	}
	if req.LastName != nil {
		updates["last_name"] = *req.LastName
	}
	if req.Bio != nil {
		updates["bio"] = *req.Bio
	}
	if req.ShowMemberNumber != nil {
		updates["show_member_number"] = *req.ShowMemberNumber
	}

	// Fetch current user to check against
	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}

	// Username change is no longer allowed after onboarding
	if req.Username != nil && *req.Username != "" && *req.Username != user.Username {
		log.Printf("[Profile] User %v attempted to change username up from %s to %s (Blocked)", userID, user.Username, *req.Username)
		// We ignore the username update or could return an error. 
		// Since frontend will hide this, we'll just ignore it to avoid breaking other updates.
	}

	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No fields to update"})
		return
	}

	if err := database.DB.Model(&models.User{}).Where("id = ?", userID).Updates(updates).Error; err != nil {
		log.Printf("[Profile] Failed to update user %v: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update profile"})
		return
	}

	// Return updated user
	database.DB.First(&user, userID)
	c.JSON(http.StatusOK, user)
}

// CheckUsername handles GET /api/auth/check-username?username=...
func CheckUsername(c *gin.Context) {
	username := c.Query("username")
	if username == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username query parameter is required"})
		return
	}

	var user models.User
	err := database.DB.Where("username = ?", username).First(&user).Error

	if err != nil {
		// Not found = available
		c.JSON(http.StatusOK, gin.H{"available": true})
		return
	}

	// Check if it's the current user's own username
	userID, exists := c.Get("userID")
	if exists && user.ID == userID.(uint) {
		c.JSON(http.StatusOK, gin.H{"available": true})
		return
	}

	c.JSON(http.StatusOK, gin.H{"available": false})
}

// GetUserProfile handles GET /api/users/:username
//
// Returns a public profile for a given username, including their public annotations.
func GetUserProfile(c *gin.Context) {
	username := c.Param("username")
	if username == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username parameter is required"})
		return
	}

	var user models.User
	if err := database.DB.Where("username = ?", username).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	// Check if current user is the owner to show private annotations
	isOwner := false
	currentUserID, exists := c.Get("userID")
	if exists && currentUserID.(uint) == user.ID {
		isOwner = true
	}

	// Check if current user is following (if not owner)
	isFollowing := false
	if exists && !isOwner {
		var follow models.Follow
		if err := database.DB.Where("follower_id = ? AND following_id = ?", currentUserID, user.ID).First(&follow).Error; err == nil {
			isFollowing = true
		}
	}

	// Fetch user's annotations with pagination
	limitStr := c.DefaultQuery("limit", "20")
	offsetStr := c.DefaultQuery("offset", "0")
	limit, _ := strconv.Atoi(limitStr)
	offset, _ := strconv.Atoi(offsetStr)
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	var annotations []models.Annotation
	var totalActivity int64

	// Build activity query based on ownership
	activityQuery := database.DB.Model(&models.Annotation{}).Where("user_id = ?", user.ID)
	if !isOwner {
		activityQuery = activityQuery.Where("is_private = ?", false)
	}
	activityQuery.Count(&totalActivity)

	fetchQuery := database.DB.Preload("User").
		Preload("Comments", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at ASC").Limit(5)
		}).
		Preload("Comments.User").
		Where("user_id = ?", user.ID)

	if !isOwner {
		fetchQuery = fetchQuery.Where("is_private = ?", false)
	}

	fetchQuery.Order("created_at DESC").Limit(limit).Offset(offset).Find(&annotations)

	for i := range annotations {
		var count int64
		database.DB.Model(&models.Comment{}).Where("annotation_id = ?", annotations[i].ID).Count(&count)
		annotations[i].CommentCount = count
	}

	// Fetch follower counts
	var followersCount, followingCount int64
	database.DB.Model(&models.Follow{}).Where("following_id = ?", user.ID).Count(&followersCount)
	database.DB.Model(&models.Follow{}).Where("follower_id = ?", user.ID).Count(&followingCount)

	// Since we are returning public info, strip out sensitive data from the user object if necessary,
	// though GORM tags mostly handle this (e.g. DeletedAt).
	c.JSON(http.StatusOK, gin.H{
		"user": gin.H{
			"id":               user.ID,
			"username":         user.Username,
			"firstName":        user.FirstName,
			"lastName":         user.LastName,
			"profilePicture":   user.ProfilePicture,
			"bio":              user.Bio,
			"memberNumber":     user.MemberNumber,
			"showMemberNumber": user.ShowMemberNumber,
			"createdAt":        user.CreatedAt,
			"followersCount":   followersCount,
			"followingCount":   followingCount,
			"isFollowing":      isFollowing,
		},
		"activity":     annotations,
		"totalActivity": totalActivity,
	})
}

// SearchUsers handles GET /api/users/search?q=...&limit=...&offset=...
func SearchUsers(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusOK, gin.H{"users": []interface{}{}, "total": 0})
		return
	}

	limitStr := c.DefaultQuery("limit", "20")
	offsetStr := c.DefaultQuery("offset", "0")
	limit, _ := strconv.Atoi(limitStr)
	offset, _ := strconv.Atoi(offsetStr)
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	pattern := "%" + query + "%"

	var total int64
	database.DB.Model(&models.User{}).
		Where("onboarded = ?", true).
		Where("username ILIKE ? OR first_name ILIKE ? OR last_name ILIKE ?", pattern, pattern, pattern).
		Count(&total)

	var users []models.User
	database.DB.Where("onboarded = ?", true).
		Where("username ILIKE ? OR first_name ILIKE ? OR last_name ILIKE ?", pattern, pattern, pattern).
		Order("username ASC").
		Limit(limit).Offset(offset).
		Find(&users)

	// Check follow status for current user
	currentUserID, hasAuth := c.Get("userID")

	type userResult struct {
		ID               uint   `json:"id"`
		Username         string `json:"username"`
		FirstName        string `json:"firstName"`
		LastName         string `json:"lastName"`
		ProfilePicture   string `json:"profilePicture"`
		MemberNumber     uint   `json:"memberNumber"`
		ShowMemberNumber bool   `json:"showMemberNumber"`
		FollowersCount   int64  `json:"followersCount"`
		FollowingCount   int64  `json:"followingCount"`
		IsFollowing      bool   `json:"isFollowing"`
	}

	results := make([]userResult, 0, len(users))
	for _, u := range users {
		var followersCount, followingCount int64
		database.DB.Model(&models.Follow{}).Where("following_id = ?", u.ID).Count(&followersCount)
		database.DB.Model(&models.Follow{}).Where("follower_id = ?", u.ID).Count(&followingCount)

		isFollowing := false
		if hasAuth && currentUserID.(uint) != u.ID {
			var f models.Follow
			if err := database.DB.Where("follower_id = ? AND following_id = ?", currentUserID, u.ID).First(&f).Error; err == nil {
				isFollowing = true
			}
		}

		results = append(results, userResult{
			ID:               u.ID,
			Username:         u.Username,
			FirstName:        u.FirstName,
			LastName:         u.LastName,
			ProfilePicture:   u.ProfilePicture,
			MemberNumber:     u.MemberNumber,
			ShowMemberNumber: u.ShowMemberNumber,
			FollowersCount:   followersCount,
			FollowingCount:   followingCount,
			IsFollowing:      isFollowing,
		})
	}

	c.JSON(http.StatusOK, gin.H{"users": results, "total": total})
}

// GetFollowers handles GET /api/users/:username/followers?limit=...&offset=...
func GetFollowers(c *gin.Context) {
	username := c.Param("username")
	var user models.User
	if err := database.DB.Where("username = ?", username).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	limitStr := c.DefaultQuery("limit", "20")
	offsetStr := c.DefaultQuery("offset", "0")
	limit, _ := strconv.Atoi(limitStr)
	offset, _ := strconv.Atoi(offsetStr)
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	var total int64
	database.DB.Model(&models.Follow{}).Where("following_id = ?", user.ID).Count(&total)

	var follows []models.Follow
	database.DB.Preload("Follower").
		Where("following_id = ?", user.ID).
		Order("created_at DESC").
		Limit(limit).Offset(offset).
		Find(&follows)

	currentUserID, hasAuth := c.Get("userID")

	type userResult struct {
		ID               uint   `json:"id"`
		Username         string `json:"username"`
		FirstName        string `json:"firstName"`
		LastName         string `json:"lastName"`
		ProfilePicture   string `json:"profilePicture"`
		MemberNumber     uint   `json:"memberNumber"`
		ShowMemberNumber bool   `json:"showMemberNumber"`
		IsFollowing      bool   `json:"isFollowing"`
	}

	results := make([]userResult, 0, len(follows))
	for _, f := range follows {
		isFollowing := false
		if hasAuth && currentUserID.(uint) != f.Follower.ID {
			var existing models.Follow
			if err := database.DB.Where("follower_id = ? AND following_id = ?", currentUserID, f.Follower.ID).First(&existing).Error; err == nil {
				isFollowing = true
			}
		}
		results = append(results, userResult{
			ID:               f.Follower.ID,
			Username:         f.Follower.Username,
			FirstName:        f.Follower.FirstName,
			LastName:         f.Follower.LastName,
			ProfilePicture:   f.Follower.ProfilePicture,
			MemberNumber:     f.Follower.MemberNumber,
			ShowMemberNumber: f.Follower.ShowMemberNumber,
			IsFollowing:      isFollowing,
		})
	}

	c.JSON(http.StatusOK, gin.H{"users": results, "total": total})
}

// GetFollowing handles GET /api/users/:username/following?limit=...&offset=...
func GetFollowing(c *gin.Context) {
	username := c.Param("username")
	var user models.User
	if err := database.DB.Where("username = ?", username).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	limitStr := c.DefaultQuery("limit", "20")
	offsetStr := c.DefaultQuery("offset", "0")
	limit, _ := strconv.Atoi(limitStr)
	offset, _ := strconv.Atoi(offsetStr)
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	var total int64
	database.DB.Model(&models.Follow{}).Where("follower_id = ?", user.ID).Count(&total)

	var follows []models.Follow
	database.DB.Preload("Following").
		Where("follower_id = ?", user.ID).
		Order("created_at DESC").
		Limit(limit).Offset(offset).
		Find(&follows)

	currentUserID, hasAuth := c.Get("userID")

	type userResult struct {
		ID               uint   `json:"id"`
		Username         string `json:"username"`
		FirstName        string `json:"firstName"`
		LastName         string `json:"lastName"`
		ProfilePicture   string `json:"profilePicture"`
		MemberNumber     uint   `json:"memberNumber"`
		ShowMemberNumber bool   `json:"showMemberNumber"`
		IsFollowing      bool   `json:"isFollowing"`
	}

	results := make([]userResult, 0, len(follows))
	for _, f := range follows {
		isFollowing := false
		if hasAuth && currentUserID.(uint) != f.Following.ID {
			var existing models.Follow
			if err := database.DB.Where("follower_id = ? AND following_id = ?", currentUserID, f.Following.ID).First(&existing).Error; err == nil {
				isFollowing = true
			}
		}
		// If this is the current user's following list, they're following everyone on it
		if hasAuth && currentUserID.(uint) == user.ID {
			isFollowing = true
		}
		results = append(results, userResult{
			ID:               f.Following.ID,
			Username:         f.Following.Username,
			FirstName:        f.Following.FirstName,
			LastName:         f.Following.LastName,
			ProfilePicture:   f.Following.ProfilePicture,
			MemberNumber:     f.Following.MemberNumber,
			ShowMemberNumber: f.Following.ShowMemberNumber,
			IsFollowing:      isFollowing,
		})
	}

	c.JSON(http.StatusOK, gin.H{"users": results, "total": total})
}

// ToggleFollow handles POST /api/users/:username/follow
func ToggleFollow(c *gin.Context) {
	followerID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	targetUsername := c.Param("username")
	var targetUser models.User
	if err := database.DB.Where("username = ?", targetUsername).First(&targetUser).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	if targetUser.ID == followerID.(uint) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "You cannot follow yourself"})
		return
	}

	var follow models.Follow
	result := database.DB.Where("follower_id = ? AND following_id = ?", followerID, targetUser.ID).First(&follow)

	if result.Error == nil {
		// Already following -> Unfollow
		database.DB.Where("follower_id = ? AND following_id = ?", followerID, targetUser.ID).Delete(&models.Follow{})
		c.JSON(http.StatusOK, gin.H{"following": false})
	} else {
		// Not following -> Follow
		follow = models.Follow{
			FollowerID:  followerID.(uint),
			FollowingID: targetUser.ID,
		}
		database.DB.Create(&follow)
		c.JSON(http.StatusOK, gin.H{"following": true})
	}
}
