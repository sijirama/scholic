# Scholic — v0.0.2 → v0.0.3 Roadmap

Order of attack for the items in `TODO`. Phases are ordered by dependency + risk.

---

## Phase 1 — Bug sweep
Clear v0.0.2 cruft before adding new surface area.

**Cluster A — extension state hygiene** (likely share a root cause)
- #1 PDF view: annotation popup on highlight-hover only appears after reload
- #4 Sidebar doesn't close when navigating to a blocked site (icon greys out, sidebar stays)
- #6 Cancelling an annotation (incl. via Esc) leaves the highlight in place

**Cluster B — frontend polish**
- #3 Link-preview image fallback (e.g. arxiv leaves a giant empty image slot)
- #5 "Recently read" sorted by last-read time + label

---

## Phase 2 — Settings foundation (the unlock)
A `user_settings` table + Redis read cache. Build infra once, ship four features on top.

- Default highlight color (currently hardcoded green)
- Blocklist moved to backend (#2) with regex support (#2b)
- "Hotkey-only popup" mode (no auto-popup on highlight)
- PDF native-viewer ↔ Scholic viewer toggle without reload

---

## Phase 3 — Reactions + Tags (parallel)
Independent schema additions. Land both before Discover so it has signal to rank on.

**Reactions**
- `annotation_reactions` table with emoji field
- Toggle endpoint, batch counts in feed
- Full emoji picker in UI

**Tags**
- `tags` + `annotation_tags` (many-to-many)
- Tag input in extension sidebar + web
- Tag-based browsing/filtering

---

## Phase 4 — Feed split + Discover
- Cut global feed → Following / Mine only
- New Discover page: masonry layout, cron-prebuilt every ~6h into Redis (not on-the-fly)
- Empty-follow state → suggested users from trending authors

---

## Phase 5 — Notifications + @mentions
Biggest surface area; saved for last so it can hook into reactions, follows, comments, and mentions cleanly.

- `notifications` table (type, actorID, targetID, read status)
- Triggers: follow, comment, reaction, mention, shared-doc activity
- Badge in navbar, dropdown or dedicated page
- Mark as read (individual + bulk)
- @mention parsing in annotation creation

---

## After all phases
- Bump `VERSION` to `0.0.3`
- Remove the items shipped from `later_version_features.md`
