package models

import (
	"time"

	"gorm.io/gorm"
)

const (
	CollectionTargetAnnotation = "annotation"
	CollectionTargetBookmark   = "bookmark"
)

type Collection struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	OwnerID uint `gorm:"index;not null" json:"ownerId"`
	Owner   User `gorm:"foreignKey:OwnerID" json:"owner"`

	Title          string `gorm:"size:200;not null" json:"title"`
	Description    string `gorm:"size:1000" json:"description"`
	CoverImageURL  string `gorm:"size:2048" json:"coverImageUrl"`
	CoverImageKey  string `gorm:"size:1024" json:"-"`
	CoverPositionY int    `gorm:"default:50" json:"coverPositionY"`
	IsPrivate      bool   `gorm:"index;default:false" json:"isPrivate"`

	Entries []CollectionEntry `gorm:"foreignKey:CollectionID" json:"entries,omitempty"`
}

type CollectionEntry struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	CollectionID uint       `gorm:"uniqueIndex:idx_collection_target;index;not null" json:"collectionId"`
	Collection   Collection `gorm:"foreignKey:CollectionID" json:"-"`

	AddedByID uint `gorm:"index;not null" json:"addedById"`
	AddedBy   User `gorm:"foreignKey:AddedByID" json:"addedBy"`

	TargetType string `gorm:"uniqueIndex:idx_collection_target;index;not null;size:32" json:"targetType"`
	TargetID   uint   `gorm:"uniqueIndex:idx_collection_target;index;not null" json:"targetId"`
}
