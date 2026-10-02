import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../admin/lib/useAdminData.ts", import.meta.url), "utf8");
const events = readFileSync(new URL("../admin/sections/EventsSection.tsx", import.meta.url), "utf8");

// NOTA: la version anterior de este test evaluaba `tierly/admin.js` dentro de un
// `vm` con un DOM falso y comprobaba el `innerHTML` resultante. Con la isla de
// React eso ya no se puede sin jsdom. Lo que sigue verifica el MECANISMO que
// producia ese comportamiento, no el HTML: es mas debil que el test original y
// queda pendiente cubrirlo de punta a punta con un runner de DOM.

test("el ledger se consulta filtrado por jugador y por la comunidad seleccionada", () => {
  const ledger = hook.slice(hook.indexOf('.from("tierly_xp_ledger")'));
  assert.match(ledger, /\.eq\("player_id", player\.id\)/);
  assert.match(ledger, /\.eq\("guild_id", guildId\)/);
});

test("los totales de XP y stamps salen del ledger ya filtrado", () => {
  assert.match(events, /ledger\.reduce\(\(sum, row\) => sum \+ Number\(row\.xp \?\? 0\), 0\)/);
  assert.match(events, /ledger\.reduce\(\(sum, row\) => sum \+ Number\(row\.stamps \?\? 0\), 0\)/);
});

test("un cambio de comunidad durante la carga se reconcilia al terminar", () => {
  // El guard de reentrada descarta el segundo pedido, asi que lo que queda
  // pintado es de otra guild. Sin esta comparacion final quedan datos cruzados.
  assert.match(hook, /if \(requestedGuild\.current !== loadedGuild\.current\) \{\s*await load\(\);/);
  assert.match(hook, /const inFlight = useRef\(false\)/);
  assert.match(hook, /if \(inFlight\.current\) return;/);
});

test("toda salida temprana de load alinea la guild pedida con la cargada", () => {
  // Bug real: una salida temprana dejaba `loadedGuild` en null con
  // `requestedGuild` seteado, y la reconciliacion del final se llamaba a si
  // misma para siempre.
  const load = hook.slice(hook.indexOf("const load = useCallback"), hook.indexOf("const loadRef"));
  const exits = [...load.matchAll(/\n( *)return;/g)];
  assert.ok(exits.length >= 2, "se esperaban salidas tempranas en load()");
  for (const exit of exits) {
    const before = load.slice(0, exit.index);
    const previous = before.slice(before.lastIndexOf("\n", before.length - 1) + 1);
    assert.match(
      previous,
      /loadedGuild\.current = requestedGuild\.current;/,
      `una salida temprana de load() no alinea loadedGuild: "${previous.trim()}"`,
    );
  }
});
