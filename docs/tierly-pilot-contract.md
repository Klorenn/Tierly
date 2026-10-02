# Contrato de piloto Tierly — kickoff

**Fecha:** 2 de octubre de 2026  
**Commit de referencia web/bot:** `e025520`  
**Runbook:** [tierly-pilot-validation.md](./tierly-pilot-validation.md)

Este documento es el **acuerdo operativo** del piloto. No acredita resultados. Completar los huecos de cada comunidad antes del Evento 1.

---

## 1. Estado de puertas (ops)

| Puerta | Estado | Evidencia |
|--------|--------|-----------|
| Migraciones críticas en prod (incl. revocación, canales bot, discovery) | ✅ Aplicadas | `supabase migration list` 2026-10-02; local-only = ninguna |
| RPC `tierly_pilot_report` / `tierly_register_event` / `tierly_revoke_event_confirmation` | ✅ En schema | `pg_proc` 2026-10-02 |
| Crons `tierly-*` | ✅ Activos | `cron.job` 2026-10-02 |
| Bot online + slash `event` registrados | ✅ | VM `tierly-bot`; guild commands incluyen `event:create|list|join` |
| Host `tirly.xyz` sin Chess | ✅ | `app.js?v=20261002-06` |
| Canales welcome/announce en Tellus | ✅ Configurados | `bienvenida-tierly` + `anuncios-tierly` (2026-10-02) |
| Rotación token bot (post-leak local) | ⚠️ Pendiente operador | Regenerar en Discord Developer Portal + `.env` VM |
| Evento 1 exploratorio creado | ✅ | id `7ea035dc-3371-4fa9-ae58-45f402d4af48` — 2026-10-11 20:00 America/Santiago |
| Login Discord / admin / ciclo evento E2E con humanos | ⬜ Pendiente | Inscripción + check-in + confirmación el día del evento |
| Revocación auditada verificada en vivo | ⬜ Pendiente | Criterio de salida Fase 1 |
| 3 comunidades con aceptación escrita | ⬜ Solo Tellus hoy | Camino: exploratorio Tellus → luego B/C |

---

## 2. Alcance mínimo del piloto

**Por comunidad:** 2 eventos consecutivos  
**Ciclo a probar:** crear → inscribir → check-in explícito → confirmar organizador → XP/stamp → convocar siguiente  

**Qué NO cuenta como asistencia:** Discord presence sola.  
**Qué acredita el stamp:** el organizador confirmó participación con la fuente registrada (check-in / evidencia del emisor), no habilidad ni victoria.

**Presence / analytics:** si el guild no tiene intents/autorización clara, `presence_enabled = false` y se valida solo inscripción + check-in + confirmación.

**Corrección de error:** Admin web → revocación vía `tierly_revoke_event_confirmation`. No SQL manual en prod.

---

## 3. Comunidades

Hoy en `public.communities` hay **una** fila:

| Slot | Comunidad | Guild ID | TZ | Presence | Directory | Admin / organizador | Aceptación escrita | Estado |
|------|-----------|----------|----|----------|-----------|---------------------|--------------------|--------|
| A | Tellus Cooperative | `871845192058146906` | America/Santiago | on | on | _completar_ | ⬜ | exploratorio activo |
| B | _pendiente_ | | | | | | ⬜ | sin bot / sin fila |
| C | _pendiente_ | | | | | | ⬜ | sin bot / sin fila |

**Para sumar B y C:** invitar el bot (`invite` CTA en Discover), `/tierly set welcome-channel` + `announce-channel`, `/tierly sync`, aceptar el texto de §4.

**Responsable del piloto (Tierly):** _completar_  
**Canal de incidentes:** _completar_ (Discord privado del equipo piloto)

---

## 4. Texto de aceptación (copiar al admin de cada guild)

