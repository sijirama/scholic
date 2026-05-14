// Package limits is the single source of truth for app-wide quotas and
// throttles. Tweak constants here when you want to loosen or tighten a knob —
// every endpoint and middleware reads from this package.
package limits

import "time"

const (
	// MaxDocumentUploadBytes is the per-file cap for document uploads (PDF).
	MaxDocumentUploadBytes int64 = 15 * 1024 * 1024 // 15 MiB

	// MaxDocumentTotalBytes is the cap on the sum of file_size across a
	// user's non-deleted documents. Users can keep adding docs until this
	// total is hit.
	MaxDocumentTotalBytes int64 = 30 * 1024 * 1024 // 30 MiB

	// MaxImageAnnotationBytes caps decoded screenshot size for image
	// annotations posted by the extension.
	MaxImageAnnotationBytes = 5 * 1024 * 1024 // 5 MiB

	// MaxMentionsPerText caps unique @mentions in a single annotation or
	// comment body. Limits notification fan-out.
	MaxMentionsPerText = 10

	// IPRequestsPerMinute is the per-IP token-bucket refill rate applied to
	// every request. IPBurst is the bucket size — short spikes are allowed
	// up to this many requests before sustained throttling kicks in.
	IPRequestsPerMinute = 30
	IPBurst             = 10

	// UserWritesPerMinute / UserWriteBurst throttle authenticated POST/PUT
	// activity that creates user-visible content (annotations, comments).
	UserWritesPerMinute = 30
	UserWriteBurst      = 8

	// LimiterIdleTTL controls how long an unused token-bucket entry stays
	// resident in memory before the GC sweep removes it.
	LimiterIdleTTL = 10 * time.Minute
)
