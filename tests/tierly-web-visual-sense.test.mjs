import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../tierly/app.js", import.meta.url), "utf8");
const discover = await readFile(new URL("../tierly/discover.js", import.meta.url), "utf8");
const page = await readFile(new URL("../tierly/index.html", import.meta.url), "utf8");
const eventsSql = await readFile(
  new URL("../supabase/migrations/20261002233000_tierly_public_events_directory_gate.sql", import.meta.url),
  "utf8",
);

test("eventos públicos solo salen de comunidades en directorio y no cancelled", () => {
  assert.match(eventsSql, /public_directory is true/);
  assert.match(eventsSql, /status\s*(<>|!=|not in).*cancelled|status in \('scheduled',\s*'live'\)/i);
  assert.match(eventsSql, /grant select on public\.tierly_community_events_public_view/i);
});

test("live muestra juegos más jugados cuando no hay presencia en vivo", () => {
  assert.match(app, /tierly_public_top_games_view/);
  assert.match(app, /liveTopGames/);
  assert.match(app, /game_banner_url/);
  assert.match(app, /loadLivePresence/);
});

test("discover prioriza juegos con banner y eventos próximos con sentido", () => {
  assert.match(discover, /game_banner_url/);
  assert.match(discover, /tierly_community_events_public_view/);
  assert.match(discover, /Juegos más jugados/);
  assert.match(discover, /lb-games-spotlight|lb-games-hero/);
  assert.match(discover, /Próximos eventos/);
  assert.match(discover, /Unirse/);
  // Spotlight de juegos va antes que stats / live / eventos
  const spotlightAt = discover.indexOf("lb-games-spotlight");
  const liveAt = discover.indexOf("lb-home-live");
  const eventsAt = discover.indexOf("Próximos eventos");
  assert.ok(spotlightAt > 0 && spotlightAt < liveAt && spotlightAt < eventsAt);
});

test("shell visual usa tipografía de display no Inter-only y atmósfera de fondo", () => {
  assert.match(page, /Fraunces/);
  assert.doesNotMatch(page, /--sans:\s*'Inter'/);
  assert.match(page, /Source Sans 3/);
  assert.match(page, /lb-atmosphere/);
  assert.match(page, /radial-gradient/);
  assert.match(page, /--content-max/);
  assert.match(page, /h2\.lb-view-head/);
  assert.match(page, /\.lb-rank-tabs button\.is-active/);
});

test("discover se auto-abre si Home ya está visible (evita race con app.js)", () => {
  assert.match(discover, /section\.lb-view\[data-view='discover'\]/);
  assert.match(discover, /!discoverView\.hidden\) open\(\)/);
  assert.match(discover, /if \(!root\.innerHTML\.trim\(\)\) load\(\)/);
});