> Acepto participar en el piloto Tierly (máx. 2 eventos comunitarios).  
> **Finalidad:** medir si el ciclo inscripción → check-in → confirmación → XP/stamp es usable sin ayuda del equipo Tierly.  
> **Datos mínimos:** identidad Discord de voluntarios que se inscriban; registros de inscripción/check-in/confirmación; agregados de presencia solo si `presence` está habilitada y el miembro consiente.  
> **No** se copiará la lista completa de miembros del server.  
> **Retención / borrado:** según settings de la comunidad y RPCs de privacidad (`presencia` / solicitud de borrado).  
> **Quién ve evidencia:** admin del guild + equipo piloto Tierly (acceso restringido). No se publican IDs de participantes en reportes compartidos.  
> El stamp **no** certifica skill ni resultado de partida.  
> Puedo pedir detener el piloto en mi guild abriendo incidente en el canal acordado.

Admin: _________________ Fecha: _________ Guild: _________

---

## 5. Reglas visibles por evento (publicar en el anuncio)

Plantilla:

1. **Inscripción:** `/tierly event join <id>` o web Eventos; salida antes del check-in permitida.  
2. **Check-in:** explícito en el evento (web/admin o flujo acordado); presence ≠ asistencia.  
3. **Confirmación:** solo el organizador/admin; puede revocarse con motivo.  
4. **XP/stamp:** al confirmar; reintento no debe duplicar.  
5. **Zona:** IANA del evento (ej. `America/Santiago`) + instante UTC.  
6. **Cancelación:** no genera confirmación ni reward.  
7. **Premios valiosos:** no dependen solo de presence.

---

## 6. Registro por comunidad (privado)

Duplicar una hoja por guild. No pegar aquí PII.

| Campo | Evento 1 | Evento 2 |
|-------|----------|----------|
| Nombre / id evento | | |
| starts_at local + UTC | | |
| Organizador | | |
| Inscritos | | |
| Check-ins | | |
| Confirmados | | |
| Minutos admin | | |
| Incidentes (dup XP, revocación, etc.) | | |
| Confirmados E1 ∩ E2 | — | |
| Decisión | | continue / fix / stop |

Línea base previa (si existe): eventos/mes, asistencias, minutos admin — o **sin línea base**.

Snapshot técnico (opcional, operador): `scripts/tierly-pilot-report.sql` con `service_role` — guardar fuera del repo.

---

## 7. Checklist pre-Evento 1 (Tellus)

- [x] Canales welcome/announce configurados en DB  
- [x] Evento 1 exploratorio creado (`7ea035dc-3371-4fa9-ae58-45f402d4af48`, sáb 11 oct 20:00 Santiago)  
- [x] Bot con `/tierly event` alineado al schema (`guild_id`) y redeployed  
- [ ] Responsable piloto + canal incidentes nombrados  
- [ ] Aceptación §4 firmada por admin Tellus  
- [ ] `/tierly sync` (o `!bienvenida` en voluntarios)  
- [ ] Token bot rotado + `.env` VM actualizado + restart  
- [ ] Anunciar en `#anuncios-tierly` / `#events` con reglas §5 + id del evento  
- [ ] Voluntarios invitados (no roster completo)  
- [ ] Plan de revocación de prueba con 1 confirmación falsa controlada (cuenta de prueba)

### Comandos útiles (Discord Tellus)

```
/tierly event list
/tierly event join event_id:7ea035dc-3371-4fa9-ae58-45f402d4af48
/tierly sync
```

Confirmación / check-in / revocación: panel Admin en `https://www.tirly.xyz/` (vista Administración).

---

## 8. Criterio para abrir B y C

No medir B/C hasta que:

1. El bot esté en ese guild y exista fila en `communities`  
2. Aceptación §4 guardada  
3. Al menos un ciclo exploratorio en Tellus haya corrido inscripción → confirmación sin incidente bloqueante  

Exploratorio en Tellus **no** cierra Fase 1 solo; el piloto formal sigue siendo 3×2.
