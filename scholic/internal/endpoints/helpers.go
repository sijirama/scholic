package endpoints

import (
	"scholic/internal/database"
	"scholic/internal/models"

	"github.com/gin-gonic/gin"
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

// batchReactionCounts returns reaction tallies grouped by annotation:
//
//	map[annotationID] -> map[emoji]count
//
// Single GROUP BY query against (annotation_id IN ?), so cost is independent
// of how many distinct emojis were used.
func batchReactionCounts(annotationIDs []uint) map[uint]map[string]int64 {
	result := make(map[uint]map[string]int64, len(annotationIDs))
	if len(annotationIDs) == 0 {
		return result
	}

	type row struct {
		AnnotationID uint
		Emoji        string
		Count        int64
	}
	var rows []row
	database.DB.Model(&models.Reaction{}).
		Select("annotation_id, emoji, COUNT(*) as count").
		Where("annotation_id IN ?", annotationIDs).
		Group("annotation_id, emoji").
		Find(&rows)

	for _, r := range rows {
		if result[r.AnnotationID] == nil {
			result[r.AnnotationID] = make(map[string]int64)
		}
		result[r.AnnotationID][r.Emoji] = r.Count
	}
	return result
}

// batchMyReactions returns userID's active emoji per annotation in the set.
// Empty map if userID is 0 (anonymous) or no reactions exist.
func batchMyReactions(userID uint, annotationIDs []uint) map[uint]string {
	result := make(map[uint]string, len(annotationIDs))
	if len(annotationIDs) == 0 || userID == 0 {
		return result
	}

	var reactions []models.Reaction
	database.DB.Where("user_id = ? AND annotation_id IN ?", userID, annotationIDs).
		Find(&reactions)
	for _, r := range reactions {
		result[r.AnnotationID] = r.Emoji
	}
	return result
}

// populateReactions fills ReactionCounts and MyReaction on each annotation,
// resolving the viewer from the gin context. Slice elements are mutated in
// place — safe because slices share their backing array with the caller.
func populateReactions(c *gin.Context, annotations []models.Annotation) {
	var userID uint
	if uid, ok := c.Get("userID"); ok {
		if u, ok := uid.(uint); ok {
			userID = u
		}
	}
	populateReactionsForUser(userID, annotations)
}

// populateReactionsForUser is the same as populateReactions but takes a
// raw userID. Use this from contexts that don't have a *gin.Context handy
// (e.g. doAnnotationSearch). userID == 0 means "anonymous viewer" — counts
// are still filled, MyReaction is left empty.
func populateReactionsForUser(userID uint, annotations []models.Annotation) {
	if len(annotations) == 0 {
		return
	}

	annotationIDs := make([]uint, len(annotations))
	for i, a := range annotations {
		annotationIDs[i] = a.ID
	}

	counts := batchReactionCounts(annotationIDs)

	var mine map[uint]string
	if userID != 0 {
		mine = batchMyReactions(userID, annotationIDs)
	}

	for i := range annotations {
		annotations[i].ReactionCounts = counts[annotations[i].ID]
		if mine != nil {
			annotations[i].MyReaction = mine[annotations[i].ID]
		}
	}
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
