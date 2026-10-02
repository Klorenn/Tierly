# Tierly web redesign — design

**Date:** 2026-10-02  
**Approach:** A — evolve vanilla `tierly/` (no React migration, no split landing)

## Goals

1. Default home combines **public servers** + **what's playing now**.
2. Server card: primary **Join Discord**, secondary **Add bot**.
3. Each game shows a **banner** (Steam → curated Google/manual override → local `/tierly/game-banners/`).
4. Full-app visual pass using existing sand/teal/Fraunces system (improve, don't invent a new brand).

## Non-goals

- Scraping Google Images in the browser at runtime.
- Publishing `guild_id` / Discord user IDs in public views.
- Rewriting Admin React island (only inherit shell tokens if needed).

## Data

| Change | Why |
|--------|-----|
| `communities.invite_url` | Join CTA per public server |
| `games.icon_url`, `games.banner_url` | Art for live/discover (views already referenced `icon_url` but column missing in prod) |
| Update `tierly_public_communities_view` | Project `invite_url` |
| Update `tierly_public_live_presence_view` | Per game+community row; `banner_url`; valid without broken `icon_url` |
| Update `tierly_public_top_games_view` | Project `banner_url` / `icon_url` |

Ops script `scripts/fetch-game-banners.mjs`: resolve Steam appid → download header → write `tierly/game-banners/{canonical}.jpg` → set `games.banner_url` (relative `/tierly/game-banners/...` or absolute CDN). Manual/Google URLs via `scripts/game-banner-overrides.json`.

## UX

- Nav order: Home (discover) · Live · Events · Ranking · Profile · Settings · Admin. Hide empty Rewards.
- Boot: `switchView("discover")`.
- Discover layout: hero (brand) → live strip with banners → server grid with CTAs → top games (with banners) → top players.
- Live tab: same banner cards, aligned with discover data.
- Other views: shared tokens, spacing, type — no dashboard clutter in hero.

## Testing

- Source tests: discover syntax, home default, community join CTA, banner URL usage, migration columns/views.
- Manual: Tellus invite populated; ChileDAO stays off directory until opt-in.

## Risks

- Live view currently groups on missing columns — fix before relying on UI.
- Banner copyright: prefer Steam CDN / owned assets; overrides are curated.
