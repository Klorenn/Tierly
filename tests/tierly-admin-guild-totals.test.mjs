import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../tierly/admin.js", import.meta.url), "utf8");

test("el progreso confirmado corresponde a la comunidad seleccionada al cambiarla", async () => {
  const rows = {
    community_admins: [{ guild_id: "guild-a", role: "admin" }, { guild_id: "guild-b", role: "admin" }],
    communities: [{ guild_id: "guild-a", name: "A" }, { guild_id: "guild-b", name: "B" }],
    gaming_events: [],
    gaming_players: [{ id: "player-1", auth_user_id: "user-1" }],
    tierly_xp_ledger: [
      { player_id: "player-1", guild_id: "guild-a", xp: 10, stamps: 1 },
      { player_id: "player-1", guild_id: "guild-b", xp: 20, stamps: 2 },
    ],
    games: [],
    daily_game_rollups: [],
    suggested_events: [],
    tierly_admin_game_players: [],
  };
  const listeners = new Map();
  let delayGuildA = false;
  let releaseGuildA;
  const content = { innerHTML: "" };
  const root = {
    innerHTML: "",
    closest: () => ({ setAttribute() {} }),
    querySelector(selector) {
      if (selector === "#tierly-admin-content") return content;
      if (selector === "#tierly-admin-directory" || selector === "#tierly-event-form") return null;
      return { addEventListener(event, listener) { listeners.set(`${selector}:${event}`, listener); } };
    },
    querySelectorAll: () => [],
  };
  const from = (table) => {
    let matches = [...(rows[table] || [])];
    const filters = {};
    const query = {
      select: () => query,
      eq(column, value) { filters[column] = value; matches = matches.filter((row) => row[column] === value); return query; },
      in(column, values) { matches = matches.filter((row) => values.includes(row[column])); return query; },
      order: () => query,
      maybeSingle: async () => ({ data: matches[0] || null, error: null }),
      then(resolve, reject) {
        const result = { data: matches, error: null };
        const pending = table === "gaming_events" && filters.guild_id === "guild-a" && delayGuildA
          ? new Promise((done) => { releaseGuildA = () => done(result); })
          : Promise.resolve(result);
        return pending.then(resolve, reject);
      },
    };
    return query;
  };
  const context = {
    window: {
      TierlyBridge: {
        supabase: { from, auth: { getSession: async () => ({ data: { session: { user: { id: "user-1" } } } }), onAuthStateChange() {} } },
        switchView() {},
      },
      location: { origin: "https://example.test" },
    },
    document: { querySelector: () => root, addEventListener() {} },
    location: { pathname: "/tierly/admin", search: "" },
    URLSearchParams,
    Intl,
    Date,
  };
  vm.runInNewContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(content.innerHTML, /<strong>10 XP<\/strong><span>1 stamps confirmados<\/span>/);

  listeners.get("#tierly-admin-community:change")({ target: { value: "1" } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(content.innerHTML, /<strong>20 XP<\/strong><span>2 stamps confirmados<\/span>/);

  listeners.get("#tierly-admin-community:change")({ target: { value: "0" } });
  await new Promise((resolve) => setImmediate(resolve));
  delayGuildA = true;
  listeners.get("#tierly-admin-refresh:click")();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof releaseGuildA, "function");
  listeners.get("#tierly-admin-community:change")({ target: { value: "1" } });
  assert.match(content.innerHTML, /Cargando comunidad/);
  assert.doesNotMatch(content.innerHTML, /10 XP/);
  delayGuildA = false;
  releaseGuildA();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(content.innerHTML, /<strong>20 XP<\/strong><span>2 stamps confirmados<\/span>/);
});
