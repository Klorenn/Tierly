import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../discord-bot/index.js", import.meta.url), "utf8");

test("registra /tierly event como grupo con create, list y join", () => {
  assert.match(source, /name:\s*"event"/);
  assert.match(source, /type:\s*2/); // SUB_COMMAND_GROUP
  assert.match(source, /name:\s*"create"/);
  assert.match(source, /name:\s*"list"/);
  assert.match(source, /name:\s*"join"/);
  assert.match(source, /name:\s*"starts_at"/);
  assert.match(source, /name:\s*"event_id"/);
});

test("event create/list usan el schema real (guild_id), no community_id/game_id", () => {
  // El insert del bot debe alinear con tierly_create_event / gaming_events.
  assert.match(source, /from\("gaming_events"\)[\s\S]{0,400}?guild_id/);
  assert.doesNotMatch(source, /community_id:\s*community\.id/);
  assert.doesNotMatch(source, /game_id:\s*gameId/);
  assert.match(source, /\.eq\("guild_id",\s*DISCORD_GUILD_ID\)/);
  assert.match(source, /organization_id/);
  assert.doesNotMatch(source, /from\("organizations"\)/);
});

test("el handler resuelve event vía getSubcommandGroup", () => {
  assert.match(source, /getSubcommandGroup\(/);
  assert.match(source, /\bgroup\s*===?\s*["']event["']/);
});

test("set, sync y event create exigen admin; profile/live/join no", () => {
  // El gate admin no puede quedar al tope del handler: si no, profile/live/join
  // quedan inutilizables para miembros del piloto.
  const handlerStart = source.indexOf('client.on("interactionCreate"');
  assert.ok(handlerStart > 0);
  const handler = source.slice(handlerStart);
  const firstSub = handler.indexOf("getSubcommand(");
  const earlySlice = handler.slice(0, firstSub);
  assert.doesNotMatch(
    earlySlice,
    /if\s*\(\s*!isAdminMember/,
    "no debe haber gate admin global antes de despachar subcomandos",
  );
  assert.match(handler, /sub\s*===\s*"set"[\s\S]{0,200}?isAdminMember/);
  assert.match(handler, /sub\s*===\s*"sync"[\s\S]{0,200}?isAdminMember/);
  assert.match(handler, /eventSub\s*===\s*"create"[\s\S]{0,200}?isAdminMember/);
});
