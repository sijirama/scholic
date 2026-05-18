package models

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	ID                                uint           `gorm:"primaryKey" json:"id"`
	CreatedAt                         time.Time      `json:"createdAt"`
	UpdatedAt                         time.Time      `json:"updatedAt"`
	DeletedAt                         gorm.DeletedAt `gorm:"index" json:"-"`
	Email                             string         `gorm:"uniqueIndex;not null;size:320" json:"email"`
	Username                          string         `gorm:"uniqueIndex;size:30" json:"username"`
	FirstName                         string         `gorm:"size:100" json:"firstName"`
	LastName                          string         `gorm:"size:100" json:"lastName"`
	ProfilePicture                    string         `gorm:"size:2048" json:"profilePicture"`
	GoogleID                          string         `gorm:"uniqueIndex;size:255" json:"googleId"`
	Onboarded                         bool           `gorm:"default:false" json:"onboarded"`
	MemberNumber                      uint           `gorm:"uniqueIndex" json:"memberNumber"`
	Bio                               string         `gorm:"size:500" json:"bio"`
	ShowMemberNumber                  bool           `gorm:"default:true" json:"showMemberNumber"`
	DefaultLinkPreviewImageVisibility bool           `gorm:"default:true" json:"defaultLinkPreviewImageVisibility"`
}
