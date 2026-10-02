import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/20261003010000_tierly_public_game_detail.sql", import.meta.url),
  "utf8",
);
const discover = await readFile(new URL("../tierly/discover.js", import.meta.url), "utf8");
const page = await readFile(new URL("../tierly/index.html", import.meta.url), "utf8");

const projection = (viewName) =>
  migration.match(new RegExp(`create(?: or replace)? view public\\.${viewName}[\\s\\S]*?;`, "i"))?.[0] ?? "";

test("existen vistas públicas juego→servidores y juego→jugadores", () => {
  for (const view of ["tierly_public_game_communities_view", "tierly_public_game_players_view"]) {
    assert.match(migration, new RegExp(`create view public\\.${view}`, "i"), view);
    assert.match(migration, new RegExp(`grant select on public\\.${view} to anon, authenticated`, "i"), view);
  }
});

test("juego→servidores agrega rollups por comunidad sin guild_id ni unique_players", () => {
  const body = projection("tierly_public_game_communities_view");
  assert.notEqual(body, "");
  assert.match(body, /from public\.daily_game_rollups r/);
  assert.match(body, /g\.display_name\s+as game_name/);
  assert.match(body, /c\.name\s+as community_name/);
  assert.match(body, /c\.invite_url/);
  assert.match(body, /public_directory is true/);
  assert.match(body, /presence_enabled is true/);
  assert.match(body, /r\.day >= current_date - interval '30 days'/);
  assert.doesNotMatch(body, /guild_id\s+as\b/);
  assert.doesNotMatch(body, /sum\(r\.unique_players\)/);
});

test("juego→jugadores exige consentimiento e identidad visible y no cruza guilds", () => {
  const body = projection("tierly_public_game_players_view");
  assert.notEqual(body, "");
  assert.match(body, /g\.display_name\s+as game_name/);
  assert.match(body, /m\.consent_status = 'accepted'/);
  assert.match(body, /m\.identity_visible is true/);
  assert.match(body, /m\.deletion_requested_at is null/);
  assert.match(body, /s\.ended_at is not null/);
  assert.match(body, /group by[\s\S]*s\.guild_id/);
  assert.doesNotMatch(body, /guild_id\s+as\b/);
  assert.doesNotMatch(body, /discord_user_id\s+as\b/);
});

test("discover abre popup al tocar un juego con servers y quién juega", () => {
  assert.match(page, /id="lb-game-modal"/);
  assert.match(discover, /data-game-open/);
  assert.match(discover, /tierly_public_game_communities_view/);
  assert.match(discover, /tierly_public_game_players_view/);
  assert.match(discover, /showModal\(/);
  assert.match(discover, /En qué server|Servidores|Quién juega/i);
});
