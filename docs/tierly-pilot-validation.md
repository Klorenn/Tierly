# Validación del piloto Tierly

**Estado:** procedimiento pendiente de ejecución. Ningún resultado o permiso de producción queda acreditado por este documento.  
**Contrato operativo:** [tierly-pilot-contract.md](./tierly-pilot-contract.md) (kickoff 2026-10-02).

**Objetivo:** comprobar el ciclo de evento de [Fase 1](../TIERLY_ROADMAP.md#fase-1--primer-ciclo-completo-de-jugar-juntos-p0) y medir repetición en tres comunidades, con dos eventos consecutivos por comunidad. La persona responsable acuerda las reglas y la muestra antes de comenzar. Las hipótesis de Fase 2 no son resultados.

## Puertas de entrada

- [ ] Responsable del piloto, administrador de cada guild y canal de incidentes identificados. Cada comunidad acepta por escrito finalidad, datos mínimos, retención, borrado y quién verá la evidencia. Elegir participantes voluntarios; no copiar listas completas de miembros.
- [ ] Estado de permisos de Discord documentado para cada uso. Si presence, estadísticas derivadas o portabilidad no tienen autorización suficiente, mantener esas funciones apagadas y validar solo inscripción, check-in explícito y confirmación del organizador. Una solicitud enviada no cuenta como aprobación.
- [x] Inventario de migraciones realmente aplicadas (2026-10-02): críticas en prod; sin local-only pendiente. No ejecutar `db reset`. RPC `tierly_pilot_report` confirmada en schema.
- [x] Host `tirly.xyz` + bot operativos (2026-10-02): web sin Chess (`e025520`); bot con slash `event`; crons activos. Pendiente: validación humana de login/admin y `/tierly set` canales en Tellus. Conservar Auth/CORS Tellus.
- [x] Corrección/reversión auditada verificada en vivo (2026-10-02, ensayo Tellus `455e39a4…`): `tierly_confirm_event_attendance` → ledger +10 XP / +1 stamp; `tierly_revoke_event_confirmation` con motivo → fila compensatoria −10/−1 (net 0). Evento de ensayo marcado `cancelled` (no es Evento 1 del piloto).
- [ ] Para cada evento del piloto, publicar reglas visibles de inscripción, check-in, confirmación, XP/stamp, zona horaria y cancelación. Explicar que el stamp acredita la fuente de evidencia, no habilidad, victoria ni duración exacta.

Si alguna puerta falla, registrar bloqueo y responsable; no iniciar la medición de esa comunidad. **El piloto formal 3×2 sigue bloqueado** por aceptación escrita, ciclo humano del Evento 1 y 3ª comunidad; la revocación auditada ya no es el bloqueo. Una prueba exploratoria con voluntarios puede registrar hallazgos, pero no cuenta como aprobación de esos criterios ni justifica manipulación manual de producción.

## Línea base y registro

Antes del primer evento, registrar para cada comunidad y un período comparable: cantidad de eventos, inscripciones, asistencia confirmada, personas que regresaron al siguiente evento y minutos de administración por evento con el método anterior. Registrar fuente, período, denominadores, ausencias y método de cronometraje. Si no existe dato anterior confiable, marcar **sin línea base** y medir el primer ciclo prospectivamente; no fabricar una comparación.

El [reporte técnico agregado](../README.md#reporte-técnico-del-piloto) se puede capturar antes del piloto y después de cada evento **solo si la RPC ya está disponible**. Ejecutar el script existente `scripts/tierly-pilot-report.sql` con una conexión autenticada como `service_role` manejada por el operador autorizado. Guardar `generated_at`, `scope`, health del bot, sesiones por motivo de cierre, juegos activos, rollups, sugerencias, eventos, inscripciones/check-ins/confirmaciones y XP/stamps. Proteger el resultado junto con el registro del piloto. La RPC devuelve `global_aggregate`: sus totales incluyen otras comunidades y toda la historia disponible; no atribuir sus diferencias a una guild, evento o persona. `unique_players_sum` suma rollups y **no** es un conteo de personas únicas del piloto. Nunca exponer `service_role` en el navegador, ticket o captura.

Usar un registro de evaluación **separado por comunidad**, con acceso limitado al equipo del piloto, para datos que la RPC no puede dar: fecha/instante y zona del evento, estado, organizador, número de inscritos, check-ins, confirmados, asistentes que vuelven, minutos de trabajo e incidentes de confirmación. Usar códigos de participante solo cuando sean imprescindibles para comparar retorno entre los dos eventos de la **misma** guild; guardar la correspondencia bajo control del organizador, no en el reporte compartido. No unir identidades entre guilds. Registrar quién obtuvo cada dato y cuándo se eliminará.

| Comunidad | Evento 1 | Evento 2 | Método y período de línea base | Responsable | Estado/decisión |
|---|---|---|---|---|---|
| Piloto A — Tellus Cooperative (`871845192058146906`) | `7ea035dc…` 11 oct 20:00 Santiago | pendiente | pendiente | pendiente | exploratorio; sync 301 |
| Piloto B — ChileDAO (`1323417632371900568`) | `778ffc6c…` 11 oct 20:00 Santiago | pendiente | pendiente | pendiente | exploratorio; sync 172 |
| Piloto C | pendiente | pendiente | pendiente | pendiente | invitar bot |

## Dos eventos consecutivos por comunidad

1. Antes del evento 1, verificar guild, organizador autorizado, reglas y zona IANA; registrar hora local e instante UTC. Invitar voluntarios con los permisos acordados. Registrar inscripciones y salidas, sin tratar presence como asistencia.
2. Durante el evento, registrar check-ins explícitos y huecos de datos. Al cerrar, el organizador revisa la evidencia antes de confirmar asistencia. Capturar totales, tiempo administrativo y XP/stamp otorgados con emisor/fuente disponible. No asignar premio valioso basándose solo en presence. Si confirma por error, detener ese flujo y abrir incidente; no alterar filas de producción manualmente.
3. Repetir el cierre o reintentar la misma confirmación de forma controlada con el organizador. Comparar ledger y vista del participante antes/después: no debe haber XP/stamps duplicados. Registrar discrepancias. No intentar una corrección/reversión como prueba de aceptación hasta que exista una operación de producto auditada y verificada.
4. El organizador convoca por iniciativa propia el evento 2 en la misma guild. Repetir el ciclo, registrar confirmados que también estuvieron confirmados en el evento 1, denominador y abandonos. No contar un segundo evento cancelado como ciclo completado.
5. En ventanas acordadas con el operador, verificar retirada de consentimiento/borrado, acceso de un admin de otra guild, homónimos con IDs distintos, zona horaria/cambio estacional, cancelación, desconexión/reconexión del bot y datos faltantes. Usar cuentas y eventos de prueba autorizados cuando una comprobación pueda afectar a participantes. Registrar comportamiento observado y restauración de la operación normal.

## Aceptación y decisión

Marcar cada criterio como **pasa / falla / no probado**, con fecha, entorno, versión, responsable y enlace a evidencia privada:

- Dos eventos consecutivos completan crear → inscribir → check-in → confirmar → reconocer → volver a convocar, sin asistencia de Tierly.
- Reintento/cierre repetido no duplica XP/stamps. **Corrección y reversión:** verificada en vivo 2026-10-02 (ensayo Tellus; motivo + emisor + ledger compensatorio net 0). No suplir con SQL manual en producción.
- Retirar consentimiento o excluirse detiene el uso correspondiente; solicitud de borrado sigue el procedimiento y plazo acordados. La publicación nominal exige opt-in separado.
- Bot desconectado/reconectado o datos incompletos se muestran como cobertura faltante; no se inventa duración ni asistencia. Health vuelve al umbral documentado.
- Admin de guild A no puede leer ni modificar actividad privada de B. Dos homónimos no se fusionan; no aparece historial personal cruzado.
- Zona elegida, UTC, cambio estacional y cancelación son coherentes en UI, avisos y reconocimiento. Una cancelación no genera asistencia confirmada/reward indebido.
- Participantes entienden qué acredita el stamp y ningún premio valioso depende solo de presence.

Para Fase 2, calcular desde el registro manual por comunidad y guardar solo numeradores y denominadores en el resumen compartido: organizadores que convocan el segundo evento por iniciativa propia / 3 (hipótesis 2/3); confirmados del evento 1 que también quedan confirmados en el evento 2 comparable / confirmados del evento 1 elegibles (hipótesis 30%); y reducción de la mediana de minutos administrativos por evento frente a una línea base comparable (hipótesis 25%). Explicar exclusiones, cancelaciones y abandonos; si falta muestra o base, informar **no evaluable**. No publicar códigos ni correspondencias de participantes. Entrevistar a organizadores y participantes sobre fricción y utilidad; no convertir estas hipótesis en resultados observados por anticipado. Decidir continuar, corregir o detener por comunidad y documentar por qué.

## Detención, rollback y escalación

Detener nuevas convocatorias y avisar al responsable y al administrador afectado ante fuga entre guilds, uso sin consentimiento, premio duplicado o confirmado por error, identidad mezclada, dato personal expuesto, bot sin health/reconexión estable o falla de Auth/CORS que impida operar. Preservar evidencia mínima bajo acceso restringido; no difundir IDs o secretos en tickets. Investigar causa y repetir el criterio antes de reanudar. No editar asistencia o ledger manualmente en producción como sustituto de corrección auditada.

Para incidente de bot, seguir el [procedimiento de parada/reinicio y rollback del bot](../discord-bot/README.md#verificación-de-cron-y-rollback); coordinar la ventana para no perder recordatorios. Para fallo del nuevo host, conservar o devolver tráfico a Tellus según el [rollback del frontend](../README.md#verification-and-rollback), preservando Auth/CORS anteriores. No resetear datos compartidos ni revertir SQL a ciegas. Una confirmación/reward erróneo permanece como incidente abierto hasta disponer de una corrección de producto autorizada, auditada y verificada. Registrar impacto, responsable, hora de recuperación y decisión de reanudar.
