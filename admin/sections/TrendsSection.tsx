import { useMemo } from "react";

import { DataTable, type Column } from "../components/DataTable";
import { TableSkeleton } from "../components/Skeleton";
import { formatNumber } from "../lib/format";
import type { AdminState } from "../lib/useAdminData";

interface DayTotals {
  day: string;
  players: number;
  minutes: number;
  sessions: number;
}

const columns: ReadonlyArray<Column<DayTotals>> = [
  { key: "day", header: "Día", render: (row) => row.day, text: (row) => row.day },
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
];

export function TrendsSection({ admin }: { readonly admin: AdminState }) {
  const rows = useMemo<DayTotals[]>(() => {
    const byDay = new Map<string, DayTotals>();
    for (const rollup of admin.data.rollups) {
      const entry = byDay.get(rollup.day) ?? {
        day: rollup.day,
        players: 0,
        minutes: 0,
        sessions: 0,
      };
      entry.players += Number(rollup.unique_players ?? 0);
      entry.minutes += Number(rollup.total_minutes ?? 0);
      entry.sessions += Number(rollup.session_count ?? 0);
      byDay.set(rollup.day, entry);
    }
    // Más reciente primero, acotado a 14 días como la versión original.
    return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day)).slice(0, 14);
  }, [admin.data.rollups]);

  if (admin.loading && !rows.length) return <TableSkeleton />;

  return (
    <>
      <DataTable
        id="tendencias"
        caption="Totales diarios de presencia"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.day}
        emptyMessage="Todavía no hay rollups diarios para esta comunidad."
      />
      <p className="tla-note">
        Presence tiene cobertura parcial: esta vista sólo representa los rollups diarios
        disponibles.
      </p>
    </>
  );
}
