package endpoints

import (
	"net/http"
	"strconv"
	"strings"

	"scholic/internal/database"
	"scholic/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type CreateHighlightRequest struct {
	URL            string `json:"url" binding:"required"`
	Selectors      string `json:"selectors" binding:"required"`
	QuoteText      string `json:"quoteText"`
	Type           string `json:"type"`
	PDFHash        string `json:"pdfHash"`
	PDFPage        int    `json:"pdfPage"`
	HighlightColor string `json:"highlightColor"`
}

type UpdateHighlightRequest struct {
	HighlightColor string `json:"highlightColor" binding:"required"`
}

func CreateHighlight(c *gin.Context) {
	userID := c.MustGet("userID").(uint)
	var req CreateHighlightRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	highlightType := strings.TrimSpace(req.Type)
	if highlightType == "" {
		highlightType = "text"
	}
	color := normalizeHighlightColor(req.HighlightColor)

	highlight := models.Highlight{
		UserID:         userID,
		URL:            canonicalAnnotationURL(req.URL),
		Selectors:      req.Selectors,
		QuoteText:      req.QuoteText,
		Type:           highlightType,
		PDFHash:        req.PDFHash,
		PDFPage:        req.PDFPage,
		HighlightColor: color,
	}
	if err := database.DB.Create(&highlight).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create highlight"})
		return
	}

	c.JSON(http.StatusCreated, highlight)
}

func GetHighlights(c *gin.Context) {
	userID := c.MustGet("userID").(uint)
	pageURL := c.Query("url")
	if pageURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url query parameter is required"})
		return
	}
	pageURL = canonicalAnnotationURL(pageURL)

	limit, err := strconv.Atoi(c.DefaultQuery("limit", "200"))
	if err != nil || limit <= 0 || limit > 500 {
		limit = 200
	}
	offset, err := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if err != nil || offset < 0 {
		offset = 0
	}

	var highlights []models.Highlight
	var total int64
	query := database.DB.Model(&models.Highlight{}).Where("user_id = ? AND url = ?", userID, pageURL)
	if err := query.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count highlights"})
		return
	}
	if err := query.Order("created_at DESC").Limit(limit).Offset(offset).Find(&highlights).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load highlights"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"highlights": highlights,
		"total":      total,
		"limit":      limit,
		"offset":     offset,
	})
}

func UpdateHighlight(c *gin.Context) {
	highlight, ok := requireOwnedHighlight(c)
	if !ok {
		return
	}
	var req UpdateHighlightRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	highlight.HighlightColor = normalizeHighlightColor(req.HighlightColor)
	if err := database.DB.Save(&highlight).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update highlight"})
		return
	}
	c.JSON(http.StatusOK, highlight)
}

func DeleteHighlight(c *gin.Context) {
	highlight, ok := requireOwnedHighlight(c)
	if !ok {
		return
	}
	if err := database.DB.Delete(&highlight).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete highlight"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

func requireOwnedHighlight(c *gin.Context) (models.Highlight, bool) {
	userID := c.MustGet("userID").(uint)
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid highlight id"})
		return models.Highlight{}, false
	}
	var highlight models.Highlight
	if err := database.DB.First(&highlight, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Highlight not found"})
			return models.Highlight{}, false
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load highlight"})
		return models.Highlight{}, false
	}
	if highlight.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only edit your own highlights"})
		return models.Highlight{}, false
	}
	return highlight, true
}

func normalizeHighlightColor(color string) string {
	color = strings.TrimSpace(color)
	if len(color) == 7 && strings.HasPrefix(color, "#") {
		for _, r := range color[1:] {
			if !((r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F')) {
				return "#A8D5B5"
			}
		}
		return color
	}
	return "#A8D5B5"
}
