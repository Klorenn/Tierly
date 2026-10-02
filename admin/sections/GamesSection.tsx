import { useMemo } from "react";

import { DataTable, type Column } from "../components/DataTable";
import { GameLabel, PlayerChip } from "../components/GameLabel";
import { TableSkeleton } from "../components/Skeleton";
import { formatNumber } from "../lib/format";
import { gameName } from "../lib/games";
import type { Game, ObservedPlayer } from "../lib/types";
import type { AdminState } from "../lib/useAdminData";

interface GameTotals {
  gameId: number;
  days: number;
  players: number;
  minutes: number;
  sessions: number;
  observed: ObservedPlayer[];
}

function groupByGame(players: readonly ObservedPlayer[]): Map<number, ObservedPlayer[]> {
  const groups = new Map<number, ObservedPlayer[]>();
  for (const player of players) {
    const bucket = groups.get(player.game_id) ?? [];
    bucket.push(player);
    groups.set(player.game_id, bucket);
  }
  return groups;
}

function PresenceGroups({
  games,
  players,
}: {
  readonly games: readonly Game[];
  readonly players: readonly ObservedPlayer[];
}) {
  const groups = [...groupByGame(players).entries()];
  return (
    <div className="tla-grid">
      {groups.map(([gameId, rows]) => (
        <article key={gameId} className="tla-card">
          <h3
            style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}
          >
            <GameLabel games={games} gameId={gameId} />
            <span className="tla-num">{formatNumber(rows.length)}</span>
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {rows.map((player, index) => (
              <PlayerChip key={`${player.display_name ?? "?"}-${index}`} player={player} />
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

export function GamesSection({ admin }: { readonly admin: AdminState }) {
  const { games, rollups, observedPlayers } = admin.data;

  const active = useMemo(() => observedPlayers.filter((p) => p.is_active), [observedPlayers]);
  const historical = useMemo(() => observedPlayers.filter((p) => !p.is_active), [observedPlayers]);

  const rows = useMemo<GameTotals[]>(() => {
    const byGame = new Map<number, GameTotals>();
    for (const rollup of rollups) {
      const entry = byGame.get(rollup.game_id) ?? {
        gameId: rollup.game_id,
        days: 0,
        players: 0,
        minutes: 0,
        sessions: 0,
        observed: [],
      };
      entry.days += 1;
      entry.players += Number(rollup.unique_players ?? 0);
      entry.minutes += Number(rollup.total_minutes ?? 0);
      entry.sessions += Number(rollup.session_count ?? 0);
      byGame.set(rollup.game_id, entry);
    }
    const grouped = groupByGame(observedPlayers);
    for (const entry of byGame.values()) {
      entry.observed = grouped.get(entry.gameId) ?? [];
    }
    return [...byGame.values()].sort((a, b) => b.minutes - a.minutes);
  }, [rollups, observedPlayers]);

  const columns = useMemo<ReadonlyArray<Column<GameTotals>>>(
    () => [
      {
        key: "game",
        header: "Juego",
        render: (row) => <GameLabel games={games} gameId={row.gameId} />,
        text: (row) => gameName(games, row.gameId),
      },
      {
        key: "days",
        header: "Días con datos",
        render: (row) => <span className="tla-num">{formatNumber(row.days)}</span>,
        text: (row) => String(row.days),
      },
      {
        key: "players",
        header: "Jugadores",
        render: (row) => <span className="tla-num">{formatNumber(row.players)}</span>,
        text: (row) => String(row.players),
      },
      {
        key: "minutes",
        header: "Minutos",
        render: (row) => <span className="tla-num">{formatNumber(row.minutes)}</span>,
        text: (row) => String(row.minutes),
      },
      {
        key: "sessions",
        header: "Sesiones",
        render: (row) => <span className="tla-num">{formatNumber(row.sessions)}</span>,
        text: (row) => String(row.sessions),
      },
      {
        key: "observed",
        header: "Observados",
        render: (row) => (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {row.observed.length
              ? row.observed.map((player, index) => (
                  <PlayerChip key={`${player.display_name ?? "?"}-${index}`} player={player} />
                ))
              : "—"}
          </div>
        ),
        text: (row) => row.observed.map((p) => p.display_name ?? "Sin nombre").join(" / "),
      },
    ],
    [games],
  );

  if (admin.loading && !rows.length) return <TableSkeleton />;

  return (
    <>
      <section>
        <h3 style={{ marginBottom: 12 }}>Jugando ahora</h3>
        {active.length ? (
          <PresenceGroups games={games} players={active} />
        ) : (
          <p className="tla-empty">Nadie está jugando en este momento.</p>
        )}
      </section>

      <DataTable
        id="juegos"
        caption="Agregados por juego"
        columns={columns}
        rows={rows}
        rowKey={(row) => String(row.gameId)}
        emptyMessage="Todavía no hay actividad agregada para esta comunidad."
      />

      {historical.length > 0 && (
        <section>
          <h3 style={{ marginBottom: 12 }}>Histórico</h3>
          <PresenceGroups games={games} players={historical} />
        </section>
      )}
    </>
  );
}
