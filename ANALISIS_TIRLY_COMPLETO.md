# Análisis completo de TIRLY — Estado actual vs Roadmap

**Fecha del análisis:** 2 de octubre de 2026  
**URL analizada:** https://www.tirly.xyz/  
**Repositorio:** Tierly (vanilla JS estático, sin bundler)

---

## 1. RESUMEN EJECUTIVO

El sitio **no funciona correctamente en producción**. Aunque el código local implementa gran parte del roadmap (Fase 0 y 1), el despliegue en https://www.tirly.xyz/ tiene **fallos críticos** que impiden cargar cualquier dato:

- **Error 403 en `discord-verify`** (edge function de Supabase) — bloquea autenticación, verificación de membresía, sincronización de perfil y todo lo que requiera backend.
- **Contenido vacío en todas las vistas** — leaderboard, eventos, recompensas, perfil, ajustes, descubrimiento, ajedrez y admin no renderizan datos.
- **CORS/Auth Origins desactualizados** — los edge functions solo permiten `telluscoop.org`, no `tirly.xyz`.

El roadmap (TIERLY_ROADMAP.md) prioriza **Permisos de datos → ciclo de evento → repetición → inteligencia → descubrimiento → credenciales**. Actualmente:
- ✅ Código local cubre Fase 0 (base técnica) y Fase 1 (ciclo completo) + adelanto Fase 4 (descubrimiento)
- ❌ **Despliegue y validación en vivo (Fase 0 pendientes: CORS, Auth, bot, dominio) bloquean todo**

---

## 2. ERRORES CRÍTICOS EN PRODUCCIÓN (Playwright)

### 2.1 Edge Function `discord-verify` devuelve 403
```
[ERROR] Failed to load resource: the server responded with a status of 403 () 
@ https://rhzanxzoqmbxptvxgnfj.supabase.co/functions/v1/discord-verify
```

**Causa raíz:** `supabase/functions/discord-verify/index.ts` línea 4-5 define `ALLOWED_ORIGINS` solo con `telluscoop.org`. El dominio `tirly.xyz` no está en la lista, así que CORS rechaza la petición.

**Impacto:** Rompe **todo** el flujo autenticado:
- Login con Discord (`checkDiscordMembership`)
- Sincronización de perfil (`update_profile`, `unlink_passport`, `claim_community_admin`)
- Verificación de admin (`isAdmin` → panel admin no aparece)
- Privacidad/consentimiento (`tierly_accept_member_consent`, etc.)
- Banner de perfil (`persistBannerToServer`)

### 2.2 Edge Function `passport-profile` no desplegada / CORS igual
Mismo problema de `ALLOWED_ORIGINS` (línea 7: solo `telluscoop.org`). La búsqueda de builders de Passport falla silenciosamente.

### 2.3 Edge Function `chess` — mismo CORS
`supabase/functions/chess/index.ts` línea 5: solo `telluscoop.org`. El módulo de ajedrez (bot/PvP) no funciona en `tirly.xyz`.

---

## 3. FUNCIONALIDADES ESPERADAS (Código local) vs REALIDAD EN PRODUCCIÓN

| Vista / Feature | Código local (`tierly/app.js`, `chess.js`, `discover.js`) | Producción (`tirly.xyz`) | Gap |
|-----------------|----------------------------------------------------------|--------------------------|-----|
| **Leaderboard** | Top 50 + búsqueda + Passport builders + tabs Top 5 / Todos | Vacío (skeleton/empty state) | ❌ Datos no cargan |
| **Eventos (bracket)** | Catálogo eventos comunitarios + inscripción + check-in | Vacío | ❌ |
| **Recompensas** | Lista de rewards fulfilled (vacío por ahora) | Vacío | ❌ |
| **Perfil** | Stats, tier, racha (stub), historial, banner picker, edit profile, Passport link | Vacío | ❌ |
| **Ajustes** | Idioma, tema, privacidad presence (opt-in/borrado) | Vacío | ❌ |
| **Descubrimiento** | Comunidades públicas, top juegos, top players, invite bot | Vacío | ❌ |
| **Ajedrez** | Bot (Stockfish 3 niveles) + PvP realtime + rating Elo + coach | Vacío | ❌ |
| **Admin** | CRUD eventos, torneos, brackets, rewards, players | Link visible pero panel no carga (isAdmin=false) | ❌ |

---

## 4. ANÁLISIS FRENTE AL ROADMAP (TIERLY_ROADMAP.md)

