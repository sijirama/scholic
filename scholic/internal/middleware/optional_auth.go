package middleware

import (
	"strings"

	"scholic/internal/utils/jwt"

	"github.com/gin-gonic/gin"
)

// OptionalAuthMiddleware tries to authenticate the user but doesn't block
// the request if no token is found. This is used for endpoints like
// GET /api/annotations where unauthenticated users can see public annotations
// but authenticated users also see their private ones.
//
// Supports both cookie-based auth (web client) and Bearer token auth (extension).
func OptionalAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		var tokenString string

		// Try Bearer token first (used by the browser extension)
		authHeader := c.GetHeader("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenString = strings.TrimPrefix(authHeader, "Bearer ")
		}

		// Fall back to cookie (used by the web client)
		if tokenString == "" {
			tokenString, _ = c.Cookie("auth_token")
		}

		// If we have a token, try to validate it
		if tokenString != "" {
			userID, err := jwt.ValidateToken(tokenString)
			if err == nil {
				c.Set("userID", userID)
			}
		}

		c.Next()
	}
}
