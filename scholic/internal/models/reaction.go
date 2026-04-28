package models

import "time"

// Reaction is a single user's emoji reaction to an annotation.
//
// Twitter-style cardinality: one reaction per (annotation_id, user_id),
// enforced via the composite unique index. Re-reacting with a new emoji
// REPLACES the existing row; reacting with the same emoji DELETES it.
//
// Hard delete (no DeletedAt) so the unique index doesn't trip after a toggle-off.
// Reactions on private annotations are rejected at the endpoint layer.
type Reaction struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	AnnotationID uint   `gorm:"not null;uniqueIndex:uq_reaction_user_annotation;index" json:"annotationId"`
	UserID       uint   `gorm:"not null;uniqueIndex:uq_reaction_user_annotation;index" json:"userId"`
	Emoji        string `gorm:"size:32;not null" json:"emoji"`
}
