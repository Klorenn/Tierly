import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = new URL("..", import.meta.url);
const app = await readFile(new URL("../tierly/app.js", import.meta.url), "utf8");
const discover = await readFile(new URL("../tierly/discover.js", import.meta.url), "utf8");
const page = await readFile(new URL("../tierly/index.html", import.meta.url), "utf8");

test("discover.js tiene sintaxis válida", () => {
  const check = spawnSync(process.execPath, ["--check", path.join(root.pathname, "tierly/discover.js")], {
    encoding: "utf8",
  });
  assert.equal(check.status, 0, check.stderr || check.stdout);
});

test("la app arranca en discover (home servidores + jugando ahora)", () => {
  assert.match(app, /switchView\(["']discover["']\);/);
  // El boot es el switchView que queda fuera de handlers, junto al initAuth.
  const bootBlock = app.match(/renderFooter\(\);\s*\n\s*switchView\(["'](\w+)["']\);\s*\n\s*initAuth\(\);/);
  assert.ok(bootBlock, "boot switchView debe estar junto a initAuth");
  assert.equal(bootBlock[1], "discover");
  assert.doesNotMatch(bootBlock[0], /ranking/);
});

test("nav prioriza Home/Discover y no ofrece Rewards vacío", () => {
  const nav = app.match(/function renderNav\(\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(nav, /data-view="discover"/);
  assert.doesNotMatch(nav, /data-view="rewards"/);
  assert.match(nav, /t\("navHome"\)/);
});

test("las tarjetas de comunidad exponen Unirse + Agregar bot", () => {
  assert.match(discover, /invite_url/);
  assert.match(discover, /Unirse|joinServer|ctaJoin/i);
  assert.match(discover, /inviteUrl|inviteBot|Agregar bot|invite bot/i);
  assert.match(discover, /community_invite|invite_url/);
});

test("live y juegos usan banner_url del juego", () => {
  assert.match(discover, /banner_url|game_banner/);
  assert.match(app, /game_banner|banner_url|game-banners/);
});

test("migración añade invite_url y game banners y actualiza vistas públicas", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20261002230000_tierly_web_join_and_game_banners.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /alter table public\.communities[\s\S]*invite_url/i);
  assert.match(sql, /alter table public\.games[\s\S]*banner_url/i);
  assert.match(sql, /alter table public\.games[\s\S]*icon_url/i);
  assert.match(sql, /tierly_public_communities_view/);
  assert.match(sql, /tierly_public_live_presence_view/);
  assert.match(sql, /tierly_public_top_games_view/);
  assert.match(sql, /c\.invite_url/);
  assert.match(sql, /g\.banner_url/);
});

test("existe script de fetch de banners con overrides Steam/Google", async () => {
  await access(new URL("../scripts/fetch-game-banners.mjs", import.meta.url));
  const script = await readFile(new URL("../scripts/fetch-game-banners.mjs", import.meta.url), "utf8");
  assert.match(script, /store\.steampowered\.com|steamstatic/i);
  assert.match(script, /game-banner-overrides/);
  assert.match(script, /game-banners/);
});
