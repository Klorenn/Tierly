import { useMemo, useState } from "react";

import { DataTable, type Column } from "../components/DataTable";
import { GameLabel } from "../components/GameLabel";
import { TableSkeleton } from "../components/Skeleton";
import { formatNumber, isValidTimezone } from "../lib/format";
import { gameName } from "../lib/games";
import type { TierlyBridge } from "../lib/bridge";
import type { Suggestion } from "../lib/types";
import type { AdminState } from "../lib/useAdminData";

export interface SuggestionsSectionProps {
  readonly bridge: TierlyBridge;
  readonly admin: AdminState;
}

export function SuggestionsSection({ bridge, admin }: SuggestionsSectionProps) {
  const { games, suggestions, communities } = admin.data;
  const [busyId, setBusyId] = useState<number | null>(null);

  async function resolve(suggestion: Suggestion, status: "accepted" | "dismissed"): Promise<void> {
    setBusyId(suggestion.id);
    const supabase = bridge.supabase;
    const label = gameName(games, suggestion.game_id);

    // Aceptar crea el evento ANTES de marcar la sugerencia. Si el orden fuera el
    // inverso y la creación fallara, la sugerencia quedaría aceptada sin evento
    // y no habría forma de volver a ofrecerla.
    let message = "";
    if (status === "accepted") {
      const timezone = communities.find((c) => c.guild_id === suggestion.guild_id)?.timezone;
      const created = await supabase.rpc("tierly_create_event", {
        p_guild_id: suggestion.guild_id,
        p_name: `Evento de ${label}`,
        p_event_date: new Date().toISOString().slice(0, 10),
        p_starts_at: null,
        p_ends_at: null,
        p_timezone: isValidTimezone(timezone) ? timezone : null,
        p_location: null,
        p_luma_url: null,
        p_description: `Sugerencia para ${label}`,
      });
      if (created.error) {
        setBusyId(null);
        admin.setMessage(created.error.message);
        return;
      }
    }

    const updated = await supabase.rpc("tierly_update_suggestion_status", {
      p_suggestion_id: suggestion.id,
      p_status: status,
    });
    message = updated.error?.message ?? "";

    setBusyId(null);
    admin.setMessage(message);
    await admin.reload();
  }

  const columns = useMemo<ReadonlyArray<Column<Suggestion>>>(
    () => [
      {
        key: "game",
        header: "Juego",
        render: (row) => <GameLabel games={games} gameId={row.game_id} />,
        text: (row) => gameName(games, row.game_id),
      },
      {
        key: "players",
        header: "Jugadores",
        render: (row) => <span className="tla-num">{formatNumber(row.player_count)}</span>,
        text: (row) => String(row.player_count),
      },
      {
        key: "window",
        header: "Ventana",
        render: (row) => `${formatNumber(row.window_days)} días`,
        text: (row) => `${row.window_days} días`,
      },
      {
        key: "status",
        header: "Estado",
        render: (row) => <span className="tla-badge">{row.status}</span>,
        text: (row) => row.status,
      },
      {
        key: "actions",
        header: "Acción",
        render: (row) =>
          row.status === "pending" ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="tla-btn tla-btn-sm"
                disabled={busyId === row.id}
                onClick={() => void resolve(row, "accepted")}
              >
                Aceptar y crear
              </button>
              <button
                type="button"
                className="tla-btn tla-btn-ghost tla-btn-sm"
                disabled={busyId === row.id}
                onClick={() => void resolve(row, "dismissed")}
              >
                Descartar
              </button>
            </div>
          ) : (
            "—"
          ),
        text: () => "",
      },
    ],
    [games, busyId],
  );

  if (admin.loading && !suggestions.length) return <TableSkeleton />;

  return (
    <>
      <DataTable
        id="sugerencias"
        caption="Sugerencias de eventos"
        columns={columns}
        rows={suggestions}
        rowKey={(row) => String(row.id)}
        emptyMessage="No hay sugerencias generadas para esta comunidad."
      />
      <p className="tla-note">
        La sugerencia sólo informa cuántos jugadores distintos se observaron en la ventana. No hay
        score ni ranking: esas columnas no existen en <code>suggested_events</code>.
      </p>
    </>
  );
}
