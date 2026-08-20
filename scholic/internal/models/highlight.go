package models

import (
	"time"

	"gorm.io/gorm"
)

// Highlight is a private, page-local saved text selection.
// Unlike Annotation, it has no social surface: no feed, profile activity,
// comments, reactions, or public visibility.
type Highlight struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	UserID uint `gorm:"index;not null" json:"userId"`
	User   User `gorm:"foreignKey:UserID" json:"user"`

	URL       string `gorm:"index;not null;size:2000" json:"url"`
	Selectors string `gorm:"type:jsonb;not null" json:"selectors"`
	QuoteText string `gorm:"size:10000" json:"quoteText"`

	Type    string `gorm:"default:text" json:"type"`
	PDFHash string `gorm:"index" json:"pdfHash"`
	PDFPage int    `json:"pdfPage"`

	HighlightColor string `gorm:"default:'#A8D5B5'" json:"highlightColor"`
}
