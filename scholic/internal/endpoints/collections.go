package endpoints

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"scholic/internal/database"
	"scholic/internal/models"
	"scholic/internal/services/media"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const maxCollectionCoverBytes = 5 * 1024 * 1024

type CreateCollectionRequest struct {
	Title          string `json:"title" binding:"required"`
	Description    string `json:"description"`
	IsPrivate      bool   `json:"isPrivate"`
	CoverPositionY *int   `json:"coverPositionY"`
}

type UpdateCollectionRequest struct {
	Title          *string `json:"title"`
	Description    *string `json:"description"`
	IsPrivate      *bool   `json:"isPrivate"`
	CoverPositionY *int    `json:"coverPositionY"`
}

type AddCollectionEntryRequest struct {
	TargetType string `json:"targetType" binding:"required"`
	TargetID   uint   `json:"targetId" binding:"required"`
}

type CollectionResponse struct {
	ID             uint        `json:"id"`
	CreatedAt      string      `json:"createdAt"`
	UpdatedAt      string      `json:"updatedAt"`
	OwnerID        uint        `json:"ownerId"`
	Owner          models.User `json:"owner"`
	Title          string      `json:"title"`
	Description    string      `json:"description"`
	CoverImageURL  string      `json:"coverImageUrl"`
	CoverPositionY int         `json:"coverPositionY"`
	IsPrivate      bool        `json:"isPrivate"`
	EntryCount     int64       `json:"entryCount"`
	HasTarget      bool        `json:"hasTarget"`
	TargetEntryID  uint        `json:"targetEntryId,omitempty"`
}

type CollectionEntryResponse struct {
	ID         uint               `json:"id"`
	CreatedAt  string             `json:"createdAt"`
	TargetType string             `json:"targetType"`
	TargetID   uint               `json:"targetId"`
	AddedBy    models.User        `json:"addedBy"`
	Annotation *models.Annotation `json:"annotation,omitempty"`
	Bookmark   *models.Bookmark   `json:"bookmark,omitempty"`
}

type CollectionDetailResponse struct {
	CollectionResponse
	Entries []CollectionEntryResponse `json:"entries"`
	Limit   int                       `json:"limit"`
	Offset  int                       `json:"offset"`
}

func collectionResponse(collection models.Collection, entryCount int64) CollectionResponse {
	return CollectionResponse{
		ID:             collection.ID,
		CreatedAt:      collection.CreatedAt.Format(timeFormatRFC3339()),
		UpdatedAt:      collection.UpdatedAt.Format(timeFormatRFC3339()),
		OwnerID:        collection.OwnerID,
		Owner:          collection.Owner,
		Title:          collection.Title,
		Description:    collection.Description,
		CoverImageURL:  collection.CoverImageURL,
		CoverPositionY: collection.CoverPositionY,
		IsPrivate:      collection.IsPrivate,
		EntryCount:     entryCount,
	}
}

func timeFormatRFC3339() string {
	return "2006-01-02T15:04:05Z07:00"
}

func GetMyCollections(c *gin.Context) {
	userID := c.MustGet("userID").(uint)
	collections, total, hasMore, err := loadCollectionsForOwner(userID, true, c.DefaultQuery("limit", "50"), c.DefaultQuery("offset", "0"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load collections"})
		return
	}
	if err := annotateCollectionTargetMembership(collections, c.Query("targetType"), c.Query("targetId")); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"collections": collections, "total": total, "hasMore": hasMore})
}

func annotateCollectionTargetMembership(collections []CollectionResponse, targetType string, targetIDStr string) error {
	targetType = strings.ToLower(strings.TrimSpace(targetType))
	if targetType == "" && targetIDStr == "" {
		return nil
	}
	if targetType != models.CollectionTargetAnnotation && targetType != models.CollectionTargetBookmark {
		return errors.New("Invalid collection target type")
	}
	targetID, err := strconv.ParseUint(targetIDStr, 10, 64)
	if err != nil || targetID == 0 {
		return errors.New("Invalid target id")
	}
	if len(collections) == 0 {
		return nil
	}
	collectionIDs := make([]uint, 0, len(collections))
	for _, collection := range collections {
		collectionIDs = append(collectionIDs, collection.ID)
	}
	var entries []models.CollectionEntry
	if err := database.DB.Where("collection_id IN ? AND target_type = ? AND target_id = ?", collectionIDs, targetType, uint(targetID)).Find(&entries).Error; err != nil {
		return err
	}
	entriesByCollectionID := map[uint]models.CollectionEntry{}
	for _, entry := range entries {
		entriesByCollectionID[entry.CollectionID] = entry
	}
	for i := range collections {
		if entry, ok := entriesByCollectionID[collections[i].ID]; ok {
			collections[i].HasTarget = true
			collections[i].TargetEntryID = entry.ID
		}
	}
	return nil
}

