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

Fase 1 se construyó **sin spec de diseño**: ninguna de las specs existentes cubre
eventos/asistencia/XP. El código está testeado, pero no hay documento que explique por qué
se tomó cada decisión. Escribirlo requiere a quien tomó esas decisiones; reconstruir el
porqué leyendo el código produciría una racionalización, no un registro.

El descubrimiento público sí quedó documentado en
`docs/superpowers/specs/2026-10-01-tierly-public-discovery-design.md`.

## Qué sigue para V1

V1 no tiene spec ni plan — solo es un nombre en el roadmap. Antes de implementar hay que
diseñarlo. Lo que el plan de V0 anotaba como alcance de V1:

- Crear eventos reales a partir de las sugerencias (hoy la sugerencia se acepta y se crea
  un evento, pero el flujo no está especificado end-to-end)
- Consentimiento para listas nominales de jugadores

## Descubrimiento público — construido el 2026-10-01

"Teams mode" fue **eliminado**, no parkeado: estaba fuera del roadmap y el dueño del
producto lo descartó. En su lugar se construyó el descubrimiento público:

| Pieza | Dónde |
|---|---|
| Opt-in por comunidad + RPC autorizada | `supabase/migrations/20261001010000_tierly_public_discovery.sql` |
| Tres vistas públicas | misma migración |
| Página `#discover` | `tierly/discover.js`, `tierly/index.html` |
| Toggle del directorio | `tierly/admin.js` |
| Diseño y límites de política | `docs/superpowers/specs/2026-10-01-tierly-public-discovery-design.md` |

Adelanta la superficie de Fase 4 sin adelantar permisos: nada aparece sin opt-in del
administrador, el ranking de jugadores no agrega entre guilds y el nominal exige
`identity_visible`. Commits `a033501`, `5f3e87d`, `0406127`.

**Bloqueado**: el CTA "Añadir Tierly a tu servidor" no se renderiza porque
`DISCORD_APP_ID` en `tierly/app.js` sigue siendo el placeholder de ceros. Falta el
Application ID real del portal de Discord — un solo valor.

**Sin aplicar**: las 28 migraciones del repo no están aplicadas en el proyecto hosted
(`rhzanxzoqmbxptvxgnfj`, "Tellus | Tirly"). El proyecto no está linkeado y no hay registro
de qué tiene la base remota. Antes de `supabase db push`, correr `supabase link` y revisar
`supabase migration list --linked`.
