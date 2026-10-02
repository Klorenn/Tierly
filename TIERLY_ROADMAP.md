# Tierly — roadmap de producto

Propuesta al 2 de octubre de 2026. Define decisiones y entregables; no promete fechas ni describe funciones futuras como implementadas.

**Mirá qué juega tu comunidad. Dale motivos para jugar juntos.**

Tierly es la capa de identidad e incentivos gaming para comunidades de Discord. Ayuda a servidores a entender qué juegan sus miembros, lanzar eventos alrededor de esa actividad y recompensar participación con XP, stamps y logros que siguen a los jugadores entre comunidades.

La visión: **tu vida gaming en Discord, en un solo perfil**.

---

## Punto de partida

- Extracción standalone publicada (`c1e4044`); frontend, administración legacy, bot e integraciones conservados.
- Supabase de producción compartido (`rhzanxzoqmbxptvxgnfj`) y datos existentes retenidos: no hubo migración ni reset de base de datos.
- Servidor local y configuración del repo preparados; despliegue Vercel y corte de Auth/CORS/dominio pendientes de verificación en vivo.
- Tellus mantiene el frontend actual hasta validar el nuevo host y su rollback.
- La suite Node incluye assertions estáticas/de código y simulaciones; no prueba por sí sola OAuth, permisos, bot o participación reales.
- La [auditoría histórica del 27 de agosto](docs/archive/2026-08-27-tierly-roadmap-audit.md) conserva hallazgos de esa fecha. Su vigencia requiere auditoría; no se asumen bugs pendientes actuales.