func GetUserCollections(c *gin.Context) {
	username := c.Param("username")
	var user models.User
	if err := database.DB.Where("username = ?", username).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}
	isOwner := false
	if currentUserID, exists := c.Get("userID"); exists && currentUserID.(uint) == user.ID {
		isOwner = true
	}
	collections, total, hasMore, err := loadCollectionsForOwner(user.ID, isOwner, c.DefaultQuery("limit", "20"), c.DefaultQuery("offset", "0"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load collections"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"collections": collections,
		"total":       total,
		"hasMore":     hasMore,
	})
}

func loadCollectionsForOwner(ownerID uint, includePrivate bool, limitStr string, offsetStr string) ([]CollectionResponse, int64, bool, error) {
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 || limit > 50 {
		limit = 20
	}
	offset, err := strconv.Atoi(offsetStr)
	if err != nil || offset < 0 {
		offset = 0
	}

	query := database.DB.Model(&models.Collection{}).Where("owner_id = ?", ownerID)
	if !includePrivate {
		query = query.Where("is_private = ?", false)
	}

	var total int64
	query.Count(&total)

	var rows []models.Collection
	if err := query.Preload("Owner").Order("created_at DESC").Limit(limit).Offset(offset).Find(&rows).Error; err != nil {
		return nil, 0, false, err
	}

	responses := make([]CollectionResponse, 0, len(rows))
	for _, row := range rows {
		countViewerID := ownerID
		if !includePrivate {
			countViewerID = 0
		}
		count, err := countVisibleCollectionEntries(row.ID, countViewerID)
		if err != nil {
			return nil, 0, false, err
		}
		responses = append(responses, collectionResponse(row, count))
	}
	return responses, total, int64(offset+len(responses)) < total, nil
}

func countVisibleCollectionEntries(collectionID uint, viewerID uint) (int64, error) {
	var annotationCount int64
	if err := database.DB.Table("collection_entries").
		Joins("JOIN annotations ON annotations.id = collection_entries.target_id").
		Where("collection_entries.collection_id = ? AND collection_entries.target_type = ? AND annotations.deleted_at IS NULL AND (annotations.is_private = ? OR annotations.user_id = ?)", collectionID, models.CollectionTargetAnnotation, false, viewerID).
		Count(&annotationCount).Error; err != nil {
		return 0, err
	}
	var bookmarkCount int64
	if err := database.DB.Table("collection_entries").
		Joins("JOIN bookmarks ON bookmarks.id = collection_entries.target_id").
		Where("collection_entries.collection_id = ? AND collection_entries.target_type = ? AND bookmarks.deleted_at IS NULL AND (bookmarks.is_private = ? OR bookmarks.user_id = ?)", collectionID, models.CollectionTargetBookmark, false, viewerID).
		Count(&bookmarkCount).Error; err != nil {
		return 0, err
	}
	return annotationCount + bookmarkCount, nil
}

func CreateCollection(c *gin.Context) {
	userID := c.MustGet("userID").(uint)
	var req CreateCollectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	title := strings.TrimSpace(req.Title)
	if title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title is required"})
		return
	}
	if len(title) > 200 || len(req.Description) > 1000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Collection title or description is too long"})
		return
	}

	collection := models.Collection{
		OwnerID:        userID,
		Title:          title,
		Description:    strings.TrimSpace(req.Description),
		IsPrivate:      req.IsPrivate,
		CoverPositionY: clampCoverPosition(req.CoverPositionY),
	}
	if err := database.DB.Create(&collection).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create collection"})
		return
	}
	database.DB.Preload("Owner").First(&collection, collection.ID)
	c.JSON(http.StatusCreated, collectionResponse(collection, 0))
}

