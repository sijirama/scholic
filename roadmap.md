# Scholic — v0.0.2 → v0.0.3 Roadmap

Order of attack for the items in `TODO`. Phases are ordered by dependency + risk.

---

## Phase 1 — Bug sweep — DONE (commit `9e50952`)
Clear v0.0.2 cruft before adding new surface area.

**Cluster A — extension state hygiene**
- [x] #1 PDF view: annotation popup on highlight-hover only appears after reload
- [x] #4 Sidebar doesn't close when navigating to a blocked site
- [x] #6 Cancelling an annotation (incl. via Esc) leaves the highlight in place

**Cluster B — frontend polish**
- [x] #3 Link-preview image fallback (arxiv leaves a giant empty image slot)
- [x] #5 "Recently read" sorted by last-read time + label

---

## Phase 2 — Settings foundation (the unlock) (DONE)

- Blocklist moved to backend (#2) with regex support (#2b)
- PDF native-viewer ↔ Scholic viewer toggle without reload

---

## Phase 3 — Reactions — DONE (commit `6e4da14`)
Twitter-style reactions, curated 10 emojis, replace-on-react semantics.

- [x] `Reaction` model + composite unique index on (annotation_id, user_id)
- [x] Toggle endpoint with insert / replace / toggle-off behaviour
- [x] Reaction counts + viewer's active emoji injected into all 6 read paths
- [x] `ReactionStrip` component reused across web (Feed, Profile, AnnotationPage, SitePage, Search, SearchModal, Landing)
- [x] Extension sidebar list items + highlight-hover popup get the same strip
- [x] Optimistic update with rollback in both web and extension

Tags were on the original plan as Phase 3b but got cut — see "Cut from v0.0.3" below.

---

## Phase 4 — Feed split + Discover
- Cut global feed → Following / Mine only
- New Discover page: masonry layout, cron-prebuilt every ~6h into Redis (not on-the-fly)
- Empty-follow state → suggested users from trending authors

---

## Phase 5 — Notifications + @mentions — DONE
Biggest surface area; saved for last so it can hook into reactions, follows, comments, and mentions cleanly.

- [x] `notifications` table (type, actorID, targetID, read status)
- [x] Triggers: follow, comment, reaction, mention, reply (thread participants), shared-doc (followers who also annotated the URL)
- [x] Badge in navbar, dropdown or dedicated page
- [x] Mark as read (individual + bulk)
- [x] @mention parsing in annotation + comment creation, with edit-aware re-notify suppression
- [x] Mention autocomplete on web (portaled past overflow:hidden) + extension sidebar

---

## After all phases
- Bump `VERSION` to `0.0.3`
- Remove the items shipped from `later_version_features.md`
