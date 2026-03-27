package endpoints

import (
	"scholic/internal/database"
	"scholic/internal/models"
)

// batchCommentCounts fetches comment counts for multiple annotations in a single query.
// Returns a map of annotationID -> count.
func batchCommentCounts(annotationIDs []uint) map[uint]int64 {
	result := make(map[uint]int64, len(annotationIDs))
	if len(annotationIDs) == 0 {
		return result
	}

	type countRow struct {
		AnnotationID uint
		Count        int64
	}
	var rows []countRow
	database.DB.Model(&models.Comment{}).
		Select("annotation_id, COUNT(*) as count").
		Where("annotation_id IN ?", annotationIDs).
		Group("annotation_id").
		Find(&rows)

	for _, r := range rows {
		result[r.AnnotationID] = r.Count
	}
	return result
}

// batchFollowCounts fetches follower and following counts for multiple user IDs in two queries.
// Returns followersMap[userID] and followingMap[userID].
func batchFollowCounts(userIDs []uint) (followers map[uint]int64, following map[uint]int64) {
	followers = make(map[uint]int64, len(userIDs))
	following = make(map[uint]int64, len(userIDs))
	if len(userIDs) == 0 {
		return
	}

	type countRow struct {
		UserID uint
		Count  int64
	}

	var followerRows []countRow
	database.DB.Model(&models.Follow{}).
		Select("following_id as user_id, COUNT(*) as count").
		Where("following_id IN ?", userIDs).
		Group("following_id").
		Find(&followerRows)
	for _, r := range followerRows {
		followers[r.UserID] = r.Count
	}

	var followingRows []countRow
	database.DB.Model(&models.Follow{}).
		Select("follower_id as user_id, COUNT(*) as count").
		Where("follower_id IN ?", userIDs).
		Group("follower_id").
		Find(&followingRows)
	for _, r := range followingRows {
		following[r.UserID] = r.Count
	}
	return
}

// batchIsFollowing checks which of the targetIDs the currentUserID follows.
// Returns a set of user IDs that currentUserID follows.
func batchIsFollowing(currentUserID uint, targetIDs []uint) map[uint]bool {
	result := make(map[uint]bool, len(targetIDs))
	if len(targetIDs) == 0 {
		return result
	}

	var follows []models.Follow
	database.DB.Where("follower_id = ? AND following_id IN ?", currentUserID, targetIDs).Find(&follows)
	for _, f := range follows {
		result[f.FollowingID] = true
	}
	return result
}
