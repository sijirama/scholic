package discover

// Redis keys for the precomputed Discover rails. All entries are written by
// the background goroutine in Run() — no TTL, they're overwritten on every
// refresh tick.
const (
	KeyTopAnnotations = "scholic:discover:top_annotations"
	KeyTrendingPages  = "scholic:discover:trending_pages"
	KeyTopAuthors     = "scholic:discover:top_authors"
	KeyURLPool        = "scholic:discover:url_pool"
	KeyLastRefresh    = "scholic:discover:last_refresh"
)
