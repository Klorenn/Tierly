import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adminSource } from "./helpers/admin-source.mjs";

const admin = adminSource;

test("la consulta de asistencia trae el estado de revocación", () => {
  assert.match(
    admin,
    /"event_id, player_id, registered_at, unregistered_at, checked_in_at, confirmed_at, revoked_at, revocation_reason"/,
  );
});

test("el estado revocado se muestra antes que el confirmado", () => {
  // Una asistencia revocada conserva `confirmed_at`, así que el orden importa:
  // si se evalúa `confirmed_at` primero, nunca se vería "Revocada".
  const revoked = admin.indexOf('row.revoked_at) return "Revocada"');
  const confirmed = admin.indexOf('row.confirmed_at) return "Confirmada"');
  assert.ok(revoked !== -1, "falta la etiqueta Revocada");
  assert.ok(confirmed !== -1, "falta la etiqueta Confirmada");
  assert.ok(revoked < confirmed, "Revocada debe evaluarse antes que Confirmada");
});

test("ofrece revocar sólo sobre una confirmación vigente", () => {
  assert.match(admin, /const canRevoke = Boolean\(row\.confirmed_at\) && !row\.revoked_at/);
  assert.match(admin, /\{canRevoke && \(/);
});

test("el motivo se pide con un campo inline por jugador, no con prompt()", () => {
  // Un textarea compartido haría que revocar a uno arrastre el motivo del otro,
  // así que el estado va indexado por `player_id`.
  assert.match(admin, /reasons\[row\.player_id\]/);
  assert.match(admin, /\[row\.player_id\]: event\.target\.value/);
  assert.doesNotMatch(admin, /\bprompt\(/);
});

test("permite reconfirmar después de una revocación", () => {
  assert.match(
    admin,
    /const canReconfirm = Boolean\(row\.revoked_at\) && Boolean\(row\.checked_in_at\)/,
  );
  assert.match(admin, /canReconfirm \? "Reconfirmar" : "Confirmar"/);
});

test("revoke envía el motivo a la RPC auditada", () => {
  assert.match(admin, /rpc\("tierly_revoke_event_confirmation"/);
  assert.match(admin, /p_reason: reason/);
});

test("no llama a la RPC con motivo vacío", () => {
  const start = admin.indexOf("async function revoke(");
  assert.ok(start !== -1, "falta la función revoke");
  const fn = admin.slice(start, admin.indexOf("function AttendeeRow", start));
  assert.match(fn, /if \(!reason\) \{/);
  // El guard debe ir antes del rpc, no después.
  assert.ok(fn.indexOf("if (!reason)") < fn.indexOf("await supabase.rpc"));
});

test("todos los módulos comparten la misma versión de caché", () => {
  const page = readFileSync(new URL("../tierly/index.html", import.meta.url), "utf8");
  const versions = [...page.matchAll(/src="\/tierly\/(?:app|discover|admin-app\/admin)\.js\?v=([^"']+)/g)].map((m) => m[1]);
  assert.equal(versions.length, 3);
  assert.equal(new Set(versions).size, 1, `versiones desalineadas: ${versions.join(", ")}`);
});

test("el 403 esperado del claim se lee de context.status, no de error.status", () => {
  // supabase-js v2 no pone `.status` en FunctionsHttpError: expone `.context`, que
  // es el Response. Leer `.status` daba undefined, el guard nunca silenciaba el 403
  // de "no sos dueña del guild" y se logueaba un fallo que no era fallo.
  const app = readFileSync(new URL("../tierly/app.js", import.meta.url), "utf8");
  assert.match(app, /claim\.error\.context\?\.status !== 403/);
  assert.doesNotMatch(app, /claim\.error\.status !== 403/);
});
