package main

import (
	"flag"
	"fmt"
	"log"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"

	"scholic/internal/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type annotationRow struct {
	ID  uint
	URL string
}

type bookmarkRow struct {
	ID        uint
	UserID    uint
	URL       string
	IsPrivate bool
	CreatedAt time.Time
}

type bookmarkPlan struct {
	CanonicalURL string
	Keeper       bookmarkRow
	Members      []bookmarkRow
	AnyPublic    bool
}

func main() {
	databaseURL := flag.String("database-url", os.Getenv("DATABASE_URL"), "Postgres connection URL")
	dryRun := flag.Bool("dry-run", true, "count URL changes without updating prod data")
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

	annotations, err := loadAnnotations(db)
	if err != nil {
		log.Fatalf("load annotations: %v", err)
	}
	bookmarks, err := loadBookmarks(db)
	if err != nil {
		log.Fatalf("load bookmarks: %v", err)
	}

	annotationUpdates := changedAnnotationURLs(annotations)
	bookmarkPlans := planBookmarkChanges(bookmarks)

	bookmarkURLUpdates := 0
	bookmarkPrivacyUpdates := 0
	bookmarkDeletes := 0
	for _, plan := range bookmarkPlans {
		if plan.Keeper.URL != plan.CanonicalURL {
			bookmarkURLUpdates++
		}
		if plan.Keeper.IsPrivate == plan.AnyPublic {
			bookmarkPrivacyUpdates++
		}
		bookmarkDeletes += len(plan.Members) - 1
	}

	fmt.Printf("annotations: %d urls to sanitize\n", len(annotationUpdates))
	fmt.Printf("bookmarks: %d urls to sanitize\n", bookmarkURLUpdates)
	fmt.Printf("bookmarks: %d duplicate rows to remove after canonicalization\n", bookmarkDeletes)
	fmt.Printf("bookmarks: %d visibility rows to update after merge\n", bookmarkPrivacyUpdates)

	if *dryRun {
		fmt.Println("dry run complete: no rows were changed")
		return
	}

	if err := db.Transaction(func(tx *gorm.DB) error {
		if err := applyAnnotationUpdates(tx, annotationUpdates); err != nil {
			return err
		}
		if err := applyBookmarkPlans(tx, bookmarkPlans); err != nil {
			return err
		}
		return nil
	}); err != nil {
		log.Fatalf("sanitize urls: %v", err)
	}

	remainingAnnotations := len(changedAnnotationURLs(mustLoadAnnotations(db)))
	remainingBookmarkPlans := planBookmarkChanges(mustLoadBookmarks(db))
	remainingBookmarkUpdates := 0
	remainingBookmarkDeletes := 0
	for _, plan := range remainingBookmarkPlans {
		if plan.Keeper.URL != plan.CanonicalURL {
			remainingBookmarkUpdates++
		}
		remainingBookmarkDeletes += len(plan.Members) - 1
	}

	fmt.Println("sanitize complete")
	fmt.Printf("verification: %d annotation urls still need sanitizing\n", remainingAnnotations)
	fmt.Printf("verification: %d bookmark urls still need sanitizing\n", remainingBookmarkUpdates)
	fmt.Printf("verification: %d bookmark duplicate rows still need removing\n", remainingBookmarkDeletes)
}

func loadAnnotations(db *gorm.DB) ([]annotationRow, error) {
	var rows []annotationRow
	err := db.Model(&models.Annotation{}).
		Select("id", "url").
		Where("deleted_at IS NULL").
		Find(&rows).Error
	return rows, err
}

func loadBookmarks(db *gorm.DB) ([]bookmarkRow, error) {
	var rows []bookmarkRow
	err := db.Model(&models.Bookmark{}).
		Select("id", "user_id", "url", "is_private", "created_at").
		Where("deleted_at IS NULL").
		Find(&rows).Error
	return rows, err
}

func mustLoadAnnotations(db *gorm.DB) []annotationRow {
	rows, err := loadAnnotations(db)
	if err != nil {
		log.Fatalf("reload annotations: %v", err)
	}
	return rows
}

func mustLoadBookmarks(db *gorm.DB) []bookmarkRow {
	rows, err := loadBookmarks(db)
	if err != nil {
		log.Fatalf("reload bookmarks: %v", err)
	}
	return rows
}

func changedAnnotationURLs(rows []annotationRow) map[uint]string {
	updates := map[uint]string{}
	for _, row := range rows {
		canonical := canonicalAnnotationURL(row.URL)
		if canonical != row.URL {
			updates[row.ID] = canonical
		}
	}
	return updates
}