### 4.1 Fase 0 — Viabilidad y base operable (P0)

| Ítem | Roadmap | Estado código local | Estado producción | Comentario |
|------|---------|---------------------|-------------------|------------|
| Mapear datos (origen, finalidad, campos, retención) | ✅ `[x]` | Schema documentado en migraciones | — | Hecho |
| **Confirmación Discord para presence, stats cross-server, perfil persistente, uso comercial** | ❌ `[ ]` | No aplica (config) | **BLOQUEADO** | Requiere ticket a Discord; sin esto presence y portabilidad APAGADAS |
| Alternativa autodeclarada (check-in explícito, sin profiling) | ❌ `[ ]` | Parcial: check-in manual en eventos | — | Falta validar si cumple política |
| **Host con redirects Auth, CORS exacto, URLs canónicas, enlaces bot coherentes** | ❌ `[ ]` | Config local OK | **ROTO** | CORS en edge functions no incluye `tirly.xyz` |
| Operación Gateway bot (systemd, healthcheck, rollback) | ✅ `[x]` | Documentado | ❓ Despliegue bot no verificado | Falta confirmar bot corriendo |
| Entrevistas organizadores/jugadores | ❌ `[ ]` | No | — | Pendiente producto |
| Auditoría leaderboard/comunidad pre-migración multi-community | ✅ `[x]` | Migraciones aplicadas local | ❓ Verificar remoto | Migraciones 20260826* sin confirmar en prod |
| `discord_id` estable (no match por display_name) | ✅ `[x]` | Usa `discord_id` en gaming_players | — | Hecho en schema |

