import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../supabase/migrations/20261001030000_tierly_audited_revocation.sql", import.meta.url),
  "utf8",
);

test("libera el check que impedía stamps negativos", () => {
  // La reversión es una fila compensatoria, no un update: necesita stamps < 0.
  // Se busca por definición y no por nombre: el check se creó anónimo.
  assert.match(sql, /from pg_constraint/i);
  assert.match(sql, /pg_get_constraintdef\(oid\) = 'CHECK \(\(stamps >= 0\)\)'/);
  assert.match(sql, /drop constraint if exists %I/i);
});

test("el ledger queda append-only y trazable", () => {
  for (const col of ["reverses_ledger_id", "actor_id", "note"]) {
    assert.match(sql, new RegExp(`add column if not exists ${col}\\b`, "i"), `falta ${col}`);
  }
  assert.match(sql, /references public\.tierly_xp_ledger\(id\)/i);
  // Una fila sólo se puede revertir una vez. Índice y no constraint, porque
  // `add constraint` no acepta `if not exists` y la migración debe ser idempotente.
  assert.match(sql, /create unique index if not exists tierly_xp_ledger_reverses_key/i);
});

test("la asistencia registra motivo, emisor e instante de la revocación", () => {
  for (const col of ["revoked_at", "revoked_by", "revocation_reason", "confirmation_seq"]) {
    assert.match(sql, new RegExp(`add column if not exists ${col}\\b`, "i"), `falta ${col}`);
  }
});

test("revocar exige administrador de la guild y motivo no vacío", () => {
  const fn = sql.slice(sql.indexOf("function public.tierly_revoke_event_confirmation"));
  assert.match(fn, /public\.is_community_admin\(v_guild\)/i);
  assert.match(fn, /nullif\(trim\(p_reason\), ''\)/i);
  assert.match(fn, /raise exception/i);
});

test("la reversión compensa con signo opuesto y apunta a la fila original", () => {
  const fn = sql.slice(sql.indexOf("function public.tierly_revoke_event_confirmation"));
  assert.match(fn, /-v_xp\b/);
  assert.match(fn, /-v_stamps\b/);
  assert.match(fn, /reverses_ledger_id/i);
  assert.match(fn, /'event_attendance_reversal'/);
  // Nunca borra ni modifica la fila original.
  assert.doesNotMatch(fn, /delete from public\.tierly_xp_ledger/i);
  assert.doesNotMatch(fn, /update public\.tierly_xp_ledger/i);
});

test("revocar dos veces no duplica la reversión", () => {
  const fn = sql.slice(sql.indexOf("function public.tierly_revoke_event_confirmation"));
  assert.match(fn, /revoked_at is null/i);
  assert.match(fn, /on conflict .*idempotency_key\) do nothing/i);
});

test("re-confirmar después de revocar vuelve a otorgar: la clave incluye la secuencia", () => {
  const fn = sql.slice(sql.indexOf("function public.tierly_confirm_event_attendance"));
  assert.match(fn, /confirmation_seq/i);
  // El sufijo de secuencia se agrega SÓLO si v_seq > 0: la secuencia 0 conserva el
  // formato viejo de la clave para no re-otorgar lo ya aplicado en producción.
  assert.match(fn, /v_key = 'event-attendance:' \|\| p_event_id::text \|\| ':' \|\| p_player_id::text;/);
  assert.match(fn, /if v_seq > 0 then\s*\n\s*v_key = v_key \|\| ':' \|\| v_seq::text;/);
});

test("la confirmación limpia el estado de revocación anterior", () => {
  const fn = sql.slice(sql.indexOf("function public.tierly_confirm_event_attendance"));
  assert.match(fn, /revoked_at = null/i);
  assert.match(fn, /revocation_reason = null/i);
});

test("ambas funciones son security definer con search_path vacío", () => {
  const defs = [...sql.matchAll(/create or replace function public\.(tierly_\w+)\([^)]*\)\s*returns[\s\S]{0,200}?as \$\$/gi)];
  assert.ok(defs.length >= 2, `esperaba 2 funciones, hay ${defs.length}`);
  for (const d of defs) {
    assert.match(d[0], /security definer/i, `${d[1]} sin security definer`);
    assert.match(d[0], /set search_path = ''/i, `${d[1]} sin search_path vacío`);
  }
});

test("revoca el execute de public/anon y lo concede sólo a authenticated", () => {
  assert.match(sql, /revoke all on function public\.tierly_revoke_event_confirmation\(uuid, uuid, text\) from public, anon;/i);
  assert.match(sql, /grant execute on function public\.tierly_revoke_event_confirmation\(uuid, uuid, text\) to authenticated;/i);
});

test("todo el DDL es idempotente", () => {
  const ddl = [...sql.matchAll(/^\s*alter table [^\n]*(add column|drop constraint)[^\n]*$/gim)].map((m) => m[0]);
  assert.ok(ddl.length >= 7, `esperaba >=7 lineas de DDL, hay ${ddl.length}`);
  for (const line of ddl) {
    assert.match(line, /if (not )?exists/i, `sin guarda de existencia: ${line.trim()}`);
  }
  // No queda ningun `add constraint` suelto: no es idempotente en Postgres.
  assert.doesNotMatch(sql, /^\s*alter table [^\n]*add constraint/im);
});
