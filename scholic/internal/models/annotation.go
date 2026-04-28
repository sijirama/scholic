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
	URL string `gorm:"index;not null;size:2000" json:"url"`

	// Selectors is a JSON string containing an array of selector objects.
	// Example: [{"type":"TextQuoteSelector","exact":"hello","prefix":"say ","suffix":" world"}]
	// Stored as JSONB in PostgreSQL for efficient querying.
	Selectors string `gorm:"type:jsonb;not null" json:"selectors"`

	// Text is the user's note/comment about the selected text
	Text string `gorm:"size:5000" json:"text"`

	// QuoteText is the exact text the user highlighted
	QuoteText string `gorm:"size:10000" json:"quoteText"`

	// IsPrivate marks this as a personal highlight (not visible to others)
	IsPrivate bool `gorm:"default:false" json:"isPrivate"`

	// Comments are replies to this annotation
	Comments []Comment `gorm:"foreignKey:AnnotationID" json:"comments"`

	// Type distinguishes between text, image, html, and pdf annotations.
	// Defaults to "text" for backwards compatibility.
	Type      string `gorm:"default:text" json:"type"`

	// ImageURL is the location of the screenshot in R2 (only for type="image")
	ImageURL  string `json:"imageUrl"`
	PDFHash   string `gorm:"index" json:"pdfHash"` // Digital fingerprint of the PDF
	PDFPage   int    `json:"pdfPage"`               // Page number within the PDF

	// LinkMetadata stores scraped OpenGraph data for rich previews in the Feed
	LinkTitle       string `json:"linkTitle"`
	LinkDescription string `json:"linkDescription"`
	LinkImage       string `json:"linkImage"`
	LinkFavicon     string `json:"linkFavicon"`
	LinkDomain      string `json:"linkDomain"`
	// HighlightColor is the user-chosen pastel color for the highlight (hex, e.g. "#A8D5B5")
	HighlightColor string `gorm:"default:'#A8D5B5'" json:"highlightColor"`

	// CommentCount is a virtual field showing the total number of comments
	CommentCount int64 `gorm:"-" json:"commentCount"`

	// ReactionCounts is a virtual map[emoji]count populated on read paths.
	// Empty/nil if the annotation has no reactions.
	ReactionCounts map[string]int64 `gorm:"-" json:"reactionCounts"`

	// MyReaction is the current viewer's active emoji on this annotation,
	// or "" if they haven't reacted (or aren't signed in).
	MyReaction string `gorm:"-" json:"myReaction,omitempty"`
}
