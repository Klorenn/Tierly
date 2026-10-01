import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// La reconciliación existe porque `20260930130015` se aplicó al proyecto remoto
// con otra forma de tabla y otra firma de función que la que quedó en el repo.
// Estos tests están para que un refactor no borre la reconciliación creyendo que
// es redundante: sobre la base remota NO lo es.
const sql = readFileSync(
  new URL("../supabase/migrations/20261001020000_tierly_reconcile_event_series.sql", import.meta.url),
  "utf8",
);

test("alinea la forma de la tabla con la del repo", () => {
  assert.match(sql, /alter table public\.tierly_event_series drop column if exists name;/i);
  assert.match(sql, /alter table public\.tierly_event_series drop column if exists active;/i);
  assert.match(sql, /alter column timezone set default 'America\/Santiago'/i);
});

test("agrega el unique de first_event_id solo si falta", () => {
  assert.match(sql, /from pg_constraint/i);
  assert.match(sql, /add constraint tierly_event_series_first_event_id_key unique \(first_event_id\)/i);
});

test("elimina la sobrecarga vieja de cinco argumentos", () => {
  assert.match(sql, /drop function if exists public\.tierly_create_event_series\(text, uuid, text, text, text\);/i);
});

test("deja una sola firma de creación, la de diez argumentos", () => {
  assert.match(sql, /create or replace function public\.tierly_create_event_series\(/i);
  assert.match(sql, /grant execute on function public\.tierly_create_event_series\(text, text, date, timestamptz, timestamptz, text, text, text, text, text\) to authenticated/i);
  assert.doesNotMatch(sql, /create or replace function public\.tierly_create_event_series\(text, uuid/i);
});

test("la inserción en la serie no usa la columna name que se elimina", () => {
  assert.match(sql, /insert into public\.tierly_event_series \(guild_id, first_event_id, timezone, recurrence_rule\)/i);
  const insert = sql.slice(sql.indexOf("insert into public.tierly_event_series"));
  assert.doesNotMatch(insert.slice(0, 200), /\bname\b/i);
});

test("es idempotente: todo el DDL destructivo va condicionado", () => {
  const drops = [...sql.matchAll(/^\s*(alter table [^\n]*?drop column|drop function)[^\n]*$/gim)].map((m) => m[0]);
  assert.ok(drops.length >= 3);
  for (const line of drops) assert.match(line, /if exists/i, `sin "if exists": ${line.trim()}`);
});

test("el dollar-quote del DO no colisiona con el de la función", () => {
  assert.match(sql, /do \$reconcile\$/i);
  assert.equal((sql.match(/\$\$/g) || []).length, 2);
});