func GetCollection(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	viewerID := currentViewerID(c)
	limit, offset := collectionEntryPagination(c)

	var collection models.Collection
	if err := database.DB.Preload("Owner").First(&collection, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Collection not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load collection"})
		return
	}
	if collection.IsPrivate && (viewerID == nil || *viewerID != collection.OwnerID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Collection not found"})
		return
	}

	entries, visibleCount, err := hydrateCollectionEntries(c, collection.ID, viewerID, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load collection entries"})
		return
	}
	res := CollectionDetailResponse{
		CollectionResponse: collectionResponse(collection, visibleCount),
		Entries:            entries,
		Limit:              limit,
		Offset:             offset,
	}
	c.JSON(http.StatusOK, res)
}

func UpdateCollection(c *gin.Context) {
	collection, ok := requireOwnedCollection(c)
	if !ok {
		return
	}
	var req UpdateCollectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Title != nil {
		title := strings.TrimSpace(*req.Title)
		if title == "" || len(title) > 200 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid title"})
			return
		}
		collection.Title = title
	}
	if req.Description != nil {
		if len(*req.Description) > 1000 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Description is too long"})
			return
		}
		collection.Description = strings.TrimSpace(*req.Description)
	}
	if req.IsPrivate != nil {
		collection.IsPrivate = *req.IsPrivate
	}
	if req.CoverPositionY != nil {
		collection.CoverPositionY = clampCoverPosition(req.CoverPositionY)
	}
	if err := database.DB.Save(&collection).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update collection"})
		return
	}
	database.DB.Preload("Owner").First(&collection, collection.ID)
	count, err := countVisibleCollectionEntries(collection.ID, collection.OwnerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count collection entries"})
		return
	}
	c.JSON(http.StatusOK, collectionResponse(collection, count))
}

func DeleteCollection(c *gin.Context) {
	collection, ok := requireOwnedCollection(c)
	if !ok {
		return
	}
	if collection.CoverImageKey != "" && media.IsR2Available() {
		if err := media.DeleteFile(c.Request.Context(), collection.CoverImageKey); err != nil {
			log.Printf("[Collections] failed to delete cover for collection %d: %v", collection.ID, err)
		}
	}
	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("collection_id = ?", collection.ID).Delete(&models.CollectionEntry{}).Error; err != nil {
			return err
		}
		return tx.Delete(&collection).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete collection"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

func AddCollectionEntry(c *gin.Context) {
	collection, ok := requireOwnedCollection(c)
	if !ok {
		return
	}
	var req AddCollectionEntryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	entry, err := addCollectionEntry(c, collection.ID, collection.OwnerID, req.TargetType, req.TargetID)
	if err != nil {
		status := http.StatusBadRequest
		if err.Error() == "target not found" {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, entry)
}

func DeleteCollectionEntry(c *gin.Context) {
	collection, ok := requireOwnedCollection(c)
	if !ok {
		return
	}
	entryID, ok := parseUintParam(c, "entryId")
	if !ok {
		return
	}
	if err := database.DB.Where("id = ? AND collection_id = ?", entryID, collection.ID).Delete(&models.CollectionEntry{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to remove collection entry"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

func UploadCollectionCover(c *gin.Context) {
	collection, ok := requireOwnedCollection(c)
	if !ok {
		return
	}
	if !media.IsR2Available() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "File storage is not configured"})
		return
	}
	file, header, err := c.Request.FormFile("cover")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file provided"})
		return
	}
	defer file.Close()
	contentType := header.Header.Get("Content-Type")
	if contentType != "image/jpeg" && contentType != "image/png" && contentType != "image/webp" && contentType != "image/gif" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed"})
		return
	}
	if header.Size > maxCollectionCoverBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File too large. Maximum size is 5MB"})
		return
	}

	result, err := media.UploadFile(c.Request.Context(), file, header, "collection-covers")
	if err != nil {
		log.Printf("[Collections] failed to upload cover for collection %d: %v", collection.ID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload cover"})
		return
	}
	oldKey := collection.CoverImageKey
	collection.CoverImageURL = result.URL
	collection.CoverImageKey = result.Key
	if err := database.DB.Save(&collection).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save cover"})
		return
	}
	if oldKey != "" {
		if err := media.DeleteFile(c.Request.Context(), oldKey); err != nil {
			log.Printf("[Collections] failed to delete previous cover for collection %d: %v", collection.ID, err)
		}
	}
	c.JSON(http.StatusOK, gin.H{"coverImageUrl": collection.CoverImageURL})
}