**Estado de implementación al 2 de octubre de 2026:**
- ✅ Fase 0 (base operable) y Fase 1 (ciclo completo eventos) implementadas en repo y cubiertas por tests locales
- ✅ Descubrimiento público con opt-in por comunidad (adelanto Fase 4)
- ✅ Bot Discord operativo con slash commands (`/tierly set|config|sync|event|profile|leaderboard|live|help`)
- ✅ Vista Live/En vivo (who's playing now) con Supabase Realtime
- ✅ Chess/ajedrez retirado de la superficie de producto (módulo y edge function fuera del árbol activo)
- ⚠️ Drift histórico: migraciones chess/racer (`2026082912*`–`150000`) siguen en el historial remoto pero los archivos locales fueron retirados — no hacer `db reset` ni re-push a ciegas
- ⚠️ Bot desplegado en VM GCP: requiere redeploy para slash `event` + gate admin corregido; validación en vivo pendiente
- ⚠️ Smart contracts, credenciales portables y Tierly.com (Fase 3+) fuera de alcance actual

---

## Orden de ejecución

**Permisos de datos → ciclo de evento → repetición → identidad persistente → descubrimiento → credenciales verificables.**

El opt-in del jugador y la autorización del administrador no sustituyen la autorización de Discord. Un dashboard aislado tampoco demuestra el valor de jugar juntos.

---

## V0 — Inteligencia Discord (Fase 0) — *COMPLETADO EN CÓDIGO*

**Objetivo:** Probar que comunidades encuentran útil la inteligencia gaming.

| Item | Estado |
|------|--------|
| Bot observa actividad permitida (presence/voice) | ✅ Implementado |
| Dashboard admin: juegos activos, jugadores únicos, tendencias | ✅ Implementado |
| Eventos sugeridos basados en overlap de juegos | ✅ Implementado |
| Consentimiento explícito (presence, identity, deletion) | ✅ Implementado |
| Privacidad: aggregate community intel vs personal progression opt-in | ✅ Implementado |
| CORS/Auth origins para `tirly.xyz` | ✅ Desplegado |
| Bot persistente (systemd, healthcheck) | ✅ Desplegado en VM |

**Bloqueadores operacionales (requieren dashboards):**
- [ ] Aplicar migraciones pendientes en prod (`20260826*`, `20261001030000`)
- [ ] Configurar secrets Edge Functions (DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, STELLAR_PASSPORT_API_KEY, WELCOME_CHANNEL_ID, SUPABASE_SERVICE_ROLE_KEY)
- [ ] Configurar Auth redirect URLs en Supabase (`https://www.tirly.xyz/tierly`)
- [ ] Validar bot en vivo: slash commands, presence, welcome/announce channels
- [ ] Verificar cron jobs pg_cron (`tierly-rollup-diario`, `tierly-cerrar-sesiones-viejas`, `tierly-sugerencias`, `tierly-generar-recordatorios`)

---

## V1 — Eventos Comunitarios (Fase 1) — *CÓDIGO LISTO, PENDIENTE VALIDACIÓN EN VIVO*

**Objetivo:** Organizador capaz de repetir un evento sin asistencia de Tierly.

**Flujo:** crear evento → inscripción voluntaria → check-in (presencia/check-in explícito) → cierre + confirmación organizador → XP/stamp → convocar siguiente.

| Feature | Estado |
|---------|--------|
| CRUD eventos (juego, horario/zona, capacidad, reglas, Luma, banner) | ✅ |
| Estados: borrador/publicado/cancelado/cerrado + UTC + timezone | ✅ |
| Inscripción, salida, check-in explícitos; perfil privado por defecto | ✅ |
| Consentimientos separados (evento/comunidad/observación/publicación) | ✅ |
| Confirmación organizador + XP/stamp idempotente | ✅ |
| Revocación auditada + reversión XP/stamp (ledger append-only) | ✅ Código listo, migración pendiente prod |
| Recordatorios automáticos (bot) | ✅ Código listo |
| Exclusión/borrado verificables | ✅ Código listo |
| Aislamiento multi-guild (admin guild A no ve guild B) | ✅ Código listo |

**Criterios de salida (requieren piloto real):**
- [ ] 2 eventos consecutivos completan ciclo y permiten convocar siguiente
- [ ] Revocación/reversión no duplica XP/stamps; trazabilidad completa
- [ ] Retirar consentimiento detiene uso y permite borrado
- [ ] Reconexión muestra datos faltantes sin inventar duración
- [ ] Admin guild A no lee/modifica actividad privada guild B
- [ ] Nombres iguales no mezclan identidades (stable `discord_id` + `player_id`)

---

## V2 — Identidad Tierly Persistente (Fase 2) — *DISEÑO LISTO, PARCIALMENTE IMPLEMENTADO*

**Objetivo:** Participación persiste fuera de un servidor individual. Perfil pertenece al jugador, no al servidor.

| Feature | Estado |
|---------|--------|
| Perfil Tierly (XP, Levels, Stamps, Streaks, Game Levels) | ✅ UI + RPCs |
| Stamps verificables (evento, emisor, evidencia, expiración, revocación) | ✅ Código + RPC `tierly_revoke_event_confirmation` |
| Game Levels (XP por juego individual) | ✅ UI parcial |
| Community Reputation (contribución por servidor) | 🔄 Diseñado, pendiente |
| Social Achievements (Party Starter, Community Hopper, Ride or Die, Early Adopter) | 🔄 Diseñado, pendiente |
| Smart account wallet (embedded, invisible al usuario) | ⏳ Fase 3 |
| Cross-server profile aggregation (opt-in) | ⏳ Requiere aprobación Discord |

**Gap crítico:** Separar XP global de reputación local. Asistencia no certifica confianza/habilidad en otra comunidad. Historial offchain solo dentro de alcance autorizado.

---

## V3 — Tierly Network / Discovery (Fase 3) — *ADELANTO TÉCNICO IMPLEMENTADO*

**Objetivo:** Tierly.com como capa de descubrimiento. Jugadores encuentran eventos/comunidades relevantes ahora.

| Feature | Estado |
|---------|--------|
| Vistas públicas `tierly_public_*` (comunidades, top juegos, top players) | ✅ Implementado + deployed |
| Opt-in por comunidad (`public_directory`) + consentimiento nominal | ✅ Implementado |
| Filtros: juego, zona, idioma, nivel, cupos | ✅ UI en `discover.js` |
| Invite bot CTA con Application ID | ✅ Implementado |
| Moderación, reporte, retirada | ⏳ Pendiente |
| Personalización: "Juegas Minecraft → 8 comunidades tienen eventos este finde" | ⏳ Pendiente |
| "14 personas con las que jugaste se unieron a este evento" | ⏳ Pendiente |

**Dependencia:** Suficientes eventos reales, recurrencia, permisos de publicación.

---

## V4 — Credenciales Verificables / Gaming Reputation Protocol (Fase 4+) — *FUERA DE ALCANCE ACTUAL*

**Objetivo:** Resolver problemas que el perfil convencional no resuelve. Blockchain como capa de integridad, no producto.

| Feature | Estado |
|---------|--------|
| Stamps firmados offchain (emisor, evidencia, alcance, expiración, revocación) | 🔄 Diseñado |
| Smart accounts (recuperación, costos, compatibilidad borrado/revocación) | ⏳ |
| Game-account integrations (Steam, Xbox, PlayStation, APIs oficiales) | ⏳ |
| Publisher/Developer API (eventos oficiales, acquisition campaigns) | ⏳ |
| Community-created achievements | ⏳ |
| Third-party Tierly integrations | ⏳ |

**Principio:** Mantener identidad/telemetría personal fuera de cadena. La cadena prueba emisor/integridad, no verdad de partida.

---

## Matriz de reconocimiento (fuente → qué permite afirmar)

| Nivel | Permite afirmar | No demuestra |
|-------|----------------|--------------|
| Autodeclaración | El participante declaró interés | Que jugó o ganó |
| Presencia Discord | Discord reportó actividad en ventana | Partida compartida, duración exacta, kills/victoria |
| Check-in explícito | Participante confirmó asistencia | Resultado competitivo ni asistencia íntegra |
| Validación organizador | Emisor confirmó participación | Verdad independiente del emisor |
| API oficial juego (futura) | Hechos autorizados por esa API | Hechos fuera de su alcance |

Cada registro identifica: fuente, emisor, evento, instante. Ledger append-only. Presencia simultánea ≠ "jugaron juntos".

---

## Modelo de privacidad (dos niveles)

| Nivel | Qué ve el server owner | Qué ve Tierly |
|-------|------------------------|---------------|
| **Inteligencia comunitaria anónima** (pre-join) | "34 miembros jugaron Fortnite esta semana" | Agregados, sin PII |
| **Progresión personal explícita** (post-join) | Activity del usuario en eventos del server | Perfil completo opt-in, activity durante eventos |

**Regla:** Community analytics = agregado. Personal progression = opt-in.

---

## Modelo de negocio (alineado a visión)

| Tier | Target | Incluye |
|------|--------|---------|
| **Tierly Free** | Comunidades pequeñas/medianas | Bot, analytics básicos, eventos básicos, leaderboard básico |
| **Tierly Pro** ($20–100+/mes según tamaño) | Comunidades serias | Analytics avanzados, recomendaciones automáticas, reglas XP custom, stamps custom, campañas programadas, retention analytics, branding custom, leaderboards avanzados, export/API |
| **Tierly for Games** | Studios/Publishers | Eventos oficiales, player acquisition, community analytics, game launches, sponsored quests, cross-community campaigns, verified achievements |

---

## Próximas 5 prioridades ejecutables (orden estricto)

1. **Expediente Discord y mapa de datos.** Producto + técnico. Bloqueo: confirmación externa para presence, perfil cruzado, analytics; usos apagados mientras tanto.
2. **Aplicar migraciones y validar host.** Técnico. Bloqueos: migraciones pendientes prod, dominio final, Vercel/Auth/CORS, bot operativo. Mantener Tellus/rollback hasta validación en vivo.
3. **Contrato de piloto con 3 comunidades.** Producto. Entregable: reglas, evidencia, privacidad, línea base; bloqueo: alcance mínimo datos validado.
4. **Cerrar y validar ciclo punta a punta en vivo.** Técnico + producto. Verificar inscripción, check-in, confirmación, XP/stamp, revocación, reconfirmación, privacidad, aislamiento, idempotencia.
5. **Ejecutar y evaluar piloto (3 comunidades, 2 eventos c/u).** Producto. Seguir [runbook](docs/tierly-pilot-validation.md). Medir retorno y trabajo admin antes de ampliar descubrimiento, analytics o credenciales.

---

## Disciplina de entrega

- Entrega por comportamiento verificable con aceptación y rollback; sin cambios de stack por reflejo.
- TDD para lógica nueva y validación funcional de permisos, OAuth, bot y flujos. Assertions estáticas complementan esas pruebas.
- Preservar datos/integraciones; futuras migraciones requieren dependencias revisadas, estrategia reversible y entorno aislado.
- Registrar responsable, bloqueo y evidencia por fase. Fechas solo con capacidad y aprobaciones acordadas.

---

## Referencias técnicas clave

| Archivo | Qué contiene |
|---------|--------------|
| `tierly/app.js` | App principal: leaderboard, eventos, perfil, live, discover, admin |
| `tierly/discover.js` | Descubrimiento público: comunidades, top juegos, top players |
| `discord-bot/index.js` | Bot Gateway: presence, eventos (`/tierly event *`), slash commands, sync |
| `supabase/functions/discord-verify/` | OAuth Discord, perfil, Passport, admin claims |
| `supabase/functions/passport-profile/` | Stellar Passport builders search + profile |
| `supabase/migrations/` | Schema, vistas públicas, RPCs auditados |
| `docs/tierly-pilot-validation.md` | Runbook de validación de piloto |

(End of file)