# Contrato de piloto Tierly — kickoff

**Fecha:** 2 de octubre de 2026  
**Commit bot multi-guild:** `8b50811`  
**Runbook:** [tierly-pilot-validation.md](./tierly-pilot-validation.md)

Este documento es el **acuerdo operativo** del piloto. No acredita resultados.

---

## 1. Estado de puertas (ops)

| Puerta | Estado | Evidencia |
|--------|--------|-----------|
| Migraciones críticas en prod | ✅ | `migration list` 2026-10-02 |
| RPCs registro / revocación / pilot report | ✅ | schema |
| Crons `tierly-*` | ✅ | activos |
| Bot multi-guild + `/tierly event` | ✅ | Tellus + ChileDAO |
| Host `tirly.xyz` sin Chess | ✅ | `app.js?v=20261002-06` |
| Sync miembros | ✅ | Tellus 301 · ChileDAO 172 (2026-10-02) |
| Evento 1 Tellus | ✅ | `7ea035dc-3371-4fa9-ae58-45f402d4af48` — 11 oct 20:00 Santiago |
| Evento 1 ChileDAO | ✅ | `778ffc6c-0438-44db-a605-d3afe02861a9` — 11 oct 20:00 Santiago |
| Pedido de aceptación (✅ react) | ✅ posteado | Tellus `#anuncios-tierly` · ChileDAO `#general` |
| Canales ChileDAO dedicados | ⚠️ | Bot sin Manage Channels; usa `#comienza-aquí` / `#general` hasta `/tierly set` |
| Rotación token bot | ⚠️ Pendiente operador | Discord Developer Portal → reset token → `.env` VM → restart |
| Ciclo E2E humano (join → check-in → confirm → revoke) | ⬜ | día del evento / ensayo previo |
| Piloto C (3ª comunidad) | ⬜ | invitar bot + set + sync |
| Aceptación ✅ de admins | ⬜ | esperar reacciones |

---

## 2. Alcance mínimo

**Por comunidad:** 2 eventos consecutivos  
**Ciclo:** crear → inscribir → check-in explícito → confirmar → XP/stamp → convocar siguiente  

Presence ≠ asistencia. Stamp ≠ skill. Revocación = Admin web (`tierly_revoke_event_confirmation`).

---

## 3. Comunidades

| Slot | Comunidad | Guild ID | Evento 1 id | Canales | Sync | Aceptación | Estado |
|------|-----------|----------|-------------|---------|------|------------|--------|
| A | Tellus Cooperative | `871845192058146906` | `7ea035dc-3371-4fa9-ae58-45f402d4af48` | bienvenida/anuncios-tierly | 301 | ⬜ react | exploratorio |
| B | ChileDAO | `1323417632371900568` | `778ffc6c-0438-44db-a605-d3afe02861a9` | comienza-aquí / general (temp) | 172 | ⬜ react | exploratorio |
| C | _pendiente_ | | | | | ⬜ | invitar bot |

**Responsable del piloto (Tierly):** _completar_  
**Canal de incidentes:** _completar_

---

## 4. Texto de aceptación

Posteado en Discord (reacción ✅). Texto canónico:

> Acepto participar en el piloto Tierly (máx. 2 eventos). Finalidad: ciclo inscripción → check-in → confirmación → XP/stamp. Datos solo de voluntarios inscritos. Presence ≠ asistencia. Stamp no certifica skill. Puedo pedir detener el piloto.

---

## 5. Comandos útiles

**Tellus**
```
/tierly event join event_id:7ea035dc-3371-4fa9-ae58-45f402d4af48
/tierly event list
```

**ChileDAO**
```
/tierly event join event_id:778ffc6c-0438-44db-a605-d3afe02861a9
/tierly set welcome-channel:#… announce-channel:#…
/tierly event list
```

Confirmación / check-in / revocación: Admin en https://www.tirly.xyz/

---

## 6. Registro por comunidad (privado)

| Campo | Evento 1 | Evento 2 |
|-------|----------|----------|
| id evento | ver §3 | |
| Inscritos / check-ins / confirmados | | |
| Minutos admin | | |
| Incidentes | | |
| Confirmados E1 ∩ E2 | — | |
| Decisión | | continue / fix / stop |

---

## 7. Checklist inmediato (humano)

- [ ] Admin Tellus reacciona ✅ al contrato  
- [ ] Admin ChileDAO reacciona ✅ al contrato  
- [ ] ChileDAO: dar Manage Channels al bot **o** `/tierly set` a canales definitivos  
- [ ] Rotar token bot + actualizar VM  
- [ ] Ensayo o día 11 oct: voluntarios join → check-in → confirm Admin → probar revocación  
- [ ] Convocar Evento 2 por comunidad  
- [ ] Elegir / invitar Piloto C  

---

## 8. Criterio formal 3×2

El exploratorio Tellus+ChileDAO **no** cierra Fase 1 solo. Falta 3ª comunidad + 2 eventos c/u + revocación verificada en vivo.
