package models

import (
	"time"

	"gorm.io/gorm"
)

const (
	FeedEventAnnotationCreated = "annotation_created"
	FeedEventBookmarkCreated   = "bookmark_created"
	FeedEventDocumentUploaded  = "document_uploaded"
	FeedEventFollowCreated     = "follow_created"

	FeedTargetAnnotation = "annotation"
	FeedTargetBookmark   = "bookmark"
	FeedTargetDocument   = "document"
	FeedTargetUser       = "user"
)

// FeedEvent is a user activity envelope hydrated by target type at read time.
type FeedEvent struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	ActorID uint `gorm:"uniqueIndex:idx_feed_event_target;index;not null" json:"actorId"`
	Actor   User `gorm:"foreignKey:ActorID" json:"actor"`

	Type       string `gorm:"uniqueIndex:idx_feed_event_target;index;not null;size:64" json:"type"`
	TargetType string `gorm:"uniqueIndex:idx_feed_event_target;index;not null;size:64" json:"targetType"`
	TargetID   uint   `gorm:"uniqueIndex:idx_feed_event_target;index;not null" json:"targetId"`
	IsPrivate  bool   `gorm:"index;default:false" json:"isPrivate"`
}
