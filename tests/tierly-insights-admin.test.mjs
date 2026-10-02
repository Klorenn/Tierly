import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { adminSource } from "./helpers/admin-source.mjs";

const admin = adminSource;
const app = readFileSync(new URL("../tierly/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../tierly/index.html", import.meta.url), "utf8");
const read = (path) => readFileSync(new URL(`../admin/${path}`, import.meta.url), "utf8");

test("el panel admin se carga como isla separada y comparte TierlyBridge", () => {
  assert.match(html, /\/tierly\/admin-app\/admin\.js\?v=\d{8}-\d+/);
  assert.match(html, /\/tierly\/admin-app\/admin\.css\?v=\d{8}-\d+/);
  assert.match(admin, /window\.TierlyBridge/);
  assert.match(app, /window\.TierlyBridge/);
});

test("el panel admin reconoce la ruta y ofrece las cinco vistas", () => {
  // La ruta la resuelve `app.js`; la isla solo expone `TierlyAdmin` para abrirla.
  assert.match(app, /\/tierly\/admin/);
  assert.match(app, /window\.TierlyAdmin\?\.open/);
  assert.match(admin, /window\.TierlyAdmin/);
  assert.match(admin, /\/tierly\?admin=1/);
  assert.match(html, /data-view="admin"[^>]*data-admin-route/);
  assert.match(
    admin,
    /ADMIN_VIEWS = \["events", "games", "players", "trends", "suggestions"\] as const/,
  );
});

test("el panel resuelve al jugador por la sesión y conserva discord_user_id fuera del HTML", () => {
  for (const table of ["community_admins", "daily_game_rollups", "suggested_events", "games", "communities", "tierly_admin_game_players"]) {
    assert.match(admin, new RegExp(`from\\(["']${table}["']\\)`));
  }
  assert.match(admin, /from\(["']gaming_players["']\)/);
  assert.match(admin, /eq\(["']auth_user_id["'], current\.user\.id\)/);
  assert.doesNotMatch(admin, /from\(["']play_sessions["']\)/);
  assert.doesNotMatch(admin, /discord_user_id/);
  assert.match(admin, /display_name/);
  assert.match(admin, /avatar_url/);
});

test("el panel selecciona una comunidad autorizada y nunca arma HTML a mano", () => {
  assert.match(admin, /from\(["']community_admins["']\)\.select\(["']guild_id, role["']\)/);
  assert.match(admin, /selectCommunity/);
  assert.match(admin, /\.eq\(["']guild_id["'], guildId\)/);
  // React escapa por construcción: el riesgo del panel vanilla era interpolar
  // guild_ids en `innerHTML`. Eso no debe volver ni para un caso.
  assert.doesNotMatch(admin, /innerHTML/);
  assert.match(admin, /needsOnboarding/);
  assert.match(admin, /no administra ninguna comunidad todavía/);
});

test("la migración mantiene RLS y evita filtrar identidades hacia la página pública", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260930034128_tierly_observed_member_identity.sql", import.meta.url), "utf8");
  assert.match(migration, /security_invoker\s*=\s*true/);
  assert.match(migration, /grant select on public\.tierly_admin_game_players to authenticated/i);
  assert.doesNotMatch(html, /tierly_admin_game_players|observed_members/);
  assert.doesNotMatch(admin, /discord_user_id/);
});

test("cada juego usa un icono Lucide determinista y local, nunca una imagen remota", () => {
  assert.match(admin, /export function gameIconName\(/);
  assert.match(admin, /canonical_name.*display_name/s);
  assert.match(admin, /placeholder\.dataset\["lucide"\] = name/);
  assert.match(admin, /createIcons\(\)/);
  assert.match(admin, /FALLBACK_ICONS\[hash % FALLBACK_ICONS\.length\]/);
  assert.match(admin, /className="tla-game-icon"/);
  // El icono del juego NO puede venir de una URL: seria un fetch a un host
  // arbitrario por cada fila de la tabla. El crest de la comunidad si usa
  // `icon_url`, pero con host allowlisteado y en su propio componente.
  for (const path of ["lib/games.ts", "components/GameLabel.tsx", "components/Icon.tsx"]) {
    assert.doesNotMatch(read(path), /icon_url|image_url/, `${path} no debe cargar imagenes remotas`);
  }
  assert.match(read("components/CommunityCrest.tsx"), /ALLOWED_ICON_HOST = "cdn\.discordapp\.com"/);
});

test("muestra presencia actual agrupada por juego y conserva histórico", () => {
  assert.match(admin, /Jugando ahora/);
  assert.match(admin, /is_active/);
  assert.match(admin, /started_at/);
  assert.match(admin, /function PresenceGroups\(/);
  assert.match(admin, /Histórico/);
  assert.match(admin, /tierly_admin_game_players[\s\S]*?select\([\s\S]*?is_active[\s\S]*?started_at/);
});

test("la migración de presencia conserva el invocador y no expone discord_user_id", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260930131124_tierly_admin_game_presence.sql", import.meta.url), "utf8");
  assert.match(migration, /security_invoker\s*=\s*true/);
  assert.match(migration, /is_active/);
  assert.match(migration, /ended_at\s+is\s+null/);
  assert.match(migration, /started_at/);
  assert.match(migration, /grant select on public\.tierly_admin_game_players to authenticated/i);
  const exposedColumns = migration.split(/\n\s*from public\.play_sessions sessions/i)[0];
  assert.doesNotMatch(exposedColumns, /^\s*sessions\.discord_user_id\s*[,)]/im);
});

test("la única escritura posible es la RPC segura de estado de sugerencia", () => {
  assert.match(admin, /rpc\(["']tierly_update_suggestion_status["']/);
  assert.doesNotMatch(admin, /\.insert\(|\.upsert\(|\.delete\(|\.update\(/);
});

test("las acciones de eventos usan RPC y recargan la UI con errores accesibles", () => {
  for (const rpc of ["tierly_register_event", "tierly_unregister_event", "tierly_check_in_event", "tierly_confirm_event_attendance"]) {
    assert.match(admin, new RegExp(rpc));
  }
  assert.match(admin, /admin\.setMessage\(error\?\.message \?\? ""\)/);
  assert.match(admin, /role="alert"/);
  assert.match(admin, /await admin\.reload\(\)/);
  assert.match(admin, /tierly_xp_ledger/);
  assert.match(admin, /confirmed_at/);
});

test("la navegación pública conserva ranking, chess y racer sin admin antiguo", () => {
  assert.match(html, /data-view="ranking"/);
  assert.match(html, /data-view="chess"/);
  assert.doesNotMatch(app, /tierly_(create_smash_tournament|confirm_match|award_reward)/);
  assert.doesNotMatch(admin, /smash|brackets/i);
});

test("los módulos usan versiones de cache busting coherentes", () => {
  const versions = [...html.matchAll(/src="\/tierly\/(?:app|chess|admin-app\/admin)\.js\?v=([^"']+)/g)].map((match) => match[1]);
  assert.ok(versions.length >= 3);
  assert.equal(new Set(versions).size, 1);
});

// El panel vanilla murio una vez con "renderTable is not defined" y ningun
// assert.match lo habria detectado; ese agujero lo cubria un test que recorria
// el grafo de llamadas con regex. En TypeScript el compilador da la misma
// garantia y mucho mas fuerte, pero solo si corre dentro de la suite: si queda
// como paso manual de CI, no protege nada.
test("el typecheck de la isla es parte de la suite", () => {
  execFileSync("npx", ["tsc", "--noEmit"], {
    cwd: new URL("..", import.meta.url),
    stdio: "pipe",
  });
});
