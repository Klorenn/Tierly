# Tierly project guide

Static vanilla JS application, no bundler or root dependency installation. `npm run dev` serves port 8080; `npm test` runs Node tests. Preserve `/tierly/` assets and OAuth callback routes, plus `/admin/event` and `/ops/tierly/`. Public app is `tierly/`; legacy ops is `ops/tierly/`; optional bot is `discord-bot/`.

Keep ops JS/CSS cache versions matched. New behavior requires a failing regression test before implementation. Run relevant checks then the full suite. Source assertions are not live integration tests. Conventional commits only, without Co-Authored-By or AI attribution.

Keep existing production Supabase data and RLS. Included migrations are incomplete historical reference with shared Tellus prerequisites; do not blindly reset/push them. Do not change hosted configuration or deploy functions implicitly. Browser publishable keys are public; service-role, Discord and Luma secrets must stay server-side. Preserve old CORS/Auth origins during domain transition. Read README deployment/rollback notes before changing domains or shared backend behavior.
