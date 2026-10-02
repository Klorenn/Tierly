import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../discord-bot/index.js", import.meta.url), "utf8");

test("no rechaza slash commands por un único DISCORD_GUILD_ID", () => {
  assert.doesNotMatch(source, /Este comando solo funciona en el server configurado/);
  assert.doesNotMatch(
    source,
    /interaction\.guildId\s*!==\s*DISCORD_GUILD_ID/,
  );
});

test("slash commands se registran en cada guild del bot", () => {
  assert.match(source, /guildCreate/);
  assert.match(source, /guild\.commands\.set\(TIERLY_COMMANDS\)/);
  assert.match(source, /client\.guilds\.cache/);
});

test("eventos y config usan interaction.guildId, no el env fijo", () => {
  const handler = source.slice(source.indexOf('client.on("interactionCreate"'));
  assert.match(handler, /const guildId\s*=\s*interaction\.guildId/);
  assert.match(handler, /guild_id:\s*guildId/);
  assert.match(handler, /\.eq\("guild_id",\s*guildId\)/);
});

test("presence y consentimiento usan el guild del evento, no solo el env", () => {
  assert.match(source, /openSession\(\{[\s\S]*?guildId,\s*\n\s*communityName/);
  assert.match(source, /acceptMemberConsent\(guildId,/);
  assert.match(source, /sessionKey\(guildId,/);
});
