# Scholic — Future Features

## Annotation Reactions
- Emoji-based reactions on annotations (not simple likes — full emoji picker)
- New `annotation_reactions` table with emoji field
- Toggle endpoint, batch counts in feed

## Notifications System
- Triggers: someone follows you, comments on your annotation, reacts to your annotation
- New `notifications` table (type, actorID, targetID, read status)
- Badge count in navbar, dropdown or dedicated page
- Mark as read (individual + bulk)

## Repost annotations
- we wanna be able to repost annotations with text/image

## Tags / Labels on Annotations
- Many-to-many: `annotation_tags` join table + `tags` table
- Tag input on annotation creation (extension sidebar + web)
- Tag-based browsing/filtering in feed and profile
- Build together with search/filter above

## Trending / Discover Feed
- New feed tab: "Trending" or "Discover"
- Most-annotated URLs, most-commented annotations across all users
- Combine with tags and reactions for richer discovery

## Real-Time Updates
- WebSocket or SSE for live comment updates
- New annotations appearing in feed without refresh
- Go goroutines + channels for efficient broadcasting

## Mobile & Responsive Design (v0.0.3)
- Full mobile responsiveness across all client pages: Feed, Profile, AnnotationPage, SitePage, Search, Landing, Settings, Onboarding
- Responsive Navbar (hamburger menu on mobile)
- AnnotationCard component mobile layout
- Touch-friendly UI elements (larger tap targets, swipe gestures)
- Sidebar layout adjustments for narrow screens
- CSS media query pass across all pages (target: 320px–768px breakpoints)
