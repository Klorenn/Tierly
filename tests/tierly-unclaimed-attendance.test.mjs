import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/20261002040000_tierly_attendance_without_claim.sql", import.meta.url), "utf8");
const bot = readFileSync(new URL("../discord-bot/index.js", import.meta.url), "utf8");
const store = readFileSync(new URL("../discord-bot/session-store.mjs", import.meta.url), "utf8");
const verify = readFileSync(new URL("../supabase/functions/discord-verify/index.ts", import.meta.url), "utf8");

test("anotar asistencia por discord_id es exclusivo de service_role", () => {
  // Si esto fuera `authenticated`, cualquiera con sesión podría pasar el
  // discord_id de un tercero y fabricarle estampas. Es LA restricción del
  // diseño, no un detalle de permisos.
  assert.match(
    sql,
    /revoke all on function public\.tierly_bot_record_attendance\(text, uuid, text, text, text\)\s*\n?\s*from public, anon, authenticated;/,
  );
  assert.match(
    sql,
    /grant execute on function public\.tierly_bot_record_attendance\(text, uuid, text, text, text\)\s*\n?\s*to service_role;/,
  );
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.tierly_bot_record_attendance[\s\S]{0,80}to authenticated/,
  );
});

test("la asistencia del bot nunca atribuye identidad", () => {
  // Vincular un Discord con una cuenta solo puede pasar en el reclamo, donde la
  // persona probó por OAuth que ese Discord es suyo.
  // Los comentarios se descartan: este test habla del codigo, y el propio
  // comentario del cuerpo nombra `auth_user_id` para explicar por que no se toca.
  const fn = sql
    .slice(
      sql.indexOf("function public.tierly_bot_record_attendance"),
      sql.indexOf("function public.tierly_bot_open_event"),
    )
    .replace(/^\s*--.*$/gm, "");
  assert.doesNotMatch(fn, /auth_user_id/);
  // Tampoco confirma: confirmar es decisión del administrador, no efecto de
  // aparecer en el evento.
  assert.doesNotMatch(fn, /confirmed_at\s*=/);
  assert.doesNotMatch(fn, /revoked_at\s*=\s*now/);
  assert.doesNotMatch(fn, /tierly_xp_ledger/);
});

test("la asistencia del bot exige la ventana y el estado del evento", () => {
  const fn = sql.slice(
    sql.indexOf("function public.tierly_bot_record_attendance"),
    sql.indexOf("function public.tierly_bot_open_event"),
  );
  assert.match(fn, /status in \('scheduled', 'live'\)/);
  assert.match(fn, /starts_at is not null/);
  assert.match(fn, /ends_at is not null/);
  assert.match(fn, /now\(\) between starts_at and ends_at/);
  assert.match(fn, /guild_id = p_guild_id/);
});

test("la asistencia se vuelve a abrir si la persona se había dado de baja", () => {
  assert.match(sql, /on conflict \(event_id, player_id\) do update/);
  assert.match(sql, /checked_in_at = coalesce\(a\.checked_in_at, now\(\)\)/);
  assert.match(sql, /unregistered_at = null/);
});

test("el perfil propio filtra por auth.uid() y no solo por RLS", () => {
  // La policy del ledger también habilita al administrador a leer TODO su guild.
  // Sin este filtro explícito, el perfil de un admin mostraría las estampas de
  // los demás.
  assert.match(sql, /create or replace view public\.tierly_my_stamps_view with \(security_invoker = true\)/);
  assert.match(sql, /where players\.auth_user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /revoke all on public\.tierly_my_stamps_view from public, anon;/);
  assert.match(sql, /grant select on public\.tierly_my_stamps_view to authenticated;/);
});

test("el perfil cruza comunidades, no una sola", () => {
  const view = sql.slice(sql.indexOf("create or replace view public.tierly_my_stamps_view"));
  assert.match(view, /communities\.name as community_name/);
  assert.doesNotMatch(view, /ledger\.guild_id = /);
});

