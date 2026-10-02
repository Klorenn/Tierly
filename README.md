# Tierly

Capa de identidad e incentivos gaming para comunidades de Discord.

Tierly ayuda a servidores a **entender qué juegan sus miembros**, **lanzar eventos** alrededor de esa actividad y **recompensar participación** con XP, stamps y logros que siguen a los jugadores entre comunidades.

**Visión:** Tu vida gaming en Discord, en un solo perfil.

---

## Estado actual (2 oct 2026)

| Componente | Estado |
|------------|--------|
| **Web app** (`tierly/`) | ✅ Funcional en `https://www.tirly.xyz/` — leaderboard, eventos, perfil, live/presence, discover, admin |
| **Bot Discord** (`discord-bot/`) | ✅ Desplegado en VM GCP (systemd) — presence, eventos, slash commands (`/tierly set|config|sync|event|profile|leaderboard|live|help`) |
| **Edge Functions** | ✅ Desplegadas: `discord-verify`, `passport-profile` (CORS `tirly.xyz`). `racer` legacy sin UI |
| **Base de datos** | ✅ 60+ migraciones en repo; algunas pendientes de verificar/aplicar en prod (ver abajo) |
| **Tests** | ✅ Suite Node (assertions estáticas + simulaciones) |

---

## Arquitectura

```
tierly/              # Public app (vanilla JS, sin bundler)
  ├── app.js         # Leaderboard, eventos, perfil, live, discover, admin
  ├── discover.js    # Descubrimiento público: comunidades, top juegos, top players
  ├── index.html     # Shell + estilos + cache-busting v20261002-05
  └── admin-app/     # Panel admin legacy (ops/tierly/)

discord-bot/         # Bot Gateway persistente (Node + discord.js)
  ├── index.js       # Presence, eventos, slash commands, welcome/announce channels
  ├── session-store.mjs   # RPCs: consent, attendance, sessions, community settings
  └── presence-delta.mjs  # Diff de presence updates

supabase/functions/  # Edge Functions (Deno)
  ├── discord-verify/    # OAuth Discord, perfil, Passport, admin claims
  ├── passport-profile/  # Stellar Passport builders search + profile
  └── racer/             # Legacy simulación racer (sin UI; no feature de producto)

supabase/migrations/   # 60+ migraciones SQL (schema, vistas públicas, RPCs auditados)
```

---

## Ejecutar localmente

```sh
# Requiere Node 22+. Sin npm install ni build step.
npm run dev        # Sirve en http://127.0.0.1:8080
npm test           # Suite Node (assertions estáticas + simulaciones)
```

Rutas servidas:
- `/` → `tierly/index.html` (app pública)
- `/tierly/` → assets estáticos
- `/ops/tierly/` → panel admin legacy

---

## Despliegue en producción

### 1. Vercel (frontend estático)
- Importar `Klorenn/Tierly` como **nuevo** proyecto Vercel
- Framework: **Other**, Build command: *vacío*, Output: *root*
- `vercel.json` preserva `/tierly` assets y entry points OAuth/admin
- `.vercelignore` excluye backend, bot y docs internas

### 2. Supabase (Edge Functions + DB)
- Secrets en Dashboard → Edge Functions:
  ```
  DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, STELLAR_PASSPORT_API_KEY,
  WELCOME_CHANNEL_ID, SUPABASE_SERVICE_ROLE_KEY
  ```
  > La **publishable key** (`sb_publishable_...`) es intencionalmente pública y se usa en el frontend (`tierly/app.js`). Los secrets arriba son solo para Edge Functions y bot.
- Auth → URL Configuration → Redirect URLs: `https://www.tirly.xyz/tierly`
- Mantener orígenes Tellus durante coexistencia

