# Tierly — estado al 2026-10-01

## Dónde está V0

V0 (Discord intelligence) está **cerrado en código**. Tasks 1-9 del plan
`docs/superpowers/plans/2026-09-28-tierly-v0-discord-intelligence.md` están completas.
Task 10 es verificación en vivo y depende de que las migraciones estén aplicadas y el
bot corriendo — es lo único que queda.

La suite local cubre código y contratos estáticos; su conteo cambia con cada entrega y no sustituye la verificación en vivo.

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

Requiere responsables con acceso al entorno. Antes de cualquier cambio de base, inventariar el estado remoto y revisar dependencias y plan reversible según [README](README.md#database-and-secrets). Este checklist observa comportamiento; **no autoriza aplicar SQL**:

- [ ] Confirmar permisos/alcance de Discord, Auth/CORS, estado de migraciones ya aplicadas y RLS sin ejecutar `db push` ni `db reset`.
- [ ] Verificar secretos del bot en su entorno protegido y los intents requeridos en el portal según [README del bot](discord-bot/README.md#antes-de-desplegar-developer-portal).
- [ ] Confirmar con el operador que `communities` contiene la guild piloto y que su administrador tiene el alcance correcto.
- [ ] Con uso de presence permitido, arrancar el bot, abrir un juego en Discord y confirmar que se abre una fila en `play_sessions`.
- [ ] Cerrar el juego y confirmar que la sesión se cierra con `ended_at`
- [ ] Esperar al job diario (o dispararlo a mano) y confirmar filas en `daily_game_rollups`
- [ ] Confirmar que aparecen sugerencias de evento cuando se cruza el umbral de la comunidad
- [ ] Abrir el panel admin y verificar las 5 tabs con datos reales
- [ ] Verificar RLS: un usuario sin rol de admin no debe leer agregados privados ni datos de otra guild.

Para la validación completa de eventos y métricas de tres comunidades, seguir [el runbook del piloto](docs/tierly-pilot-validation.md).

## Bloqueos conocidos

- Una observación anterior registró **HTTP 401** en `discord-verify`; causa y estado actuales requieren verificación en el entorno. Revisar credenciales del servidor, configuración y respuesta antes de atribuirlo al token o cambiar código.

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

**Implementado localmente**: `DISCORD_APP_ID` en `tierly/app.js` ya contiene el
Application ID configurado (`0faa73c`). Falta verificar el CTA y la invitación en el host final.

## Estado remoto (reconciliado el 2026-10-01, commit `c3ceb56`)

El proyecto **sí** está linkeado a `rhzanxzoqmbxptvxgnfj` y el drift entre repo y base
quedó resuelto. Lo que se encontró y cómo quedó:

- Las 19 migraciones de Tierly **ya estaban aplicadas a mano** el 2026-09-30, bajo
  timestamps distintos a los del repo. No eran 19 cosas pendientes: eran 19 cosas
  aplicadas que el repo no reconocía. Se renumeraron 17 archivos locales a los
  timestamps remotos.
- Hay 36 migraciones remotas de otra app (Stellar ops / social, 20260716–20260922) que
  el repo nunca tuvo. Quedan como placeholders `select 1;` porque la primera hace
  `drop schema public cascade` y `delete from auth.users`: reproducirlas haría que un
  `db reset` destruya la base. El SQL verbatim vive en `docs/db/remote-ledger/`, que es
  el **único** registro de lo ejecutado a mano.
- El repo no era la fuente de verdad. `20260930125321_tierly_member_privacy_authenticated.sql`
  tenía tres funciones plpgsql sin el `begin` (no compilaban); la versión remota estaba
  bien. Corregido en el repo, la base no necesita cambio.
- Única divergencia persistente: `tierly_event_series`. La remota se creó con
  `name not null` y `active`, y con una función de 5 argumentos. El
  `create table if not exists` del repo era no-op, así que la forma remota sobrevivió.
  La reconcilia `20261001020000_tierly_reconcile_event_series.sql`.

Verificado: 101 archivos locales vs 99 filas remotas, cero versiones remote-only, cero
duplicados, suite 273/273, y `supabase db push --linked --dry-run` ya no falla con
`LegacyDbPushMissingLocalError`.

**Pendiente**: el push real. Aplicaría exactamente tres migraciones —
`20260930230000_tierly_pilot_report.sql`, `20261001010000_tierly_public_discovery.sql`
y `20261001020000_tierly_reconcile_event_series.sql`. La última corre DDL destructivo
(`drop column name`, `drop column active`, `drop function` de la sobrecarga vieja), así
que exige confirmación explícita y chequear antes si `tierly_event_series` tiene filas
con datos en esas columnas.

Para SQL de lectura contra la base no hay password: ver `docs/db/remote-ledger/` y el
flujo de Management API (`POST /v1/projects/{ref}/database/query`).
