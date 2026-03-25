package models

import "time"

// Follow represents a user following another user
type Follow struct {
	FollowerID  uint      `gorm:"primaryKey;autoIncrement:false;index:idx_follower_following,unique" json:"followerId"`
	FollowingID uint      `gorm:"primaryKey;autoIncrement:false;index:idx_follower_following,unique" json:"followingId"`
	CreatedAt   time.Time `json:"createdAt"`

	Follower  User `gorm:"foreignKey:FollowerID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"follower"`
	Following User `gorm:"foreignKey:FollowingID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"following"`
}