test("el bot solo anota a quien ejecuta el comando", () => {
  // El discordUserId sale de `message.author.id`, nunca de un argumento del
  // mensaje: si se pudiera pasar, cualquiera anotaría a cualquiera.
  assert.match(bot, /!tierly" \) return false;|parts\[0\] !== "!tierly"/);
  assert.match(bot, /"voy"/);
  assert.match(bot, /discordUserId: message\.author\.id/);
  const handler = bot.slice(bot.indexOf("async function handleAttendanceCommand"), bot.indexOf("function memberIdentity"));
  assert.doesNotMatch(handler, /parts\[2\]|mentions/);
});

test("el bot no decide la ventana del evento por su cuenta", () => {
  // El reloj que autoriza la escritura y el que elige el evento tienen que ser
  // el mismo, o hay una carrera en el borde de la ventana.
  assert.match(store, /rpc\("tierly_bot_open_event"/);
  assert.match(sql, /now\(\) between starts_at and ends_at[\s\S]*?order by starts_at asc/);
});

test("el reclamo fusiona por discord_id, así que no hay estampas que migrar", () => {
  // Esta es la razón por la que no existe un backfill: la asistencia y el ledger
  // cuelgan de `gaming_players.id`, y el reclamo le pone `auth_user_id` a la
  // fila que YA existía en vez de crear otra. Si esto cambiara a un insert, las
  // estampas quedarían huérfanas sin que ningún test lo note.
  assert.match(verify, /onConflict: "discord_id"/);
  assert.match(verify, /auth_user_id: user\.id/);
});

test("escenario lógico: asisto sin cuenta, el admin confirma, reclamo y la estampa es mía", () => {
  const players = new Map();
  const attendance = new Map();
  const ledger = new Map();

  // 1. El bot anota a alguien que nunca oyó hablar de TIRLY.
  const playerId = "player-1";
  players.set("discord-9", { id: playerId, discord_id: "discord-9", auth_user_id: null });
  attendance.set(`ev-1:${playerId}`, { checked_in_at: "t1", confirmed_at: null });
  assert.equal(players.get("discord-9").auth_user_id, null, "no debe quedar atribuido todavía");

  // 2. El administrador confirma: la estampa se acuña contra el player_id.
  attendance.get(`ev-1:${playerId}`).confirmed_at = "t2";
  const key = `event-attendance:ev-1:${playerId}`;
  ledger.set(key, { player_id: playerId, xp: 10, stamps: 1 });

  // 3. La persona reclama. El upsert por discord_id NO crea una fila nueva.
  const existing = players.get("discord-9");
  existing.auth_user_id = "auth-7";
  assert.equal(players.size, 1, "el reclamo no debe duplicar al jugador");

  // 4. Sus estampas ya son suyas, sin mover una sola fila del ledger.
  const mine = [...ledger.values()].filter((row) => {
    const owner = [...players.values()].find((p) => p.id === row.player_id);
    return owner?.auth_user_id === "auth-7";
  });
  assert.equal(mine.length, 1);
  assert.equal(mine[0].stamps, 1);

  // 5. Confirmar de nuevo no duplica: la clave de idempotencia es la misma.
  ledger.set(key, { player_id: playerId, xp: 10, stamps: 1 });
  assert.equal(ledger.size, 1);
});

const app = readFileSync(new URL("../tierly/app.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../tierly/index.html", import.meta.url), "utf8");

test("el perfil lee la vista propia, no el ledger crudo", () => {
  // Consultar `tierly_xp_ledger` directo mostraria las filas de TODO el guild
  // cuando quien mira es administrador: su perfil tendria las estampas ajenas.
  assert.match(app, /\.from\("tierly_my_stamps_view"\)/);
  const loader = app.slice(app.indexOf("async function loadMyStamps"), app.indexOf("function renderProfileStamps"));
  assert.doesNotMatch(loader, /tierly_xp_ledger/);
});

test("el total de estampas suma, no cuenta filas", () => {
  // Una revocacion deja una entrada compensatoria con `stamps` negativo. Contar
  // filas mostraria estampas que ya fueron revocadas.
  assert.match(app, /stampRows\.reduce\(\(sum, row\) => sum \+ Number\(row\.stamps \|\| 0\), 0\)/);
  assert.match(app, /filter\(\(row\) => Number\(row\.stamps \|\| 0\) > 0\)/);
});

test("los nombres de evento y comunidad se escapan", () => {
  const render = app.slice(app.indexOf("function renderProfileStamps"), app.indexOf("function renderSideCards"));
  assert.match(render, /esc\(row\.event_name/);
  assert.match(render, /esc\(row\.community_name \|\| row\.guild_id\)/);
});

test("las estampas tienen su bloque en el perfil y texto en los dos idiomas", () => {
  assert.match(page, /id="lb-profile-stamps"/);
  for (const key of ["profileStampsTitle", "profileStampsEmpty", "profileStampsUnclaimed", "profileStampsTotal"]) {
    const hits = [...app.matchAll(new RegExp(`${key}:`, "g"))];
    assert.equal(hits.length, 2, `${key} debe estar en ingles y español`);
  }
});

test("sin sesión el perfil explica cómo reclamar las estampas ya ganadas", () => {
  // Es el unico lugar donde alguien que fue a un evento sin cuenta descubre que
  // tiene algo esperandolo.
  const render = app.slice(app.indexOf("function renderProfileStamps"), app.indexOf("function renderSideCards"));
  assert.match(render, /if \(!currentSession\)[\s\S]{0,160}profileStampsUnclaimed/);
});
