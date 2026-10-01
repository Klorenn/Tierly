# Tierly — Descubrimiento público

Fecha: 2026-10-01
Estado: implementado y cubierto por pruebas locales; aplicación y validación en producción no acreditadas aquí

## Qué es

Una página pública (`#discover`) que responde cuatro preguntas sin pedir sesión:

- ¿Cómo sumo Tierly a mi servidor?
- ¿Qué juegos se juegan más?
- ¿Quién juega más?
- ¿Qué servidores usan Tierly?

Hasta acá los datos de presence solo existían en el panel admin, scopeados por
guild y detrás de la RLS de `community_admins`. Nadie que no administrara una
comunidad podía ver nada, así que Tierly no tenía forma de mostrar su propio
valor a un organizador que recién llega.

## Qué no es

- No es un censo de Discord. Tierly no conoce el padrón del servidor: conoce a
  quienes aceptaron la observación de presence. Lo que se publica como
  "jugadores" es `consenting_member_count`, y el nombre lo dice.
- No es un perfil cross-server. Ver abajo: el ranking de jugadores no agrega
  entre guilds, por decisión, no por falta de tiempo.
- No es prueba de nada competitivo. Presence dice que Discord reportó actividad
  en una ventana. No prueba partida compartida, duración exacta ni victoria. La
  página lo declara en su subtítulo, no en letra chica.
- No es automático. Ninguna comunidad aparece sin que su administrador lo pida.

## Tensión con el roadmap, y cómo se resuelve

Esto es lo que más importa de este documento.

El roadmap pone el directorio de comunidades en **Fase 4** (descubrimiento,
condicional a piloto recurrente y usos aprobados), y Fase 0 dice explícitamente
que **no se asume autorizado el grafo personal persistente entre servidores** ni
los analytics comerciales, apoyado en la Developer Policy de Discord.

Construir esto ahora adelanta Fase 4. La decisión fue del dueño del producto,
con el conflicto sobre la mesa. Lo que no se negoció fue el modo: se adelanta la
**superficie**, no los permisos. Tres límites hacen que la página sea compatible
con Fase 0 aunque llegue antes de Fase 4.

### Límite 1 — Aparecer es opt-in, por comunidad

`communities.public_directory boolean not null default false`.

Ninguna comunidad instalada aparece por el solo hecho de existir. El flag se
cambia únicamente con `tierly_set_public_directory(target_guild, listed)`, que es
`security definer` y verifica `community_admins` contra `auth.uid()` **en el
servidor**. El panel admin solo dibuja el checkbox; la autorización no se delega
al navegador.

Las tres vistas filtran `c.public_directory is true`. Un bug en el frontend no
puede filtrar una comunidad que no pidió aparecer, porque el dato no sale de la
base.

### Límite 2 — El ranking de jugadores no cruza guilds

`tierly_public_top_players_view` agrupa por `s.guild_id` y publica
`community_name`. Una persona que juega en dos servidores públicos aparece como
**dos filas**, cada una dentro de su comunidad.

Esto es a propósito y es el punto más fácil de "arreglar" por error. Agregar por
`discord_user_id` entre guilds daría una tabla más linda y un número más grande,
y sería exactamente el grafo personal persistente entre servidores que Fase 0 no
asume autorizado. La forma del `group by` ES la política; hay un test que lo
sostiene.

### Límite 3 — El ranking nominal exige consentimiento explícito

Publicar un nombre requiere las tres condiciones, ya definidas por
`20260930151000_tierly_presence_consent.sql`:

- `consent_status = 'accepted'`
- `identity_visible is true` — aceptar ser observado no es aceptar ser publicado;
  son dos decisiones separadas y acá se exigen las dos
- `deletion_requested_at is null`

Retirar el consentimiento o pedir borrado saca a la persona de la vista en la
siguiente lectura, sin trabajo extra: la vista se evalúa en cada query.

Además, ninguna de las tres vistas proyecta `guild_id` ni `discord_user_id`. El
navegador recibe nombres e iconos. Un test verifica la ausencia de esas columnas
en las tres proyecciones.

## Modelo de datos

Sin tablas nuevas. Una columna, tres vistas, una función.

### `tierly_public_communities_view`

Nombre, icono, locale, zona, `installed_at`, `presence_enabled`, más dos
agregados calculados: `consenting_member_count` (miembros con consentimiento
aceptado y sin borrado pedido) y `games_tracked` (juegos distintos con rollup en
30 días).

`consenting_member_count` no es "miembros del servidor". Nombrarlo así habría
sido inventar un número que Tierly no tiene.

### `tierly_public_top_games_view`

