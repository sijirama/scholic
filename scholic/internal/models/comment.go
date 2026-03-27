package models

import (
	"time"

	"gorm.io/gorm"
)

// Comment represents a user's reply/comment on a specific annotation.
type Comment struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	AnnotationID uint `gorm:"index;not null" json:"annotationId"`

	UserID uint `gorm:"index;not null" json:"userId"`
	User   User `gorm:"foreignKey:UserID" json:"user"`

	Text string `gorm:"not null;size:1000" json:"text"`
}