**Bloqueadores Fase 0 en producción:**
1. **CORS en 3 edge functions** (`discord-verify`, `passport-profile`, `chess`) — agregar `https://www.tirly.xyz` y `https://tirly.xyz` a `ALLOWED_ORIGINS`
2. **Verificar migraciones remotas** — `20260826040000`, `20260826050000`, `20260826060000` (username/bio, passport sync, discord_member)
3. **Desplegar edge functions actualizadas** — `supabase functions deploy discord-verify passport-profile chess`
4. **Configurar bot Discord** — variables `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `WELCOME_CHANNEL_ID` en Supabase
5. **Validar OAuth redirect** — `redirectTo: ${window.location.origin}/tierly` apunta a `tirly.xyz`

### 4.2 Fase 1 — Primer ciclo completo jugar juntos (P0)

| Flujo | Roadmap | Código local | Producción | Gap |
|-------|---------|--------------|------------|-----|
| Crear eventos (juego, horario, capacidad, reglas) | ✅ `[x]` | Admin panel (ops/tierly + tierly/admin) | ❌ Admin no carga | Requiere `isAdmin=true` → `discord-verify` OK |
| Borrador/publicado/cancelado/cerrado + UTC/zonas | ✅ `[x]` | `gaming_events` + `timezone` | — | Schema listo |
| Inscripción, salida, check-in explícitos | ✅ `[x]` | `tierly_register_event` RPC + UI | ❌ | Requiere auth |
| Consentimientos separados (evento/comunidad/observación/publicación) | ✅ `[x]` | `observed_members.consent_status` + UI settings | ❌ | Requiere auth |
| Confirmación organizador + XP/stamp idempotente | ✅ `[x]` | `gaming_matches` status confirmed → trigger recalcula | ❌ | Requiere admin confirmar |
| **Corrección/revocación auditada confirmación errónea** | ✅ `[x]` | `tierly_revoke_event_confirmation` RPC (migración 20261001030000) | ❌ Migración no aplicada en prod | **Crítico para piloto** |
| **Reversión auditada XP/stamp (ledger append-only)** | ✅ `[x]` | Migración 20261001030000 | ❌ Migración no aplicada en prod | **Crítico para piloto** |
| Separar XP evento/global de reputación local | ❌ `[ ]` | No implementado | — | Roadmap: "asistencia no certifica confianza" |
| Historial offchain solo alcance autorizado | ❌ `[ ]` | Agregación cross-server bloqueada | — | OK por ahora |
| Recordatorios canales autorizados | ✅ `[x]` | `tierly_event_reminders` (migración 20260930130042) | ❌ Bot no verificado | Requiere bot corriendo |
| Cierre repetido, cancelación, retirada consentimiento, expulsión guild | ✅ `[x]` | RPCs + triggers | ❌ | Requiere auth/bot |
| Exclusión y borrado verificables | ✅ `[x]` | `tierly_request_member_deletion` + UI | ❌ | Requiere auth |

**Criterios de salida Fase 1 (roadmap §70-78) — TODOS PENDIENTES EN VIVO:**
- [ ] Dos eventos consecutivos completan ciclo y permiten convocar siguiente
- [ ] Reintentar/cerrar no duplica XP/stamps; corrección/reversión dejan trazabilidad
- [ ] Retirar consentimiento detiene uso y permite borrado
- [ ] Reconexión y datos faltantes se muestran sin inventar duración
- [ ] Admin no lee/modifica actividad privada de otra guild
- [ ] Nombres iguales no mezclan identidades; horarios/cancelaciones funcionan
- [ ] Ningún premio valioso depende solo de presencia

### 4.3 Fase 2 — Piloto, repetición y utilidad (P1)
**Dependencia:** Fase 1 funcional en vivo. **No iniciada.**

### 4.4 Fase 3 — Intereses y recomendaciones (P1, condicional)
**Dependencia:** Piloto recurrente + usos aprobados. **No iniciada.**

### 4.5 Fase 4 — Descubrimiento comunidades y eventos (P2)

| Ítem | Roadmap | Código local | Producción |
|------|---------|--------------|------------|
| Vista pública comunidades/juegos/jugadores con opt-in | ✅ Implementado local (`discover.js` + migración 20261001010000) | ✅ Completo | ❌ Vacío (CORS + vistas públicas vacías sin comunidades `public_directory=true`) |
| Densidad mínima por juego/horario/idioma | ❌ `[ ]` | No | — |
| Publicar eventos/comunidades autorizados por organizador | ❌ `[ ]` | `tierly_set_public_directory` RPC existe | — |
| Compartir perfil/stamps opt-in + alcance aprobado | ❌ `[ ]` | Parcial: `identity_visible` en `observed_members` | — |
| Filtros juego/zona/idioma/nivel/cupos | ❌ `[ ]` | No | — |
| Moderación, reporte, retirada | ❌ `[ ]` | No | — |

**Nota roadmap (§127):** "Adelanto técnico implementado localmente. No equivale a validar la dependencia: faltan despliegue comprobado, oferta real, moderación y evidencia de inscripción/asistencia originada por descubrimiento."

### 4.6 Fase 5 — Credenciales y smart accounts (P3)
**Fuera de alcance actual.** Roadmap: "Si alcanza perfil/stamp offchain, postergar wallet/cadena."

---

## 5. DEUDA TÉCNICA Y BUGS CONOCIDOS (auditoría 2026-08-27 + hallazgos actuales)

### 5.1 Bugs críticos en producción
1. **CORS en 3 edge functions** — `tirly.xyz` no en `ALLOWED_ORIGINS` (ver §2.1)
2. **Edge functions sin desplegar** — `passport-profile`, `discord-verify` (cambios locales no deployed)
3. **Migraciones 20260826* sin confirmar en remoto** — `add_username_bio_to_players`, `sync_passport_profile_snapshot`, `add_discord_member_to_leaderboard_view`

### 5.2 Deuda técnica (app.js)
1. **Duplicación `pointsForPlacement()` y `GAMING_TIERS`** — `app.js` importa de `points.mjs`/`ranks.mjs` pero también copia la lógica a mano (líneas 11-12 import + duplicación implícita). `index.html` carga `app.js` como module pero `points.mjs`/`ranks.mjs` no se cargan como `<script type=module>` → riesgo de divergencia silenciosa.
2. **Identidad frágil en leaderboard público** — `leaderboard_public_view` expone `player_id` (UUID) pero `display_name` no es único. El código usa `display_name` para matching (línea 590 `openPlayerProfile` busca por `username`). **Falta `username` en la vista pública** (migración 20260826040000 lo agrega pero no confirmada en prod).
3. **`PROFILE_BANNERS` hardcodeado (50+ items)** — línea 1702-1724 en `app.js`. Cambiar banners requiere deploy. Debería venir de Supabase Storage.
4. **Sin loading skeletons** — vistas muestran `t("empty")` mientras cargan (línea 496, 512, 709, 777, etc.)
5. **Errores silenciosos** — queries fallan a `[]` sin feedback al usuario (línea 584, 753, etc.)

### 5.3 Gaps funcionales vs apps comparables (auditoría §3-4)

| Feature | Tierly código | Duolingo | Discord bots (MEE6) | Guild.xyz/Galxe | Estado |
|---------|--------------|----------|---------------------|-----------------|--------|
| Ranking por puntos | ✅ | ✅ | ✅ | ✅ | OK |
| Tiers con divisiones | ✅ (Bronce→Diamante, 3 div) | ✅ (ligas semanales) | ✅ (niveles) | ✅ (roles/badges) | OK |
| Historial partidas | ✅ Solo último evento | ✅ Completo | ➖ | ➖ | **Parcial** |
| Rachas / streaks | ⚠️ Stub (`renderProfileStreak` best-effort) | ✅ Core | ➖ | ➖ | **Bloqueado por datos** |
| Logros / badges | ❌ | ✅ | ✅ | ✅ | **Falta** |
| Notificaciones (nuevo evento, subida rango) | ❌ | ✅ push/email | ✅ canal | ✅ webhook | **Falta** |
| Editar perfil real (bio, avatar) | ✅ UI + RPC `update_profile` | ✅ | ➖ | ✅ | **Solo local, prod roto** |
| Temporadas / reset ranking | ✅ Código `currentSeasonEnd()` (6 meses) | ✅ Semanal | ➖ | ✅ | **Solo local, no verificado vivo** |
| Comparar amigos / filtro guild | ❌ | ✅ | ➖ | ➖ | **Falta** |
| Perfil público `/u/:username` | ✅ Hash route `#u/:username` | ➖ | ➖ | ✅ | OK local |
| Búsqueda cualquier jugador | ✅ Implementada | ➖ | ➖ | ➖ | OK local |
| Multi-idioma | ✅ en/es | ✅ | ❌ | ✅ | OK |
| Panel admin eventos/premios | ✅ ops/tierly + tierly/admin | N/A | ✅ | ✅ | **Solo local** |

