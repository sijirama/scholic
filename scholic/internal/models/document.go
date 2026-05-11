package models

import (
	"time"

	"gorm.io/gorm"
)

// Document is a user-uploaded PDF with AI-assisted metadata.
type Document struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	UserID uint `gorm:"index;not null" json:"userId"`
	User   User `gorm:"foreignKey:UserID" json:"user"`

	Title         string `gorm:"size:500;not null" json:"title"`
	Description   string `gorm:"size:5000" json:"description"`
	AuthorsJSON   string `gorm:"type:jsonb;not null;default:'[]'" json:"-"`
	TagsJSON      string `gorm:"type:jsonb;not null;default:'[]'" json:"-"`
	PublishedYear *int   `json:"publishedYear,omitempty"`
	Publisher     string `gorm:"size:255" json:"publisher"`
	PageCount     int    `json:"pageCount"`

	FileURL  string `gorm:"size:2048;not null" json:"fileUrl"`
	FileKey  string `gorm:"size:1024;not null" json:"fileKey"`
	FileName string `gorm:"size:512;not null" json:"fileName"`
	FileSize int64  `json:"fileSize"`
	MimeType string `gorm:"size:128;not null" json:"mimeType"`

	MetadataSource string `gorm:"size:32;default:'fallback'" json:"metadataSource"`
	SearchText     string `gorm:"type:text" json:"-"`
	EmbeddingJSON  string `gorm:"type:jsonb" json:"-"`
}
