# Tierly

Standalone extraction of Tierly from Tellus Cooperative. The existing Supabase production project (`rhzanxzoqmbxptvxgnfj`) and its data are retained; this extraction does not create, migrate, or reset a database.

## Run and test

Use a current Node.js release (Node 22+). No root npm install or build step is required.

```sh
npm run dev
npm test
```

Open http://127.0.0.1:8080. Root `/`, `/tierly`, and `/admin/event` serve the public app; `/ops/tierly/` serves the legacy staff dashboard. The dev server only exposes app assets. Browser libraries still load from external CDNs, so browser usage needs network access. The optional Discord bot has its own package and installation instructions in `discord-bot/README.md`; it is not started by the website.

## Contents and provenance

`tierly/` contains the public app, chess engine and images; `ops/tierly/` contains the legacy staff app; `discord-bot/` contains the bot. `supabase/functions/` contains Discord verification, Passport profile, chess and racer functions. The racer simulation/backend is preserved although no racer UI is currently wired into the public app. Tests include the existing app/backend assertions plus standalone hosting regression checks. Tellus footer logo and legacy favicon are retained at their original paths.

Clean import from `Klorenn/telluscoop.org`, source HEAD `7b3f5498fc54c1e787aef23a4634b45d36988578` on 2026-09-28. Source working-tree content was copied, including the pre-existing edited `docs/superpowers/specs/2026-08-29-tierly-racer-phase1-design.md`. No source files were removed. A clean import avoids importing unrelated Tellus history; original history remains in the source repository. Stockfish and racer third-party provenance must be retained; see `docs/third-party/moto-racer-provenance.md` and `tierly/vendor/README.md` plus `tierly/vendor/Copying.txt`. The unchanged Stockfish binaries match the official v18.0.0 release SHA-256 checksums.

## Deploy and domain cutover

Import `Klorenn/Tierly` as a NEW Vercel static project. Select Other framework, repository root, no build command, root output directory. Do not reuse Tellus `.vercel` project linking. `vercel.json` preserves `/tierly` asset paths and OAuth/admin entry points while serving the app at `/`. `.vercelignore` excludes backend source, bot and internal docs from the static upload.

Before enabling a new production domain, explicitly configure the hosted Supabase Auth redirect allowlist for `https://YOUR-DOMAIN/tierly` and any required legacy staff callback. Public OAuth currently returns to `/tierly` on the current origin. Keep existing Tellus redirect URLs during transition. The local config is function metadata, not the hosted Auth configuration.

The four Edge Functions currently allow only Tellus production origins and localhost. Add the exact new HTTPS origin to their CORS allowlists, preserve the old origins during coexistence, review and deploy those changes separately. A new website deployment alone will not enable cross-origin API calls. Retain JWT settings: Passport profile true; Discord/chess/racer false with session validation inside each function. Never deploy copied functions or push migrations merely to move the frontend.

Canonical/OpenGraph URLs, Discord bot `LEADERBOARD_URL`, and the verification welcome message still point to `https://telluscoop.org/tierly`. Update these together when the real domain is selected and verified. Legacy ops invokes the shared `luma-events` function still owned/deployed by Tellus; that source and its Luma secret are deliberately not duplicated here. Shared organization membership and administration remain in the existing database.

## Database and secrets

The 41 SQL files in `supabase/migrations/` are historical Tierly/gaming/chess/racer reference, NOT a complete blank-database bootstrap. They depend on shared `organizations`, `organization_members`, `member_role`, `touch_updated_at()` from `20260716183821_create_stellar_ops_dashboard.sql` and `private.admin_allowlist` from `20260716192111_reserve_master_admin.sql`, plus existing production state. Do not run reset/db push against the shared production project from this extraction. A separate database would need a reviewed dependency extraction and data migration plan.

Frontend Supabase URL/publishable keys are intentionally public and retained. Service-role keys, Discord tokens and Passport credentials belong only in their existing server secret stores; no `.env` or production secrets were copied. Never add Luma or service-role secrets to frontend config.

## Verification and rollback

The extracted Node suite covers static security/config assertions and pure simulations; the standalone suite checks local HTTP routes/assets and backend-source exclusion. It does not prove live OAuth, permissions, realtime gameplay or hosted CORS. Before cutover, verify public ranking, Discord login, profile linking, chess and authorized event administration on the new host. Keep the Tellus deployment and existing URLs live until those checks pass. Rollback consists of restoring domain/DNS to the existing deployment and preserving existing Auth/CORS origins; no database rollback is needed because data was never moved.
