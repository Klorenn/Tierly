import type { Game } from "./types";

const FALLBACK_ICONS = [
  "gamepad-2",
  "trophy",
  "puzzle",
  "target",
  "zap",
  "rocket",
  "dice-5",
  "swords",
] as const;

const KEYWORD_ICONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/chess|ajedrez/, "crown"],
  [/racer|race|carrera/, "flag"],
  [/card|carta|poker/, "layers"],
  [/word|palabra/, "type"],
  [/quiz|trivia/, "circle-help"],
  [/puzzle/, "puzzle"],
  [/sport|futbol|football/, "medal"],
];

/**
 * Icono de Lucide para un juego. No hay columna de icono en `public.games`, asi
 * que se deriva del nombre: primero por palabra clave y si no, por hash estable
 * del nombre. El hash importa que sea estable, no que sea bonito: el mismo juego
 * tiene que mostrar siempre el mismo icono entre recargas.
 */
export function gameIconName(game: Pick<Game, "canonical_name" | "display_name"> | undefined): string {
  const text = `${game?.canonical_name ?? ""} ${game?.display_name ?? ""}`.toLowerCase();
  const matched = KEYWORD_ICONS.find(([pattern]) => pattern.test(text));
  if (matched) return matched[1];

  const hash = [...text].reduce((total, char) => ((total * 31 + char.charCodeAt(0)) >>> 0), 0);
  return FALLBACK_ICONS[hash % FALLBACK_ICONS.length] ?? "gamepad-2";
}

export function findGame(games: readonly Game[], id: number | string): Game | undefined {
  return games.find((game) => String(game.id) === String(id));
}

export function gameName(games: readonly Game[], id: number | string): string {
  return findGame(games, id)?.display_name ?? `Juego ${id}`;
}
