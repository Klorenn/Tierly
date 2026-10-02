import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adminSource } from "./helpers/admin-source.mjs";

const read = (name) => readFileSync(new URL(`../tierly/${name}`, import.meta.url), "utf8");
const page = read("index.html");
const app = read("app.js");
const discover = read("discover.js");
const admin = adminSource;

test("la página monta la vista de descubrimiento y carga su script", () => {
  assert.match(page, /<section class="lb-view" data-view="discover" hidden>/);
  assert.match(page, /id="tierly-discover"/);
  assert.match(page, /src="\/tierly\/discover\.js\?v=/);
});

test("todos los módulos comparten la misma versión de caché", () => {
  const versions = [...page.matchAll(/src="\/tierly\/(?:app|discover|admin-app\/admin)\.js\?v=([^"']+)/g)].map((m) => m[1]);
  assert.equal(versions.length, 3);
  assert.equal(new Set(versions).size, 1);
});

test("el botón de invitación apunta al OAuth de Discord con scope de bot", () => {
  assert.match(app, /const DISCORD_APP_ID = "\d{17,20}"/);
  assert.match(app, /discord\.com\/oauth2\/authorize/);
  assert.match(app, /scope=bot\+applications\.commands/);
  assert.match(app, /permissions=/);
  assert.match(app, /inviteUrl/);
});

test("la invitación se traduce en los dos idiomas", () => {
  assert.match(app, /navDiscover: "Discover"/);
  assert.match(app, /navDiscover: "Descubrir"/);
  assert.match(app, /inviteBot: "Add Tierly to your server"/);
  assert.match(app, /inviteBot: "Añadir Tierly a tu servidor"/);
});

test("la navegación incluye Descubrir y abre el módulo al entrar", () => {
  assert.match(app, /data-view="discover"><i data-lucide="compass"><\/i><span>\$\{t\("navDiscover"\)\}/);
  assert.match(app, /if \(view === "discover"\) window\.TierlyDiscover\?\.open\?\.\(\);/);
});

test("el módulo de descubrimiento lee las tres vistas públicas", () => {
  assert.match(discover, /from\("tierly_public_top_games_view"\)/);
  assert.match(discover, /from\("tierly_public_top_players_view"\)/);
  assert.match(discover, /from\("tierly_public_communities_view"\)/);
});

test("el módulo ordena por minutos y acota el resultado", () => {
  assert.match(discover, /order\("total_minutes", \{ ascending: false \}\)/);
  assert.match(discover, /\.limit\(/);
});

test("el módulo nunca pide guild_id ni identificadores de Discord", () => {
  assert.doesNotMatch(discover, /guild_id/);
  assert.doesNotMatch(discover, /discord_user_id/);
});

test("el módulo escapa todo lo que viene de la base", () => {
  assert.match(discover, /const esc = /);
  assert.match(discover, /esc\(game\.game_name\)/);
  assert.match(discover, /esc\(row\.player_name\)/);
  assert.match(discover, /esc\(community\.community_name\)/);
});

test("el módulo explica qué certifica el dato de presencia", () => {
  assert.match(discover, /presencia/i);
  assert.match(discover, /minutos/i);
});

test("el panel admin permite aparecer en el directorio vía RPC autorizada", () => {
  assert.match(admin, /rpc\("tierly_set_public_directory"/);
  assert.match(admin, /target_guild/);
  assert.match(admin, /listed/);
  assert.match(admin, /public_directory/);
});
