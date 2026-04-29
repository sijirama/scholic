package endpoints

import (
	"net/http"

	"scholic/internal/blocklist"

	"github.com/gin-gonic/gin"
)

// GetBlocklist serves the URL patterns where the Scholic extension should
// stay invisible. Public endpoint — the list is not sensitive and the
// extension fetches it without auth.
func GetBlocklist(c *gin.Context) {
	val, err := blocklist.FetchFromCache(c.Request.Context())
	if err != nil || val == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load blocklist"})
		return
	}
	c.Data(http.StatusOK, "application/json", []byte(val))
}
