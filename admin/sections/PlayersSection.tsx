import { useMemo } from "react";

import { DataTable, type Column } from "../components/DataTable";
import { GameLabel, PlayerChip } from "../components/GameLabel";
import { StatSkeleton, TableSkeleton } from "../components/Skeleton";
import { formatNumber } from "../lib/format";
import type { Game, ObservedPlayer } from "../lib/types";
import type { AdminState } from "../lib/useAdminData";

interface GameRoster {
  game: Game;
  players: ObservedPlayer[];
}

export function PlayersSection({ admin }: { readonly admin: AdminState }) {
  const { games, observedPlayers } = admin.data;

  const rows = useMemo<GameRoster[]>(
    () =>
      games
        .map((game) => ({
          game,
          players: observedPlayers.filter((p) => String(p.game_id) === String(game.id)),
        }))
        // Un juego sin jugadores observados no aporta nada a esta vista.
        .filter((row) => row.players.length > 0)
        .sort((a, b) => b.players.length - a.players.length),
    [games, observedPlayers],
  );

  const columns = useMemo<ReadonlyArray<Column<GameRoster>>>(
    () => [
      {
        key: "game",
        header: "Juego",
        render: (row) => <GameLabel games={games} gameId={row.game.id} />,
        text: (row) => row.game.display_name,
      },
      {
        key: "count",
        header: "Observados",
        render: (row) => <span className="tla-num">{formatNumber(row.players.length)}</span>,
        text: (row) => String(row.players.length),
      },
      {
        key: "players",
        header: "Jugadores",
        render: (row) => (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {row.players.map((player, index) => (
              <PlayerChip key={`${player.display_name ?? "?"}-${index}`} player={player} />
            ))}
          </div>
        ),
        text: (row) => row.players.map((p) => p.display_name ?? "Sin nombre").join(" / "),
      },
    ],
    [games],
  );

  if (admin.loading && !observedPlayers.length) {
    return (
      <>
        <StatSkeleton />
        <TableSkeleton />
      </>
    );
  }

  const activeCount = observedPlayers.filter((p) => p.is_active).length;

  return (
    <>
      <div className="tla-grid">
        <div className="tla-stat">
          <strong>{formatNumber(observedPlayers.length)}</strong>
          <span>jugadores observados</span>
        </div>
        <div className="tla-stat">
          <strong>{formatNumber(activeCount)}</strong>
          <span>jugando ahora</span>
        </div>
        <div className="tla-stat">
          <strong>{formatNumber(rows.length)}</strong>
          <span>juegos con actividad</span>
        </div>
      </div>

      <DataTable
        id="jugadores"
        caption="Jugadores observados por juego"
        columns={columns}
        rows={rows}
        rowKey={(row) => String(row.game.id)}
        emptyMessage="Todavía no se observó presencia en esta comunidad."
      />
    </>
  );
}