**Gaps de mayor impacto (auditoría §44):**
1. **Notificaciones cambio estado** — alto impacto retención, bajo esfuerzo (existe `discord-bot/`, agregar webhook)
2. **Historial completo partidas en perfil** — hoy solo "último evento", sin paginación/filtro
3. **Temporadas** — sin reset, ranking estático, top 5 no cambia
4. **Editar perfil real** — mockup lo pedía, falta dato/endpoint (parcial: RPC existe, UI existe, prod roto)
5. **Player ID estable** — deuda que bloquea notificaciones, historial correcto, streak

---

## 6. PLAN DE ACCIÓN PRIORITARIO (alineado a roadmap §157-162)

### Prioridad 1 — Desbloquear producción (P0, esta semana)
| # | Acción | Archivos | Responsable |
|---|--------|----------|-------------|
| 1 | Agregar `https://www.tirly.xyz`, `https://tirly.xyz` a `ALLOWED_ORIGINS` en `discord-verify`, `passport-profile`, `chess` | `supabase/functions/*/index.ts` | DevOps |
| 2 | Desplegar edge functions actualizadas | `supabase functions deploy discord-verify passport-profile chess` | DevOps |
| 3 | Verificar/aplicar migraciones pendientes en prod (20260826*, 20261001030000 revocación) | Supabase Dashboard → Migrations | DevOps |
| 4 | Configurar secrets Supabase: `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `STELLAR_PASSPORT_API_KEY`, `WELCOME_CHANNEL_ID` | Supabase Dashboard → Edge Functions → Secrets | DevOps |
| 5 | Validar OAuth redirect en Supabase Auth → URL Configuration: `https://www.tirly.xyz/tierly` | Supabase Dashboard | DevOps |
| 6 | Verificar bot Discord corriendo (systemd/healthcheck) | `discord-bot/` + hosting | DevOps |

### Prioridad 2 — Validar ciclo completo Fase 1 (P0, post-desbloqueo)
| # | Acción | Criterio roadmap |
|---|--------|------------------|
| 7 | Probar login Discord → perfil sincronizado → `isAdmin` true | §70: login, ranking/perfil, vinculación, admin autorizado |
| 8 | Crear evento comunidad → inscribirse → check-in → confirmar organizador → XP/stamp | §52-58: ciclo completo |
| 9 | Probar revocación confirmación errónea → reversión XP/stamp → trazabilidad ledger | §73: corrección/reversión auditadas |
| 10 | Probar retirada consentimiento → borrado datos → exclusión | §74 |
| 11 | Probar aislamiento multi-guild (admin guild A no ve guild B) | §76 |
| 12 | Verificar temporadas: `currentSeasonEnd()` muestra fecha correcta, reset 6 meses | §1907-1919 `app.js` |