Lee **`daily_game_rollups`, no `play_sessions`**. El rollup ya aplicó el cap de
minutos por comunidad y la purga de retención, así que leer el agregado hereda
los dos límites gratis. Leer sesiones crudas los habría esquivado.

Publica `total_minutes`, `session_count`, `community_count`
(`count(distinct guild_id)`) y `last_played_day`. Ventana de 30 días. Exige
`presence_enabled is true`.

**No suma `unique_players`.** Ese campo es único por guild y por día: sumarlo
entre comunidades y entre días cuenta a la misma persona muchas veces y produce
un número inflado que *parece* "jugadores" sin serlo. Preferimos dos números
honestos (`session_count`, `community_count`) a uno grande y falso. Hay un test
que falla si alguien lo "mejora".

### `tierly_public_top_players_view`

Identidad desde `observed_members` (`display_name`, `avatar_url`), que es la
identidad guild-scoped que el miembro aceptó mostrar — no desde `gaming_players`,
que es la identidad global de Chess/Racer y no tiene nada que ver con el
consentimiento de presence.

Solo sesiones **cerradas** (`ended_at is not null`): una sesión abierta todavía
no tiene `minutes`, y publicarla inventaría duración. Ventana de 30 días sobre
`started_at`.

### `tierly_set_public_directory(text, boolean)`

`security definer` porque el flag vive en `communities`, cuya RLS no concede
`update` al panel. `revoke` a `public` y `anon`; `grant execute` a
`authenticated` y `service_role`. Levanta `42501` sin sesión o sin fila en
`community_admins`.

## Frontend

`tierly/discover.js`, mismo patrón que `admin.js`: IIFE, sin bundler, se cuelga
de `window.TierlyBridge` y se monta en `#tierly-discover`. Se expone como
`window.TierlyDiscover` y `app.js` lo abre con `switchView("discover")`. Carga
perezosa: la primera entrada a la vista dispara el fetch, no la carga de página.

Las tres queries salen en paralelo con `Promise.all`. CSS con prefijo
`.lb-disc-*`, sobre los tokens del sistema (`--card`, `--teal-bright`,
`--serif`), así hereda light/dark sin declarar colores propios.

### Botón de invitación

`DISCORD_APP_ID` + `DISCORD_BOT_PERMISSIONS` en `app.js`, expuesto como
`bridge.inviteUrl()`. Scope `bot+applications.commands`. Permisos `84992` = View
Channels + Send Messages + Embed Links + Read Message History: lo mínimo para
anunciar eventos y recordatorios.

`GUILD_PRESENCES` **no** va acá. Es un intent del Gateway, se aprueba en el
portal de Discord y es independiente de los permisos de invitación. Confundirlos
es el error clásico: agregarlo a la URL no habilita presence.

`inviteUrl()` devuelve `null` mientras `DISCORD_APP_ID` sean todos ceros, y el
CTA no se renderiza. Un botón ausente es mejor que un botón que lleva a un error
de Discord. El Application ID real se configuró después de escribir este diseño
(`0faa73c`); verificar el CTA en el host final sigue pendiente.

## Testing

Mismo estilo que el resto del repo: aserciones de texto sobre el SQL y los
módulos, sin base de datos en el loop.

- `tests/tierly-public-discovery.test.mjs` (12) — opt-in apagado por defecto,
  grants a `anon`/`authenticated`, `public_directory is true` en las tres
  vistas, ausencia de `guild_id`/`discord_user_id`, el `group by` por guild, la
  ausencia de `sum(unique_players)`, las tres condiciones de consentimiento, y
  la autorización de la RPC.
- `tests/tierly-discovery-ui.test.mjs` (11) — montaje de la vista, versión de
  caché compartida entre los cuatro módulos, forma de la URL de invitación, i18n
  en los dos idiomas, las tres queries, escapado de todo lo que viene de la base
  y el toggle del panel admin.

Varios de estos tests existen para que un refactor bienintencionado no borre una
decisión de política. El que prohíbe `sum(unique_players)` y el que exige el
`group by s.guild_id` son los dos importantes.

Suite completa: 266/266.

## Fuera de alcance

- Filtros por juego, zona o idioma (Fase 4).
- Inscribirse a un evento desde el descubrimiento. La página informa; el ciclo
  de evento sigue viviendo en su propia vista.
- Paginación. Límites fijos: 12 juegos, 15 jugadores, 24 comunidades. Con el
  volumen actual paginar sería infraestructura sin demanda.
- Moderación del directorio. Hoy el único control es el opt-in del admin. Si
  aparece una comunidad con nombre abusivo, la salida es quitarle el flag a
  mano. Antes de abrir esto a muchas comunidades hace falta reporte y bajada.
