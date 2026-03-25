package models

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	ID               uint           `gorm:"primaryKey" json:"id"`
	CreatedAt        time.Time      `json:"createdAt"`
	UpdatedAt        time.Time      `json:"updatedAt"`
	DeletedAt        gorm.DeletedAt `gorm:"index" json:"-"`
	Email            string         `gorm:"uniqueIndex;not null" json:"email"`
	Username         string         `gorm:"uniqueIndex" json:"username"`
	FirstName        string         `json:"firstName"`
	LastName         string         `json:"lastName"`
	ProfilePicture   string         `json:"profilePicture"`
	GoogleID         string         `gorm:"uniqueIndex" json:"googleId"`
	Onboarded        bool           `gorm:"default:false" json:"onboarded"`
	MemberNumber     uint           `gorm:"uniqueIndex" json:"memberNumber"`
	Bio              string         `json:"bio"`
	ShowMemberNumber bool           `gorm:"default:true" json:"showMemberNumber"`
}
