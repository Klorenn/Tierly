# Tierly — roadmap de producto

Propuesta al 28 de septiembre de 2026. Define decisiones y entregables; no promete fechas ni describe funciones futuras como implementadas.

**Mirá qué juega tu comunidad. Dale motivos para jugar juntos.**

Tierly ayuda a organizadores de Discord a convocar eventos de gaming, reconocer participación y volver a reunir a sus jugadores. La visión incluye XP y stamps persistentes entre comunidades, condicionados a permisos de plataforma y privacidad. Descubrimiento, credenciales y smart accounts vienen después de demostrar el ciclo básico.

## Punto de partida

- Extracción standalone publicada (`c1e4044`); frontend, administración legacy, bot e integraciones conservados.
- Supabase de producción compartido y datos existentes retenidos: no hubo migración ni reset de base de datos.
- Servidor local y configuración del repo preparados; despliegue Vercel y corte de Auth/CORS/dominio pendientes de verificación en vivo.
- Tellus mantiene el frontend actual hasta validar el nuevo host y su rollback.
- Los 122 tests existentes incluyen assertions estáticas/de código; no prueban por sí solos OAuth, permisos, bot o participación reales.
- La [auditoría histórica del 27 de agosto](docs/archive/2026-08-27-tierly-roadmap-audit.md) conserva hallazgos de esa fecha. Su vigencia requiere auditoría; no se asumen bugs pendientes actuales.

Este roadmap prioriza el producto comunitario. No expande ajedrez/racer ni elimina Passport u otras integraciones sin justificación y transición revisada.

## Orden de ejecución

**Permisos de datos → ciclo de evento → repetición → inteligencia útil → descubrimiento → credenciales opcionales.**

El opt-in del jugador y la autorización del administrador no sustituyen la autorización de Discord. Un dashboard aislado tampoco demuestra el valor de jugar juntos.

## Fase 0 — viabilidad y base operable (P0)

**Dependencia:** ninguna. **Entregable:** alcance permitido documentado y una entrega reversible.

Discord prohíbe perfilar identidades/relaciones con datos de API y comercializar esos datos; exige usarlos para la funcionalidad necesaria declarada/aprobada. No asumimos autorizado el grafo personal persistente entre servidores ni analytics comerciales. Agregar datos no elimina esas restricciones. [Developer Policy](https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy).

