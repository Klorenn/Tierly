import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), "utf8");
const page = read("tierly/index.html");
const app = read("tierly/app.js");

test("la navegación no ofrece Chess", () => {
  assert.doesNotMatch(app, /navChess/);
  assert.doesNotMatch(app, /data-view="chess"/);
});

test("la página no carga CSS ni scripts de ajedrez", () => {
  assert.doesNotMatch(page, /chessground/i);
  assert.doesNotMatch(page, /chess\.js/i);
  assert.doesNotMatch(page, /stockfish/i);
});

test("no queda el módulo chess.js en el árbol público", () => {
  const chessPath = fileURLToPath(new URL("tierly/chess.js", root));
  assert.equal(existsSync(chessPath), false);
});
