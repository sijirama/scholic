package feed

import (
	"context"
	"log"
	"time"

	"scholic/internal/database"
	"scholic/internal/models"
)

type EventInput struct {
	ActorID    uint
	Type       string
	TargetType string
	TargetID   uint
	IsPrivate  bool
}

func CreateEvent(ctx context.Context, input EventInput) error {
	event := models.FeedEvent{
		ActorID:    input.ActorID,
		Type:       input.Type,
		TargetType: input.TargetType,
		TargetID:   input.TargetID,
		IsPrivate:  input.IsPrivate,
	}
	return database.DB.WithContext(ctx).
		Where("actor_id = ? AND type = ? AND target_type = ? AND target_id = ?", input.ActorID, input.Type, input.TargetType, input.TargetID).
		Assign(map[string]interface{}{"is_private": input.IsPrivate}).
		FirstOrCreate(&event).Error
}

func CreateEventAsync(input EventInput) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := CreateEvent(ctx, input); err != nil {
			log.Printf("[Feed] create event failed type=%s target=%s/%d: %v", input.Type, input.TargetType, input.TargetID, err)
		}
	}()
}

func UpdateEventPrivacy(ctx context.Context, eventType, targetType string, targetID uint, isPrivate bool) error {
	return database.DB.WithContext(ctx).Model(&models.FeedEvent{}).
		Where("type = ? AND target_type = ? AND target_id = ?", eventType, targetType, targetID).
		Update("is_private", isPrivate).Error
}

func DeleteEvents(ctx context.Context, eventType, targetType string, targetID uint) error {
	return database.DB.WithContext(ctx).
		Where("type = ? AND target_type = ? AND target_id = ?", eventType, targetType, targetID).
		Delete(&models.FeedEvent{}).Error
}

func DeleteActorEvent(ctx context.Context, actorID uint, eventType, targetType string, targetID uint) error {
	return database.DB.WithContext(ctx).
		Where("actor_id = ? AND type = ? AND target_type = ? AND target_id = ?", actorID, eventType, targetType, targetID).
		Delete(&models.FeedEvent{}).Error
}