func DeleteCollectionCover(c *gin.Context) {
	collection, ok := requireOwnedCollection(c)
	if !ok {
		return
	}
	oldKey := collection.CoverImageKey
	collection.CoverImageURL = ""
	collection.CoverImageKey = ""
	if err := database.DB.Save(&collection).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clear cover"})
		return
	}
	if oldKey != "" && media.IsR2Available() {
		if err := media.DeleteFile(c.Request.Context(), oldKey); err != nil {
			log.Printf("[Collections] failed to delete cover for collection %d: %v", collection.ID, err)
		}
	}
	c.JSON(http.StatusOK, gin.H{"coverImageUrl": ""})
}

func AddAnnotationToCollection(c *gin.Context, ownerID uint, collectionID uint, annotationID uint) error {
	_, err := addCollectionEntry(c, collectionID, ownerID, models.CollectionTargetAnnotation, annotationID)
	return err
}

func addCollectionEntry(c *gin.Context, collectionID uint, ownerID uint, targetType string, targetID uint) (*CollectionEntryResponse, error) {
	targetType = strings.ToLower(strings.TrimSpace(targetType))
	if targetType != models.CollectionTargetAnnotation && targetType != models.CollectionTargetBookmark {
		return nil, errors.New("Invalid collection target type")
	}
	if err := ensureTargetVisible(ownerID, targetType, targetID); err != nil {
		return nil, err
	}
	entry := models.CollectionEntry{
		CollectionID: collectionID,
		AddedByID:    ownerID,
		TargetType:   targetType,
		TargetID:     targetID,
	}
	err := database.DB.Where(models.CollectionEntry{
		CollectionID: collectionID,
		TargetType:   targetType,
		TargetID:     targetID,
	}).FirstOrCreate(&entry).Error
	if err != nil {
		return nil, err
	}
	responses, _, err := hydrateCollectionEntries(c, collectionID, &ownerID, 100, 0)
	if err != nil {
		return nil, err
	}
	for _, response := range responses {
		if response.ID == entry.ID {
			return &response, nil
		}
	}
	return nil, errors.New("Failed to hydrate collection entry")
}

func ensureTargetVisible(viewerID uint, targetType string, targetID uint) error {
	switch targetType {
	case models.CollectionTargetAnnotation:
		var annotation models.Annotation
		if err := database.DB.First(&annotation, targetID).Error; err != nil {
			return errors.New("target not found")
		}
		if annotation.IsPrivate && annotation.UserID != viewerID {
			return errors.New("target not found")
		}
	case models.CollectionTargetBookmark:
		var bookmark models.Bookmark
		if err := database.DB.First(&bookmark, targetID).Error; err != nil {
			return errors.New("target not found")
		}
		if bookmark.IsPrivate && bookmark.UserID != viewerID {
			return errors.New("target not found")
		}
	}
	return nil
}

func hydrateCollectionEntries(c *gin.Context, collectionID uint, viewerID *uint, limit int, offset int) ([]CollectionEntryResponse, int64, error) {
	visibilityFilter, args := collectionEntryVisibilityFilter(viewerID)

	var visibleCount int64
	if err := database.DB.Model(&models.CollectionEntry{}).
		Where("collection_id = ?", collectionID).
		Where(visibilityFilter, args...).
		Count(&visibleCount).Error; err != nil {
		return nil, 0, err
	}

	var entries []models.CollectionEntry
	if err := database.DB.Preload("AddedBy").
		Where("collection_id = ?", collectionID).
		Where(visibilityFilter, args...).
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&entries).Error; err != nil {
		return nil, 0, err
	}

	var annotationIDs []uint
	var bookmarkIDs []uint
	for _, entry := range entries {
		switch entry.TargetType {
		case models.CollectionTargetAnnotation:
			annotationIDs = append(annotationIDs, entry.TargetID)
		case models.CollectionTargetBookmark:
			bookmarkIDs = append(bookmarkIDs, entry.TargetID)
		}
	}

	annotationsByID := map[uint]models.Annotation{}
	if len(annotationIDs) > 0 {
		var annotations []models.Annotation
		query := database.DB.Where("id IN ?", annotationIDs)
		if viewerID == nil {
			query = query.Where("is_private = ?", false)
		} else {
			query = query.Where("(is_private = ? OR user_id = ?)", false, *viewerID)
		}
		if err := query.Preload("User").Preload("Comments").Preload("Comments.User").Find(&annotations).Error; err != nil {
			return nil, 0, err
		}
		populateReactions(c, annotations)
		models.ResolveLinkPreviewImageVisibility(annotations)
		for _, annotation := range annotations {
			annotationsByID[annotation.ID] = annotation
		}
	}

	bookmarksByID := map[uint]models.Bookmark{}
	if len(bookmarkIDs) > 0 {
		var bookmarks []models.Bookmark
		query := database.DB.Where("id IN ?", bookmarkIDs)
		if viewerID == nil {
			query = query.Where("is_private = ?", false)
		} else {
			query = query.Where("(is_private = ? OR user_id = ?)", false, *viewerID)
		}
		if err := query.Preload("User").Find(&bookmarks).Error; err != nil {
			return nil, 0, err
		}
		for _, bookmark := range bookmarks {
			bookmarksByID[bookmark.ID] = bookmark
		}
	}

	responses := make([]CollectionEntryResponse, 0, len(entries))
	for _, entry := range entries {
		response := CollectionEntryResponse{
			ID:         entry.ID,
			CreatedAt:  entry.CreatedAt.Format(timeFormatRFC3339()),
			TargetType: entry.TargetType,
			TargetID:   entry.TargetID,
			AddedBy:    entry.AddedBy,
		}
		switch entry.TargetType {
		case models.CollectionTargetAnnotation:
			annotation, ok := annotationsByID[entry.TargetID]
			if !ok {
				continue
			}
			response.Annotation = &annotation
		case models.CollectionTargetBookmark:
			bookmark, ok := bookmarksByID[entry.TargetID]
			if !ok {
				continue
			}
			response.Bookmark = &bookmark
		default:
			continue
		}
		responses = append(responses, response)
	}
	return responses, visibleCount, nil
}