func planBookmarkChanges(rows []bookmarkRow) []bookmarkPlan {
	groups := map[string][]bookmarkRow{}
	canonicalURLs := map[string]string{}
	for _, row := range rows {
		canonical := canonicalAnnotationURL(row.URL)
		key := fmt.Sprintf("%d\x00%s", row.UserID, canonical)
		groups[key] = append(groups[key], row)
		canonicalURLs[key] = canonical
	}

	plans := []bookmarkPlan{}
	for key, members := range groups {
		canonical := canonicalURLs[key]
		sort.Slice(members, func(i, j int) bool {
			iClean := members[i].URL == canonical
			jClean := members[j].URL == canonical
			if iClean != jClean {
				return iClean
			}
			if !members[i].CreatedAt.Equal(members[j].CreatedAt) {
				return members[i].CreatedAt.Before(members[j].CreatedAt)
			}
			return members[i].ID < members[j].ID
		})

		anyPublic := false
		needsURLChange := false
		for _, member := range members {
			if !member.IsPrivate {
				anyPublic = true
			}
			if member.URL != canonical {
				needsURLChange = true
			}
		}

		keeper := members[0]
		if len(members) > 1 || needsURLChange || keeper.IsPrivate == anyPublic {
			plans = append(plans, bookmarkPlan{
				CanonicalURL: canonical,
				Keeper:       keeper,
				Members:      members,
				AnyPublic:    anyPublic,
			})
		}
	}

	sort.Slice(plans, func(i, j int) bool {
		if plans[i].Keeper.UserID != plans[j].Keeper.UserID {
			return plans[i].Keeper.UserID < plans[j].Keeper.UserID
		}
		return plans[i].CanonicalURL < plans[j].CanonicalURL
	})
	return plans
}

func applyAnnotationUpdates(tx *gorm.DB, updates map[uint]string) error {
	for id, canonical := range updates {
		if err := tx.Model(&models.Annotation{}).Where("id = ?", id).UpdateColumn("url", canonical).Error; err != nil {
			return fmt.Errorf("update annotation %d: %w", id, err)
		}
	}
	return nil
}

func applyBookmarkPlans(tx *gorm.DB, plans []bookmarkPlan) error {
	for _, plan := range plans {
		for _, member := range plan.Members[1:] {
			if err := tx.Where("type = ? AND target_type = ? AND target_id = ?", models.FeedEventBookmarkCreated, models.FeedTargetBookmark, member.ID).
				Delete(&models.FeedEvent{}).Error; err != nil {
				return fmt.Errorf("delete bookmark feed event %d: %w", member.ID, err)
			}
			if err := tx.Delete(&models.Bookmark{}, member.ID).Error; err != nil {
				return fmt.Errorf("delete duplicate bookmark %d: %w", member.ID, err)
			}
		}

		nextPrivate := !plan.AnyPublic
		updates := map[string]interface{}{}
		if plan.Keeper.URL != plan.CanonicalURL {
			updates["url"] = plan.CanonicalURL
		}
		if plan.Keeper.IsPrivate != nextPrivate {
			updates["is_private"] = nextPrivate
		}
		if len(updates) > 0 {
			if err := tx.Model(&models.Bookmark{}).Where("id = ?", plan.Keeper.ID).UpdateColumns(updates).Error; err != nil {
				return fmt.Errorf("update bookmark %d: %w", plan.Keeper.ID, err)
			}
			if visibility, ok := updates["is_private"]; ok {
				if err := tx.Model(&models.FeedEvent{}).
					Where("type = ? AND target_type = ? AND target_id = ?", models.FeedEventBookmarkCreated, models.FeedTargetBookmark, plan.Keeper.ID).
					Update("is_private", visibility).Error; err != nil {
					return fmt.Errorf("update bookmark feed event privacy %d: %w", plan.Keeper.ID, err)
				}
			}
		}
	}
	return nil
}

func canonicalAnnotationURL(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme == "" || u.Host == "" {
		return stripQueryAndFragment(raw)
	}

	u.Scheme = strings.ToLower(u.Scheme)
	u.Host = strings.ToLower(u.Host)
	u.RawQuery = ""
	u.ForceQuery = false
	u.Fragment = ""
	if len(u.Path) > 1 {
		u.Path = strings.TrimRight(u.Path, "/")
	}
	return u.String()
}

func stripQueryAndFragment(raw string) string {
	raw = strings.TrimSpace(raw)
	if i := strings.IndexAny(raw, "?#"); i >= 0 {
		return raw[:i]
	}
	return raw
}
