package models

import (
	"time"

	"gorm.io/gorm"
)

// Notification is an activity item delivered to one user.
//
// UserID is the recipient, ActorID is the user who caused the event.
// Optional annotation/comment references let the client route users to the
// relevant annotation while still supporting profile-only events like follows.
type Notification struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	UserID uint `gorm:"index;not null" json:"userId"`
	User   User `gorm:"foreignKey:UserID" json:"-"`

	ActorID uint `gorm:"index;not null" json:"actorId"`
	Actor   User `gorm:"foreignKey:ActorID" json:"actor"`

	Type string `gorm:"index;not null;size:32" json:"type"`

	AnnotationID *uint       `gorm:"index" json:"annotationId,omitempty"`
	Annotation   *Annotation `gorm:"foreignKey:AnnotationID" json:"annotation,omitempty"`

	CommentID *uint    `gorm:"index" json:"commentId,omitempty"`
	Comment   *Comment `gorm:"foreignKey:CommentID" json:"comment,omitempty"`

	ReadAt *time.Time `gorm:"index" json:"readAt,omitempty"`
}