Presence Update requiere `GUILD_PRESENCES`. El anuncio del 10 de junio de 2026 exige revisión al alcanzar 10.000 usuarios totales y renovación anual del acceso privilegiado. Verificar el estado concreto de la app en el portal. [Gateway](https://docs.discord.com/developers/events/gateway-events#presence-update), [requisitos de acceso](https://discord.com/blog/updated-requirements-to-how-apps-access-data-in-servers).

- [ ] Mapear cada dato: origen, finalidad, campos, visibilidad, retención, borrado y responsable.
- [ ] Pedir confirmación/revisión documentada a Discord para presencia, estadísticas comunitarias, perfil persistente cruzado y oferta comercial. Registrar respuesta y restricciones; solicitud enviada no equivale a aprobación.
- [ ] Validar alternativa con juegos autodeclarados, check-in explícito y confirmación del organizador, sin observación oculta ni perfilado prohibido. Revisar también su tratamiento de identidad/datos.
- [ ] Mantener presencia y portabilidad apagadas sin autorización suficiente; avanzar solo con el alcance mínimo validado.
- [ ] Entrevistar organizadores y jugadores sobre convocatoria, abandono y reconocimiento; registrar cómo resuelven hoy un problema concreto.
- [ ] Auditar el modelo actual de leaderboard/comunidad antes de diseñar migración multi-community. Inventariar datos y dependencias compartidas; no asumir que ya existe aislamiento por guild.
- [ ] Auditar `discord_id` asociado a ID interno estable, nunca emparejar por display name; verificar roles y autorización por guild en servidor.
- [ ] Preparar host con redirects Auth, CORS exacto, URLs canónicas y enlaces del bot coherentes, preservando orígenes Tellus durante coexistencia.
- [ ] Definir operación Gateway del bot como proceso persistente: reinicio, reconexión, secretos, monitoreo y responsable. La web estática no lo reemplaza.

**Salida:** matriz de usos permitidos/bloqueados, alternativa revisada, comunidades interesadas y flujos verificados en nuevo host: login, ranking/perfil, vinculación, administración autorizada e integraciones críticas existentes. Rollback: devolver dominio al despliegue Tellus conservando datos/orígenes; no resetear Supabase.

## Fase 1 — primer ciclo completo de jugar juntos (P0)

**Dependencia:** Fase 0 y tratamiento mínimo de datos validado. **Entregable:** organizador capaz de repetir un evento sin asistencia de Tierly.

**Flujo:** crear evento → inscripción voluntaria/perfil mínimo → check-in (presencia solo si está permitida) → cierre y confirmación → XP/stamp acotado → convocar otro evento.

- [ ] Crear eventos por comunidad: juego, horario/zona, capacidad, instrucciones, organizador y reglas visibles antes de inscribirse.
- [ ] Manejar borrador, publicado, cancelado y cerrado; almacenar instante UTC y mostrar zona elegida, incluyendo cambios estacionales.
- [ ] Permitir inscripción, salida y check-in explícitos; perfil privado por defecto, publicación con opt-in separado.
- [ ] Separar consentimientos de evento/comunidad, observación opcional, notificaciones y publicación. Un permiso local no habilita uso entre servidores.
- [ ] Confirmación/corrección del organizador con motivo y auditoría; mostrar emisor y evidencia de cada reconocimiento.
- [ ] XP de participación y stamp de evento con reglas simples, límites por evento/período, idempotencia y reversión de errores.
- [ ] Separar XP de evento/global permitido de reputación local: asistencia no certifica confianza, habilidad ni estatus en otra comunidad.
- [ ] Historial offchain solo dentro del alcance autorizado. Agregación personal entre servidores bloqueada hasta aprobación.
- [ ] Recordatorios en canales autorizados; mensajes personales únicamente consentidos y necesarios.
- [ ] Resolver cierre repetido, cancelación, retirada de consentimiento, expulsión de guild y desconexión del bot.
- [ ] Exclusión y borrado verificables; quitar la app detiene recolección y aplica retención definida.
- [ ] Si la auditoría exige cambiar el modelo, migrar a guild scope con pruebas de aislamiento, revisión de datos compartidos y rollback antes de habilitar más comunidades.

**Criterios de salida:**

- [ ] Dos eventos consecutivos completan el ciclo y permiten convocar el siguiente.
- [ ] Reintentar/cerrar dos veces no duplica XP/stamps; corrección deja trazabilidad.
- [ ] Retirar consentimiento/excluirse detiene el uso correspondiente y permite el borrado definido.
- [ ] Reconexión y datos faltantes se muestran sin inventar duración/actividad.
- [ ] Un administrador no puede leer ni modificar actividad privada de otra guild.
- [ ] Nombres iguales no mezclan identidades; horarios y cancelaciones funcionan.
- [ ] Ningún premio valioso depende solo de presencia; jugadores entienden qué certifica el stamp.

## Evidencia del reconocimiento

| Nivel | Permite afirmar | No demuestra |
|---|---|---|
| Autodeclaración | El participante declaró interés | Que jugó o ganó |
| Presencia permitida | Discord reportó actividad en una ventana | Partida compartida, duración exacta, kills o victoria |
| Check-in | El participante confirmó asistencia | Resultado competitivo ni asistencia íntegra |
| Validación del organizador | Un emisor confirmó participación | Verdad independiente del emisor |
| API oficial de juego, futura | Hechos autorizados/documentados por esa API | Hechos fuera de su alcance |

Cada registro guarda fuente, emisor, evento, momento y corrección/revocación. Invisible, desconexión y huecos son datos faltantes. Presencia simultánea nunca se etiqueta como “jugaron juntos”.

## Fase 2 — piloto, repetición y utilidad (P1)

**Dependencia:** ciclo completo funcional. **Entregable:** evidencia de recurrencia y ahorro de trabajo.

- [ ] Medir línea base previa: eventos, inscritos, asistencia confirmada, retorno y minutos de administración con el método anterior.
- [ ] Pilotear con 3 comunidades y al menos 2 eventos por comunidad, ajustando tamaño a capacidad. Es hipótesis de diseño, no tracción medida.
- [ ] Añadir duplicación, plantillas, historial y recordatorios según problemas observados.
- [ ] Revisar multicuenta, check-in sin asistencia, inflación de puntos, apelaciones y límites de rewards.
- [ ] Probar portabilidad XP/stamps solo si se aprobó; si sigue bloqueada, mantener reconocimiento local sin inferencias cruzadas.
- [ ] Hacer entrevistas de pago y propuestas concretas de piloto pago de herramientas de organización; revisar monetización aplicable. No vender datos de Discord.

**Hipótesis de salida a acordar antes de medir:** 2 de 3 organizadores convocan segundo evento por iniciativa propia; 30% de asistentes confirmados vuelve al siguiente evento comparable; reducción del 25% del tiempo administrativo mediano. Registrar muestra, denominadores y abandono. No son resultados actuales.

Métrica principal: **organizadores que repiten eventos con participantes que vuelven**. Complementos: participación conjunta validada por check-in/organizador, tiempo ahorrado y voluntad de pago mediante aceptación/pago. Registros, horas detectadas y mensajes son auxiliares.

**Decisión:** sin repetición, corregir convocatoria/experiencia antes de inteligencia. Con retorno sin pago, revisar comprador/oferta; no asumir un precio de USD 20–100.

## Fase 3 — intereses y recomendaciones útiles (P1, condicional)

**Dependencia:** piloto recurrente y usos aprobados. **Entregable:** decisiones mejores para organizar eventos.

- [ ] Empezar con preferencias autodeclaradas y participación en el alcance permitido.
- [ ] Solo si se autoriza, sumar conteos de actividad necesarios; declarar cobertura, retraso y exclusiones.
- [ ] Definir umbrales de agregación, ventanas y supresión de grupos pequeños; revisar reidentificación. Sin drill-down personal prohibido.
- [ ] Sugerir juego/horario explicando evidencia; el organizador decide.
- [ ] Comparar asistencia validada, retorno y trabajo ahorrado contra base comparable.

**Salida:** sugerencias utilizadas y mejora observable. Analytics sin efecto en eventos no habilita expansión. No hace falta elegir IA/proveedor para probar la hipótesis.

## Fase 4 — descubrimiento de comunidades y eventos (P2)

**Dependencia:** suficientes eventos reales, recurrencia y permisos de publicación/intercambio. **Entregable:** encontrar eventos relevantes con cupos.

- [ ] Definir densidad mínima por juego/horario/idioma; no abrir catálogos vacíos.
- [ ] Publicar eventos/comunidades autorizados por organizador; respetar membresía y servidores privados.
- [ ] Compartir perfil/stamps mediante opt-in y alcance aprobado; no inferir membresías/relaciones cruzadas.
- [ ] Filtrar por juego, zona, idioma, nivel declarado y cupos; empezar sin grafo personal.
- [ ] Moderación, reporte y retirada; medir inscripción y asistencia posteriores al descubrimiento.

**Salida:** descubrimiento produce participación confirmada/retorno sin exponer comunidades privadas. Si falta oferta, captar organizadores y repetir eventos.

## Fase 5 — credenciales y smart accounts opcionales (P3)

**Dependencia:** demanda de verificación externa y permisos compatibles. **Entregable:** resolver un problema que el perfil convencional no resuelva.

- [ ] Identificar receptor, caso de uso y beneficio antes de elegir cadena, wallet o librería.
- [ ] Probar stamps firmados offchain con emisor, evidencia, alcance, expiración, corrección y revocación.
- [ ] Explicar: firma prueba emisor/integridad, no verdad de partida o resultado.
- [ ] Evaluar recuperación, costos, soporte y compatibilidad con borrado/revocación antes de smart accounts.
- [ ] Mantener identidad/telemetría personal fuera de cadena; hashes vinculables no sustituyen privacidad.
- [ ] Evaluar APIs de juegos una por una: permisos independientes, cobertura, límites y viabilidad. Nunca inferir kills/victorias desde Discord.

**Salida:** receptor/usuario demuestran necesidad, costo aceptable y comprensión de evidencia. Si alcanza perfil/stamp offchain, postergar wallet/cadena.

## Disciplina de entrega

- Entrega por comportamiento verificable con aceptación y rollback; sin cambios de stack por reflejo.
- TDD para lógica nueva y validación funcional de permisos, OAuth, bot y flujos. Assertions estáticas complementan esas pruebas.
- Preservar datos/integraciones; futuras migraciones requieren dependencias revisadas, estrategia reversible y entorno aislado.
- Registrar responsable, bloqueo y evidencia por fase. Fechas solo con capacidad y aprobaciones acordadas.

## Próximas cinco prioridades ejecutables

1. **Expediente Discord y mapa de datos.** Producto + técnico. Bloqueo: confirmación externa para presencia, perfil cruzado y analytics; usos apagados mientras tanto.
2. **Auditar baseline y verificar nuevo host.** Técnico. Bloqueos: dominio final, accesos Vercel/Auth/CORS y bot operativo. Mantener Tellus/rollback hasta validación en vivo.
3. **Contrato del primer evento con pilotos.** Producto. Entregable: reglas, evidencia, privacidad y línea base; bloqueo: alcance mínimo de datos validado.
4. **Especificar y entregar primera porción del ciclo completo.** Implementación. Check-in/confirmación y reconocimiento acotado; bloqueos: aceptación, identidad estable y autorización por guild auditadas.
5. **Ejecutar dos eventos, medir y decidir.** Piloto. Bloqueos: flujo funcional y comunidades disponibles. Revisar recurrencia antes de analytics, discovery o credenciales.
