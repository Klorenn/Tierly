import { Icon } from "./Icon";
import { findGame, gameIconName, gameName } from "../lib/games";
import type { Game, ObservedPlayer } from "../lib/types";

export interface GameLabelProps {
  readonly games: readonly Game[];
  readonly gameId: number | string;
}

export function GameLabel({ games, gameId }: GameLabelProps) {
  return (
    <span className="tla-game">
      <Icon className="tla-game-icon" name={gameIconName(findGame(games, gameId))} />
      <span>{gameName(games, gameId)}</span>
    </span>
  );
}

export function PlayerChip({ player }: { readonly player: ObservedPlayer }) {
  const name = player.display_name ?? "Sin nombre";
  return (
    <span className="tla-chip">
      {player.avatar_url && <img src={player.avatar_url} alt="" />}
      <span>{name}</span>
    </span>
  );
}
