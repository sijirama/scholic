package models

import (
	"time"

	"gorm.io/gorm"
)

// Annotation represents a user's annotation on a web page.
//
// Each annotation stores:
//   - URL:       The page it belongs to
//   - QuoteText: The exact text the user selected
//   - Text:      The user's note/comment about the selection
//   - Selectors: JSON array of selector objects (RangeSelector, TextPositionSelector,
//                TextQuoteSelector) used to re-anchor the annotation on page reload
//   - IsPrivate: If true, this is a personal highlight (not shared publicly)
type Annotation struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// UserID links this annotation to the user who created it
	UserID uint `gorm:"index;not null" json:"userId"`
	User   User `gorm:"foreignKey:UserID" json:"user"`

	// URL is the page where the annotation was created (indexed for fast lookup)
	URL string `gorm:"index;not null" json:"url"`

	// Selectors is a JSON string containing an array of selector objects.
	// Example: [{"type":"TextQuoteSelector","exact":"hello","prefix":"say ","suffix":" world"}]
	// Stored as JSONB in PostgreSQL for efficient querying.
	Selectors string `gorm:"type:jsonb;not null" json:"selectors"`

	// Text is the user's note/comment about the selected text
	Text string `json:"text"`

	// QuoteText is the exact text the user highlighted
	QuoteText string `json:"quoteText"`

	// IsPrivate marks this as a personal highlight (not visible to others)
	IsPrivate bool `gorm:"default:false" json:"isPrivate"`

	// Comments are replies to this annotation
	Comments []Comment `gorm:"foreignKey:AnnotationID" json:"comments"`

	// LinkMetadata stores scraped OpenGraph data for rich previews in the Feed
	LinkTitle       string `json:"linkTitle"`
	LinkDescription string `json:"linkDescription"`
	LinkImage       string `json:"linkImage"`
	LinkFavicon     string `json:"linkFavicon"`
	LinkDomain      string `json:"linkDomain"`
	// CommentCount is a virtual field showing the total number of comments
	CommentCount int64 `gorm:"-" json:"commentCount"`
}
