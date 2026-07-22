package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"scholic/internal/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type backfillTarget struct {
	Name      string
	EventType string
	SQL       string
}

func main() {
	databaseURL := flag.String("database-url", os.Getenv("DATABASE_URL"), "Postgres connection URL")
	dryRun := flag.Bool("dry-run", true, "count missing feed events without inserting them")
	flag.Parse()

	if *databaseURL == "" {
		log.Fatal("database URL is required; set DATABASE_URL or pass -database-url")
	}

	db, err := gorm.Open(postgres.Open(*databaseURL), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}

	targets := []backfillTarget{
		{
			Name:      "annotations",
			EventType: models.FeedEventAnnotationCreated,
			SQL: `
				SELECT
					a.created_at,
					a.updated_at,
					a.user_id AS actor_id,
					? AS type,
					? AS target_type,
					a.id AS target_id,
					a.is_private
				FROM annotations a
				WHERE a.deleted_at IS NULL
					AND NOT EXISTS (
						SELECT 1 FROM feed_events fe
						WHERE fe.deleted_at IS NULL
							AND fe.actor_id = a.user_id
							AND fe.type = ?
							AND fe.target_type = ?
							AND fe.target_id = a.id
					)`,
		},
		{
			Name:      "bookmarks",
			EventType: models.FeedEventBookmarkCreated,
			SQL: `
				SELECT
					b.created_at,
					b.updated_at,
					b.user_id AS actor_id,
					? AS type,
					? AS target_type,
					b.id AS target_id,
					b.is_private
				FROM bookmarks b
				WHERE b.deleted_at IS NULL
					AND NOT EXISTS (
						SELECT 1 FROM feed_events fe
						WHERE fe.deleted_at IS NULL
							AND fe.actor_id = b.user_id
							AND fe.type = ?
							AND fe.target_type = ?
							AND fe.target_id = b.id
					)`,
		},
		{
			Name:      "documents",
			EventType: models.FeedEventDocumentUploaded,
			SQL: `
				SELECT
					d.created_at,
					d.updated_at,
					d.user_id AS actor_id,
					? AS type,
					? AS target_type,
					d.id AS target_id,
					false AS is_private
				FROM documents d
				WHERE d.deleted_at IS NULL
					AND NOT EXISTS (
						SELECT 1 FROM feed_events fe
						WHERE fe.deleted_at IS NULL
							AND fe.actor_id = d.user_id
							AND fe.type = ?
							AND fe.target_type = ?
							AND fe.target_id = d.id
					)`,
		},
		{
			Name:      "follows",
			EventType: models.FeedEventFollowCreated,
			SQL: `
				SELECT
					f.created_at,
					f.created_at AS updated_at,
					f.follower_id AS actor_id,
					? AS type,
					? AS target_type,
					f.following_id AS target_id,
					false AS is_private
				FROM follows f
				WHERE NOT EXISTS (
					SELECT 1 FROM feed_events fe
					WHERE fe.deleted_at IS NULL
						AND fe.actor_id = f.follower_id
						AND fe.type = ?
						AND fe.target_type = ?
						AND fe.target_id = f.following_id
				)`,
		},
	}

	total := int64(0)
	for _, target := range targets {
		targetType := targetTypeForEvent(target.EventType)
		count, err := countMissing(db, target, targetType)
		if err != nil {
			log.Fatalf("count %s: %v", target.Name, err)
		}
		fmt.Printf("%s: %d missing feed events\n", target.Name, count)
		total += count
	}

	if *dryRun {
		fmt.Printf("dry run complete: %d feed events would be created\n", total)
		return
	}

	createdTotal, err := runBackfill(db, targets)
	if err != nil {
		log.Fatalf("backfill failed: %v", err)
	}
	fmt.Printf("backfill complete: %d feed events created\n", createdTotal)

	remainingTotal := int64(0)
	for _, target := range targets {
		targetType := targetTypeForEvent(target.EventType)
		count, err := countMissing(db, target, targetType)
		if err != nil {
			log.Fatalf("recount %s: %v", target.Name, err)
		}
		fmt.Printf("%s: %d missing feed events remaining\n", target.Name, count)
		remainingTotal += count
	}
	fmt.Printf("verification complete: %d feed events still missing\n", remainingTotal)
}

func targetTypeForEvent(eventType string) string {
	switch eventType {
	case models.FeedEventAnnotationCreated:
		return models.FeedTargetAnnotation
	case models.FeedEventBookmarkCreated:
		return models.FeedTargetBookmark
	case models.FeedEventDocumentUploaded:
		return models.FeedTargetDocument
	case models.FeedEventFollowCreated:
		return models.FeedTargetUser
	default:
		log.Fatalf("unknown feed event type: %s", eventType)
		return ""
	}
}

func countMissing(db *gorm.DB, target backfillTarget, targetType string) (int64, error) {
	var count int64
	err := db.Raw(
		"SELECT COUNT(*) FROM ("+target.SQL+") missing",
		target.EventType,
		targetType,
		target.EventType,
		targetType,
	).Scan(&count).Error
	return count, err
}

func insertMissing(db *gorm.DB, target backfillTarget, targetType string) (int64, error) {
	result := db.Exec(
		`INSERT INTO feed_events (
			created_at,
			updated_at,
			actor_id,
			type,
			target_type,
			target_id,
			is_private
		) `+target.SQL+`
		ON CONFLICT (actor_id, type, target_type, target_id) DO NOTHING`,
		target.EventType,
		targetType,
		target.EventType,
		targetType,
	)
	return result.RowsAffected, result.Error
}

func runBackfill(db *gorm.DB, targets []backfillTarget) (int64, error) {
	createdTotal := int64(0)
	err := db.Transaction(func(tx *gorm.DB) error {
		for _, target := range targets {
			targetType := targetTypeForEvent(target.EventType)
			created, err := insertMissing(tx, target, targetType)
			if err != nil {
				return fmt.Errorf("%s: %w", target.Name, err)
			}
			fmt.Printf("%s: %d feed events created\n", target.Name, created)
			createdTotal += created
		}
		return nil
	})
	return createdTotal, err
}
