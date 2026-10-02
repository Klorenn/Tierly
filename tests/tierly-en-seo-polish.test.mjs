import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const discover = await readFile(new URL("../tierly/discover.js", import.meta.url), "utf8");
const page = await readFile(new URL("../tierly/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../tierly/app.js", import.meta.url), "utf8");
const robots = await readFile(new URL("../robots.txt", import.meta.url), "utf8");
const sitemap = await readFile(new URL("../sitemap.xml", import.meta.url), "utf8");

test("discover copy is English (no Rioplatense UI strings)", () => {
  assert.match(discover, /Play with your community/);
  assert.match(discover, /Most played games/);
  assert.match(discover, /Where it's played/);
  assert.match(discover, /Who's playing/);
  assert.doesNotMatch(discover, /Jugá con tu comunidad/);
  assert.doesNotMatch(discover, /Juegos más jugados/);
  assert.doesNotMatch(discover, /Quién juega/);
  assert.doesNotMatch(discover, /Reintentá/);
  assert.match(discover, /en-US/);
});

test("public UI forces English as the active language", () => {
  assert.match(app, /let lang = "en"/);
  assert.doesNotMatch(app, /data-lang="es"/);
});

test("SEO foundations: robots, sitemap, JSON-LD, English meta", () => {
  assert.match(robots, /Sitemap:\s*https:\/\/www\.tirly\.xyz\/sitemap\.xml/i);
  assert.match(robots, /Allow:\s*\//);
  assert.match(sitemap, /https:\/\/www\.tirly\.xyz\//);
  assert.match(page, /application\/ld\+json/);
  assert.match(page, /"@type":\s*"Organization"/);
  assert.match(page, /"@type":\s*"WebSite"/);
  assert.match(page, /lang="en"/);
  assert.doesNotMatch(page, /og:locale:alternate/);
  assert.match(page, /Discord communities|gaming communities|presence/i);
});