### Prioridad 3 — Cerrar gaps funcionales altos (P1, post-piloto)
| # | Feature | Esfuerzo | Dependencia |
|---|---------|----------|-------------|
| 13 | Notificaciones Discord (nuevo evento, subida rango, resultado) | Bajo | Bot desplegado + webhook |
| 14 | Historial completo partidas (paginación, filtro fecha/juego) | Medio | Fase 1 validada |
| 15 | Temporadas: activar reset automático + UI "Season resets on {date}" | Bajo | `currentSeasonEnd()` ya existe |
| 16 | Editar perfil persistente (bio, avatar, socials) — ya en código, verificar vivo | Bajo | Prioridad 1 |
| 17 | Player ID estable en vistas públicas (`username` en `leaderboard_public_view`) | Bajo | Migración 20260826040000 |

### Prioridad 4 — Descubrimiento Fase 4 (P2, condicional)
| # | Acción | Nota |
|---|--------|------|
| 18 | Habilitar `public_directory` en 3+ comunidades piloto | Requiere `tierly_set_public_directory` RPC + admin UI |
| 19 | Validar densidad mínima (juegos/horario/idioma) antes de abrir catálogo | Roadmap §129 |
| 20 | Medir inscripción/asistencia originada por descubrimiento | Roadmap §135 |

---

## 7. ARCHIVOS CLAVE A MODIFICAR

### 7.1 Edge Functions (CORS) — **CRÍTICO**
- `supabase/functions/discord-verify/index.ts` línea 4: `ALLOWED_ORIGINS`
- `supabase/functions/passport-profile/index.ts` línea 7: `ALLOWED_ORIGINS`
- `supabase/functions/chess/index.ts` línea 5: `ALLOWED_ORIGINS`

**Cambio:**
```typescript
const ALLOWED_ORIGINS = [
  "https://telluscoop.org", 
  "https://www.telluscoop.org",
  "https://tirly.xyz", 
  "https://www.tirly.xyz"
];
```

### 7.2 Migraciones pendientes de verificar en prod
- `20260826040000_add_username_bio_to_players.sql`
- `20260826050000_sync_passport_profile_snapshot.sql`
- `20260826060000_add_discord_member_to_leaderboard_view.sql`
- `20261001030000_tierly_audited_revocation.sql` (revocación/reversión auditada)

### 7.3 Mejoras código local (post-producción)
- `tierly/app.js`: Eliminar duplicación `pointsForPlacement`/`GAMING_TIERS` → cargar `points.mjs`/`ranks.mjs` como modules en `index.html`
- `tierly/app.js`: `PROFILE_BANNERS` → mover a Supabase Storage + admin UI
- `tierly/app.js`: Agregar loading skeletons en `renderRankingRows`, `renderCommunityEvents`, `renderProfileStats`, etc.
- `tierly/app.js`: Manejo de error visible (toast) cuando queries fallan

---

## 8. CHECKLIST DE VALIDACIÓN EN VIVO (pre-piloto)

Antes de iniciar piloto (Fase 2), confirmar en `https://www.tirly.xyz/`:

- [ ] **Login Discord** → redirige a `/tierly` → sesión iniciada
- [ ] **Leaderboard** → muestra top 50 con puntos, avatares, tiers
- [ ] **Búsqueda jugadores** → funciona por nombre + Passport builders
- [ ] **Perfil** → stats, tier, racha (stub), historial (vacío si no hay eventos)
- [ ] **Editar perfil** → guarda display_name, bio, socials, banner picker + crop
- [ ] **Passport link/unlink** → sincroniza nombre/bio/avatar de Passport
- [ ] **Ajustes** → idioma EN/ES, tema light/dark, privacidad presence opt-in/borrado
- [ ] **Eventos** → catálogo visible, inscripción, check-in, cierre organizador
- [ ] **Recompensas** → lista vacía inicial, se puebla al confirmar partidas
- [ ] **Ajedrez** → lobby, bot 3 niveles, PvP challenge/accept, rating Elo, coach
- [ ] **Descubrimiento** → comunidades públicas, top juegos, top players, invite bot
- [ ] **Admin** → panel accesible solo a admins guild, CRUD eventos/torneos/brackets/rewards
- [ ] **Revocar confirmación** → `tierly_revoke_event_confirmation` inserta fila compensatoria
- [ ] **Reversión XP** → ledger append-only, trazabilidad completa
- [ ] **Temporadas** → `lb-season-note` muestra "Season resets on {date}" correcta (6 meses)
- [ ] **Bot Discord** → healthcheck OK, welcome message en canal configurado
- [ ] **Rollback** → dominio devuelto a Tellus conserva datos/orígenes (sin reset Supabase)