func collectionEntryPagination(c *gin.Context) (int, int) {
	limit, err := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if err != nil || limit <= 0 || limit > 50 {
		limit = 20
	}
	offset, err := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if err != nil || offset < 0 {
		offset = 0
	}
	return limit, offset
}

func collectionEntryVisibilityFilter(viewerID *uint) (string, []interface{}) {
	if viewerID == nil {
		return `(
			(target_type = ? AND EXISTS (
				SELECT 1 FROM annotations
				WHERE annotations.id = collection_entries.target_id
				  AND annotations.deleted_at IS NULL
				  AND annotations.is_private = ?
			))
			OR
			(target_type = ? AND EXISTS (
				SELECT 1 FROM bookmarks
				WHERE bookmarks.id = collection_entries.target_id
				  AND bookmarks.deleted_at IS NULL
				  AND bookmarks.is_private = ?
			))
		)`, []interface{}{models.CollectionTargetAnnotation, false, models.CollectionTargetBookmark, false}
	}
	return `(
		(target_type = ? AND EXISTS (
			SELECT 1 FROM annotations
			WHERE annotations.id = collection_entries.target_id
			  AND annotations.deleted_at IS NULL
			  AND (annotations.is_private = ? OR annotations.user_id = ?)
		))
		OR
		(target_type = ? AND EXISTS (
			SELECT 1 FROM bookmarks
			WHERE bookmarks.id = collection_entries.target_id
			  AND bookmarks.deleted_at IS NULL
			  AND (bookmarks.is_private = ? OR bookmarks.user_id = ?)
		))
	)`, []interface{}{models.CollectionTargetAnnotation, false, *viewerID, models.CollectionTargetBookmark, false, *viewerID}
}

func requireOwnedCollection(c *gin.Context) (models.Collection, bool) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return models.Collection{}, false
	}
	userID := c.MustGet("userID").(uint)
	var collection models.Collection
	if err := database.DB.First(&collection, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Collection not found"})
			return models.Collection{}, false
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load collection"})
		return models.Collection{}, false
	}
	if collection.OwnerID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You do not own this collection"})
		return models.Collection{}, false
	}
	return collection, true
}

func parseUintParam(c *gin.Context, name string) (uint, bool) {
	id, err := strconv.ParseUint(c.Param(name), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid id"})
		return 0, false
	}
	return uint(id), true
}

func currentViewerID(c *gin.Context) *uint {
	if currentUserID, exists := c.Get("userID"); exists {
		id := currentUserID.(uint)
		return &id
	}
	return nil
}

func clampCoverPosition(value *int) int {
	if value == nil {
		return 50
	}
	if *value < 0 {
		return 0
	}
	if *value > 100 {
		return 100
	}
	return *value
}
