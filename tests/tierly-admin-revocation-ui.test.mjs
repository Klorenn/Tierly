import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const admin = readFileSync(new URL("../tierly/admin.js", import.meta.url), "utf8");

test("la consulta de asistencia trae el estado de revocación", () => {
  assert.match(admin, /select\("event_id, player_id, registered_at, unregistered_at, checked_in_at, confirmed_at, revoked_at, revocation_reason"\)/);
});

test("el estado revocado se muestra antes que el confirmado", () => {
  // Una asistencia revocada conserva `confirmed_at`, así que el orden importa:
  // si se evalúa `confirmed_at` primero, nunca se vería "Revocada".
  const revoked = admin.indexOf('row.revoked_at ? "Revocada"');
  const confirmed = admin.indexOf('row.confirmed_at ? "Confirmada"');
  assert.ok(revoked !== -1, "falta la etiqueta Revocada");
  assert.ok(confirmed !== -1, "falta la etiqueta Confirmada");
  assert.ok(revoked < confirmed, "Revocada debe evaluarse antes que Confirmada");
});

test("ofrece revocar sólo sobre una confirmación vigente", () => {
  assert.match(admin, /data-event-action="revoke"/);
  assert.match(admin, /row\.confirmed_at && !row\.revoked_at/);
});

test("el motivo se pide con un input inline, no con prompt()", () => {
  assert.match(admin, /data-revoke-reason="\$\{esc\(row\.player_id\)\}"/);
  assert.doesNotMatch(admin, /\bprompt\(/);
});

test("permite reconfirmar después de una revocación", () => {
  assert.match(admin, /row\.revoked_at && row\.checked_in_at/);
});

test("revoke envía el motivo a la RPC auditada", () => {
  assert.match(admin, /revoke: "tierly_revoke_event_confirmation"/);
  assert.match(admin, /args\.p_reason/);
});

test("no llama a la RPC con motivo vacío", () => {
  const fn = admin.slice(admin.indexOf("async function eventAction"), admin.indexOf("async function load"));
  assert.match(fn, /if \(!args\.p_reason\)/);
  assert.match(fn, /return;/);
  // El guard debe ir antes del rpc, no después.
  assert.ok(fn.indexOf("args.p_reason") < fn.indexOf("await supabase.rpc"));
});

test("todos los módulos comparten la misma versión de caché", () => {
  const page = readFileSync(new URL("../tierly/index.html", import.meta.url), "utf8");
  const versions = [...page.matchAll(/src="\/tierly\/(?:app|chess|admin|discover)\.js\?v=([^"']+)/g)].map((m) => m[1]);
  assert.equal(versions.length, 4);
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
