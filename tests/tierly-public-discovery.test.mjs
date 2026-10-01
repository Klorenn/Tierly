import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../supabase/migrations/20261001010000_tierly_public_discovery.sql", import.meta.url),
  "utf8",
);

const projection = (viewName) =>
  sql.match(new RegExp(`create or replace view public\\.${viewName}[\\s\\S]*?;`))?.[0] ?? "";

test("el directorio público es opt-in por comunidad y arranca apagado", () => {
  assert.match(sql, /alter table public\.communities/);
  assert.match(sql, /add column if not exists public_directory boolean not null default false/);
});

test("las tres vistas públicas se leen como anon y authenticated", () => {
  for (const view of [
    "tierly_public_communities_view",
    "tierly_public_top_games_view",
    "tierly_public_top_players_view",
  ]) {
    assert.match(sql, new RegExp(`create or replace view public\\.${view}`), view);
    assert.match(sql, new RegExp(`grant select on public\\.${view} to anon, authenticated`), view);
  }
});

test("ninguna vista pública entra a comunidades que no pidieron aparecer", () => {
  for (const view of [
    "tierly_public_communities_view",
    "tierly_public_top_games_view",
    "tierly_public_top_players_view",
  ]) {
    assert.match(projection(view), /public_directory is true/, view);
  }
});

test("ninguna vista pública expone guild_id ni discord_user_id", () => {
  for (const view of [
    "tierly_public_communities_view",
    "tierly_public_top_games_view",
    "tierly_public_top_players_view",
  ]) {
    const body = projection(view);
    assert.notEqual(body, "", view);
    assert.doesNotMatch(body, /^\s*(c|r|s|m)?\.?guild_id\s+as\b/m, view);
    assert.doesNotMatch(body, /discord_user_id\s+as\b/, view);
    assert.doesNotMatch(body, /discord_id/, view);
  }
});

test("el directorio cuenta solo miembros que aceptaron la observación", () => {
  assert.match(projection("tierly_public_communities_view"), /consent_status = 'accepted'/);
});

test("los juegos más jugados se agregan desde los rollups, no desde sesiones crudas", () => {
  const body = projection("tierly_public_top_games_view");
  assert.match(body, /from public\.daily_game_rollups r/);
  assert.match(body, /join public\.games g on g\.id = r\.game_id/);
  assert.match(body, /sum\(r\.total_minutes\)/);
  assert.match(body, /count\(distinct r\.guild_id\)/);
});

test("los juegos más jugados no suman unique_players entre comunidades", () => {
  assert.doesNotMatch(projection("tierly_public_top_games_view"), /sum\(r\.unique_players\)/);
});

test("los juegos más jugados respetan presence_enabled y una ventana acotada", () => {
  const body = projection("tierly_public_top_games_view");
  assert.match(body, /presence_enabled is true/);
  assert.match(body, /r\.day >= current_date - interval '30 days'/);
});

test("el ranking de jugadores exige consentimiento e identidad visible", () => {
  const body = projection("tierly_public_top_players_view");
  assert.match(body, /m\.consent_status = 'accepted'/);
  assert.match(body, /m\.identity_visible is true/);
  assert.match(body, /m\.deletion_requested_at is null/);
});

test("el ranking de jugadores queda dentro de cada comunidad, sin cruzar guilds", () => {
  const body = projection("tierly_public_top_players_view");
  assert.match(body, /c\.name\s+as community_name/);
  assert.match(body, /group by[\s\S]*s\.guild_id/);
});

test("el ranking de jugadores solo cuenta sesiones cerradas en la ventana", () => {
  const body = projection("tierly_public_top_players_view");
  assert.match(body, /s\.ended_at is not null/);
  assert.match(body, /s\.started_at >= now\(\) - interval '30 days'/);
});

test("solo un administrador de la comunidad puede cambiar el flag del directorio", () => {
  assert.match(sql, /create or replace function public\.tierly_set_public_directory/);
  assert.match(sql, /security definer/);
  assert.match(sql, /from public\.community_admins/);
  assert.match(sql, /revoke all on function public\.tierly_set_public_directory\(text, boolean\) from public, anon/);
  assert.match(sql, /grant execute on function public\.tierly_set_public_directory\(text, boolean\) to authenticated/);
});
