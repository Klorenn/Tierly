# Tierly — estado al 2026-10-01

## Dónde está V0

V0 (Discord intelligence) está **cerrado en código**. Tasks 1-9 del plan
`docs/superpowers/plans/2026-09-28-tierly-v0-discord-intelligence.md` están completas.
Task 10 es verificación en vivo y depende de que las migraciones estén aplicadas y el
bot corriendo — es lo único que queda.

Suite: **256/256 pasan** (`npm test`). Cero TODO/FIXME/stub en `discord-bot/`, `tierly/`, `ops/`.

### Qué hay construido

| Capa | Archivos |
|---|---|
| Schema V0 | `supabase/migrations/20260929090000_tierly_v0_schema.sql` |
| Retiro de brackets | `20260929091000_tierly_drop_bracket_layer.sql` |
| Jobs (rollup, purga, sugerencias) | `20260929092000_tierly_v0_jobs.sql` |
| Normalización de juegos | `discord-bot/game-normalize.mjs` |
| Deltas de presence | `discord-bot/presence-delta.mjs` |
| Store de sesiones | `discord-bot/session-store.mjs` |
| Wiring del bot | `discord-bot/index.js` — `GuildPresences` (:43), `presenceUpdate` (:389), heartbeat (:382) |
| Panel de inteligencia | `tierly/admin.js` — tabs events/games/players/trends/suggestions |

Fase 1 también está construida (consentimiento y borrado, eventos y series, asistencia
con XP, recordatorios, claim de comunidad, healthcheck, reporte piloto, UI de privacidad)
en las migraciones `20260930*`, con un test por feature en `tests/tierly-*.test.mjs`.

## Verificación end-to-end pendiente (Task 10)

Requiere acceso que el agente no tiene. Checklist para correr a mano:

- [ ] Aplicar migraciones: `supabase db push --project-ref rhzanxzoqmbxptvxgnfj`
- [ ] Crear `discord-bot/.env` desde `.env.example` y poner `DISCORD_BOT_TOKEN`
- [ ] Activar **PRESENCE INTENT** en el portal de desarrolladores de Discord (ver `discord-bot/README.md:47`)
- [ ] Sembrar la comunidad y confirmar que `communities` tiene la fila del guild
- [ ] Arrancar el bot; abrir un juego en Discord y confirmar que se abre una fila en `game_sessions`
- [ ] Cerrar el juego y confirmar que la sesión se cierra con `ended_at`
- [ ] Esperar al job diario (o dispararlo a mano) y confirmar filas en `daily_game_rollups`
- [ ] Confirmar que aparecen sugerencias de evento cuando se cruza el umbral de la comunidad
- [ ] Abrir el panel admin y verificar las 5 tabs con datos reales
- [ ] Verificar RLS: un usuario sin rol de admin no debe leer los agregados

## Bloqueos conocidos

- `discord-verify` devuelve **HTTP 401**. Es el token, no el código. Se resuelve al poblar `DISCORD_BOT_TOKEN`.

## Deuda de documentación

Fase 1 y "teams mode" se construyeron **sin spec de diseño**. En `docs/superpowers/specs/`
solo existen tres specs, y ninguna cubre eventos/asistencia/XP ni equipos. El código está
testeado, pero no hay documento que explique por qué se tomó cada decisión.

## Qué sigue para V1

V1 no tiene spec ni plan — solo es un nombre en el roadmap. Antes de implementar hay que
diseñarlo. Lo que el plan de V0 anotaba como alcance de V1:

- Crear eventos reales a partir de las sugerencias (hoy la sugerencia se acepta y se crea
  un evento, pero el flujo no está especificado end-to-end)
- Consentimiento para listas nominales de jugadores

## Trabajo parkeado, sin commitear

"Teams mode" (equipos de jugadores) vive sin commitear en la rama `fix/admin-render-table`:

- `supabase/migrations/20261001000000_tierly_teams_mode.sql`
- `tests/tierly-teams.test.mjs`
- `tierly/teams.js`
- cambios en `tierly/app.js` y `tierly/index.html`

Se construyó por un malentendido de alcance. Está completo y testeado, pero fuera del
roadmap de V0. Decidir si se commitea, se descarta o se difiere.
