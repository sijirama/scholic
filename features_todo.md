# Scholic — Future Features

## Real-Time Updates
- WebSocket or SSE for live comment updates
- New annotations appearing in feed without refresh
- Go goroutines + channels for efficient broadcasting
- real time notifications too

## Upload pdfs from your system to read online with scholic
- some pdfs aren't available to read on the web for some reason, so i wanna like be able to upload them 
  from my computer
- we need to add rate limiting to this, so per user it's15 mb per file 10 documents in total, so later when we do a premium plan it can be extended

## Cool features to add
- bookmarks (lil star on the extension sidebar to bookmark it)
  - tab in profile to show that (idk how this will work, will it be public or private i really don't know)
- comment to comment, send a notification to the owner of the comment you're commenting too

## Mobile & Responsive Design (v0.0.3)
- Full mobile responsiveness across all client pages: Feed, Profile, AnnotationPage, SitePage, Search, Landing, Settings, Onboarding
- Responsive Navbar (hamburger menu on mobile)
- AnnotationCard component mobile layout
- Touch-friendly UI elements (larger tap targets, swipe gestures)
- Sidebar layout adjustments for narrow screens
- CSS media query pass across all pages (target: 320px–768px breakpoints)

## Optimistic updates
- we need optimistic updates enough to make the perception of speed
- react query for all queries with proper caching and invalidation
- at the same time maybe a quick latency test to make sure our endpoints are doing well

## Tests
- we need to write tests and benchmarks for everything pls

## Document search infra
- move document embeddings/search from in-process cosine scoring to pgvector
- this will be a real migration, not a tiny patch
- likely path:
  - provision the new db with pgvector enabled
  - migrate the schema and data from the current db
  - backfill document embeddings into vector columns
  - switch document search queries to native vector similarity in postgres
  - cut over app env/config to the new db carefully