---

## 9. CONCLUSIONES

1. **El código local está muy adelantado respecto al roadmap** — implementa Fase 0, 1 y adelanta Fase 4 (descubrimiento). La calidad es alta: RLS, RPCs auditados, consentimiento explícito, multi-idioma, temas, ajedrez con anti-cheat server-side.

2. **La brecha es 100% operativa/despliegue** — CORS, secrets, migraciones remotas, bot, dominio. No hay gaps de arquitectura ni diseño en el código.

3. **Riesgo alto:** Sin corregir CORS + desplegar edge functions + verificar migraciones, **el piloto no puede iniciar**. El roadmap §160-162 lo deja claro: "Bloqueos: dominio final, accesos Vercel/Auth/CORS y bot operativo. Mantener Tellus/rollback hasta validación en vivo."

4. **Próximos 5 pasos ejecutables (roadmap §157-162) son exactamente los de Prioridad 1 arriba.**

5. **Una vez en vivo**, el esfuerzo se mueve a **validar Fase 1 con 3 comunidades piloto** (roadmap §163) y medir recurrencia antes de invertir en Fase 3-4.

---

## 10. ANEXO: ESTRUCTURA DE DATOS CLAVE (para debug)

### Vistas públicas (anon access)
- `leaderboard_public_view` — `player_id, display_name, avatar_url, total_points` (+ `username`, `discord_member` si migración 20260826060000 aplicada)
- `event_bracket_public_view` — evento/torneo/partida/jugador/placement
- `gaming_rewards_public_view` — rewards fulfilled + player display_name/avatar
- `tierly_community_events_public_view` — eventos `scheduled`/`live` + registration_count
- `tierly_public_communities_view` — comunidades `public_directory=true` + consenting_member_count + games_tracked
- `tierly_public_top_games_view` — top juegos 30d (minutos, sesiones, comunidades)
- `tierly_public_top_players_view` — top players por comunidad (consent + identity_visible)

### Tablas base (RLS, solo authenticated/org members)
- `gaming_players` — `discord_id` único, `username`, `display_name`, `avatar_url`, `bio`, `banner`, `banner_fit`, `stellar_passport_*`, `discord_member`, `discord_verified_at`
- `gaming_events` — `guild_id`, `name`, `event_date`, `starts_at`, `ends_at`, `timezone`, `location`, `luma_url`, `banner_url`, `description`, `status`
- `gaming_tournaments` — `event_id`, `game`, `format`, `status`
- `gaming_matches` — `tournament_id`, `round`, `status` (pending/live/confirmed)
- `gaming_match_participants` — `match_id`, `player_id`, `placement`, `points_awarded`
- `gaming_scores` — `player_id`, `total_points` (trigger `recalculate_gaming_score`)
- `gaming_rewards` — `player_id`, `tournament_id`, `description`, `fulfilled`, `fulfilled_at`
- `observed_members` — `guild_id`, `discord_user_id`, `consent_status`, `identity_visible`, `deletion_requested_at`
- `communities` — `guild_id`, `name`, `icon_url`, `locale`, `timezone`, `presence_enabled`, `public_directory`
- `community_admins` — `guild_id`, `user_id`, `discord_user_id`, `role`

### RPCs clave
- `tierly_register_event(p_event_id)` — inscripción evento comunitario
- `tierly_revoke_event_confirmation(...)` — revocación auditada (migración 20261001030000)
- `tierly_set_public_directory(target_guild, listed)` — toggle descubrimiento
- `tierly_accept_member_consent / decline / request_deletion` — privacidad
- `recalculate_gaming_score()` — trigger auto en `gaming_matches` confirmed

---

*Fin del análisis. Documento generado tras inspección Playwright de https://www.tirly.xyz/, lectura completa del código local (`tierly/`, `supabase/functions/`, `ops/tierly/`), roadmap `TIERLY_ROADMAP.md` y auditoría histórica `docs/archive/2026-08-27-tierly-roadmap-audit.md`.*