### 3. Bot Discord (VM GCP e2-micro, free tier)
```bash
gcloud compute ssh tierly-bot --zone=us-west1-b --command="
  cd ~/tellus && git pull && cd discord-bot && npm install && sudo systemctl restart tierly-bot
"
```
- `.env` en VM con: `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Intents requeridos: **Guild Members**, **Message Content**, **Presence**
- systemd + healthcheck timer configurados

### 4. Migraciones (estado verificado 2 oct 2026)

`supabase migration list` contra `rhzanxzoqmbxptvxgnfj`:

- **Aplicadas en prod (ya no pendientes):** `20260826*`, `20261001030000` (revocación), `20261002040000` (asistencia sin claim), `20261002050000` (canales bot)
- **Solo remoto (archivos locales borrados — chess/racer):** `20260829120000`–`20260829150000`. Dejar el historial; no resetear.
- **Local-only:** ninguna al momento del inventario

No ejecutar `db reset` ni `db push` a ciegas. Antes de aplicar algo nuevo: revisar dependencias y rollback.

---

## Variables de entorno

| Variable | Dónde | Requerida |
|----------|-------|-----------|
| `DISCORD_BOT_TOKEN` | VM `.env` + Discord Developer Portal | ✅ |
| `DISCORD_GUILD_ID` | VM `.env` + Edge Functions secrets | ✅ |
| `SUPABASE_URL` | VM `.env` | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | VM `.env` + Edge Functions secrets | ✅ |
| `STELLAR_PASSPORT_API_KEY` | Edge Functions secrets | ✅ |
| `WELCOME_CHANNEL_ID` | VM `.env` (fallback; config real en DB via `/tierly set`) | ⚠️ |

---

## Funcionalidades clave implementadas

### 🎮 Leaderboard & Ranking
- Top 50 / búsqueda global / Passport builders autocomplete
- Tiers: Bronce → Diamante (3 divisiones c/u), seasons 6 meses
- Puntos: 1º=10, 2º=6, 3º=3, participación=1

### 📅 Eventos Comunitarios
- Catálogo público + inscripción + check-in + cierre organizador
- Estados: borrador/publicado/cancelado/cerrado, UTC + timezone
- Revocación auditada + reversión XP/stamp (ledger append-only)

### 👤 Perfil Jugador
- Stats: rank, events, wins, top3, win rate
- Tier + progress bar, racha mensual (stub visual)
- Historial partidas (últimas 8), banner picker con crop
- Edit profile: display_name, bio, X/Telegram/Instagram/Discord handles
- Stellar Passport link/unlink (sync name/bio/avatar/socials)

### 🔴 Live / En Vivo (NUEVO)
- Who's playing now: grid por juego, avatars, tiempo jugando
- Stats: jugadores online, juegos activos, comunidades activas
- Supabase Realtime subscription a `play_sessions`

### 🔍 Descubrimiento Público
- Comunidades `public_directory=true` + consentimiento
- Top juegos (minutos, sesiones, comunidades, último día)
- Top players por comunidad (opt-in `identity_visible`)
- Invite bot CTA con Application ID configurado



### 🛡️ Admin Panel
- CRUD eventos/torneos/brackets/rewards/players
- Slash commands bot: `/tierly set|config|sync|event|profile|leaderboard|live|help`
- Community settings: presence_enabled, public_directory, welcome/announce channels

---

## Base de datos: vistas públicas clave (anon read)

| Vista | Qué expone |
|-------|------------|
| `leaderboard_public_view` | `player_id, username, display_name, avatar_url, discord_member, banner, banner_fit, bio, total_points` |
| `tierly_community_events_public_view` | Eventos `scheduled/live` + `registration_count` |
| `tierly_public_communities_view` | Comunidades `public_directory` + `consenting_member_count`, `games_tracked` |
| `tierly_public_top_games_view` | Top juegos 30d: minutos, sesiones, comunidades, último día |
| `tierly_public_top_players_view` | Top players por comunidad (requiere `consent_status=accepted` + `identity_visible`) |
| `tierly_public_live_presence_view` | Sesiones activas ahora: juego, jugador, comunidad, minutos jugando |

---

## RPCs auditados clave

| RPC | Qué hace |
|-----|----------|
| `tierly_register_event(p_event_id)` | Inscripción evento comunitario (idempotente) |
| `tierly_revoke_event_confirmation(...)` | Revocación auditada + fila compensatoria |
| `tierly_accept_member_consent / decline / request_deletion` | Privacidad presence |
| `tierly_set_public_directory(target_guild, listed)` | Toggle descubrimiento (solo admins) |
| `tierly_bot_health_heartbeat / error` | Health tracking bot |
| `recalculate_gaming_score()` | Trigger auto en `gaming_matches confirmed` → actualiza `gaming_scores` |

---

## Verificación pre-cutover

Antes de cambiar dominio:
- [ ] Login Discord → perfil sincronizado → `isAdmin` true
- [ ] Leaderboard carga + búsqueda + Passport builders
- [ ] Eventos: catálogo, inscripción, check-in, cierre, XP/stamp
- [ ] Revocación + reversión → ledger append-only (requiere migración `20261001030000` en prod)
- [ ] Live/presence: grid por juego, stats, realtime
- [ ] Discover: comunidades, top juegos, top players, invite bot
- [ ] Admin: CRUD eventos, confirmación/revocación
- [ ] Bot online en Discord, slash commands registrados (`event create|list|join` incluidos)
- [ ] Rollback: DNS a Tellus preserva datos/orígenes (sin reset Supabase)

---

## Referencias

- **Roadmap completo:** [TIERLY_ROADMAP.md](TIERLY_ROADMAP.md)
- **Runbook piloto:** [docs/tierly-pilot-validation.md](docs/tierly-pilot-validation.md)
- **RPC reporte piloto:** `public.tierly_pilot_report()` (migración `20260930230000_tierly_pilot_report.sql`)
- **Bot docs:** [discord-bot/README.md](discord-bot/README.md)
- **Auditoría histórica:** [docs/archive/2026-08-27-tierly-roadmap-audit.md](docs/archive/2026-08-27-tierly-roadmap-audit.md)

---

## Rollback

Restaurar DNS/dominio a despliegue Tellus existente. Preservar Auth/CORS origins. **No resetear Supabase** — datos nunca se movieron.