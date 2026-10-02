import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const functionSource = readFileSync(new URL("../supabase/functions/discord-verify/index.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../tierly/app.js", import.meta.url), "utf8");

test("community claim resuelve la autoridad server-side y usa auth.users.id", () => {
  assert.match(functionSource, /body\.action === ["']claim_community_admin["']/);
  assert.match(functionSource, /Deno\.env\.get\("DISCORD_GUILD_ID"\)/);
  assert.match(functionSource, /user_id: user\.id/);
  assert.match(functionSource, /guild_id: guildId/);
  assert.match(functionSource, /Authorization: `Bot \$\{botToken\}`/);
  // El guild, el owner y los permisos salen de la API de Discord. Jamás del body.
  assert.doesNotMatch(functionSource, /body\.guild_id|body\.owner_id|body\.owner|body\.permissions/);
});

test("el owner del guild sigue teniendo autoridad", () => {
  assert.match(functionSource, /guild\.owner_id === discordId/);
});

test("un administrador basta: no se exige ser owner", () => {
  // Exigir ownership dejaba afuera a quien administra un guild que no creó, que es
  // el caso normal en comunidades con staff.
  assert.doesNotMatch(functionSource, /guild\.owner_id !== discordId/);
  assert.match(functionSource, /MANAGE_GUILD/);
  assert.match(functionSource, /ADMINISTRATOR/);
});

test("los bits de permiso se manejan con BigInt", () => {
  // El bitfield de Discord supera los 53 bits de Number: con Number se pierden bits
  // altos y la comprobación daría resultados silenciosamente falsos.
  assert.match(functionSource, /1n << 3n/);
  assert.match(functionSource, /1n << 5n/);
  assert.match(functionSource, /BigInt\(/);
  assert.doesNotMatch(functionSource, /parseInt\(\s*role\.permissions/);
});

test("los permisos efectivos combinan los roles del miembro", () => {
  assert.match(functionSource, /guilds\/\$\{guildId\}\/members\/\$\{discordId\}/);
  assert.match(functionSource, /member\.roles/);
  // @everyone tiene el id del guild y también aporta permisos.
  assert.match(functionSource, /role\.id === guildId/);
});

test("ADMINISTRATOR implica el resto de los permisos", () => {
  const claim = functionSource.slice(functionSource.indexOf('body.action === "claim_community_admin"'));
  assert.match(claim, /ADMINISTRATOR\) !== 0n/);
});

test("sigue respondiendo 403 cuando no hay autoridad suficiente", () => {
  const claim = functionSource.slice(functionSource.indexOf('body.action === "claim_community_admin"'));
  assert.match(claim, /\}, 403\)/);
});

test("el frontend dispara el claim sin enviar guild_id", () => {
  assert.match(appSource, /action: "claim_community_admin"/);
  assert.doesNotMatch(appSource, /action: "claim_community_admin"[^}]*guild_id/);
});
