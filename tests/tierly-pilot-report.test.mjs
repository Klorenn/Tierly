import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";

const migration = await readFile(new URL("../supabase/migrations/20260930230000_tierly_pilot_report.sql", import.meta.url), "utf8");
const command = await readFile(new URL("../scripts/tierly-pilot-report.sql", import.meta.url), "utf8");
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

test("el reporte cubre todas las métricas agregadas del piloto", () => {
  for (const field of ["health", "sessions_by_closed_reason", "active_games", "rollups", "suggestions", "events", "attendance", "xp_stamps", "heartbeat_age_seconds", "registrations", "check_ins", "confirmations", "xp", "stamps"]) {
    assert.match(migration, new RegExp(`['"]${field}['"]`));
  }
});

test("la RPC solo puede ejecutarse con service_role y no proyecta identidades", () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = public/i);
  assert.match(migration, /revoke all on function public\.tierly_pilot_report\(\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.tierly_pilot_report\(\) to service_role/i);
  assert.doesNotMatch(migration, /player_id|user_id|discord_user_id|display_name|canonical_name/i);
});

test("el comando y la documentación advierten el uso exclusivo de service_role", () => {
  assert.match(command, /service_role/i);
  assert.match(readme, /tierly_pilot_report/);
  assert.match(readme, /publishable key/i);
});
