import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const functionSource = readFileSync(new URL("../supabase/functions/discord-verify/index.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../tierly/app.js", import.meta.url), "utf8");

test("community claim valida ownership server-side y usa auth.users.id", () => {
  assert.match(functionSource, /body\.action === ["']claim_community_admin["']/);
  assert.match(functionSource, /Deno\.env\.get\("DISCORD_GUILD_ID"\)/);
  assert.match(functionSource, /guild\.owner_id !== discordId/);
  assert.match(functionSource, /user_id: user\.id/);
  assert.match(functionSource, /guild_id: guildId/);
  assert.match(functionSource, /Authorization: `Bot \$\{botToken\}`/);
  assert.doesNotMatch(functionSource, /body\.guild_id|body\.owner_id|body\.owner/);
});

test("el frontend dispara el claim sin enviar guild_id", () => {
  assert.match(appSource, /action: "claim_community_admin"/);
  assert.doesNotMatch(appSource, /action: "claim_community_admin"[^}]*guild_id/);
});
