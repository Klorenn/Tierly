import { useMemo, useState } from "react";

import { TableSkeleton } from "../components/Skeleton";
import { COMMON_TIMEZONES, formatEventWhen, formatNumber, isValidTimezone, localDateTimeToUtc } from "../lib/format";
import { attendanceState } from "../lib/types";
import type { TierlyBridge } from "../lib/bridge";
import type { AttendanceRow, CommunityEvent } from "../lib/types";
import type { AdminState } from "../lib/useAdminData";

export interface EventsSectionProps {
  readonly bridge: TierlyBridge;
  readonly admin: AdminState;
}

export function EventsSection({ bridge, admin }: EventsSectionProps) {
  const { events, attendance, communities, isAdmin, ledger } = admin.data;
  const supabase = bridge.supabase;

  const [busy, setBusy] = useState(false);
  // El motivo de revocación es por jugador: un textarea compartido haría que
  // revocar a uno arrastre el motivo escrito para otro.
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const timezoneOptions = useMemo(() => {
    const fromCommunities = communities
      .map((community) => community.timezone)
      .filter(isValidTimezone);
    return [...new Set([...fromCommunities, ...COMMON_TIMEZONES])];
  }, [communities]);

  const totals = useMemo(
    () => ({
      xp: ledger.reduce((sum, row) => sum + Number(row.xp ?? 0), 0),
      stamps: ledger.reduce((sum, row) => sum + Number(row.stamps ?? 0), 0),
    }),
    [ledger],
  );

  async function createEvent(form: HTMLFormElement): Promise<void> {
    const values = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const timezone = values["timezone"] ?? "";
    const name = (values["name"] ?? "").trim();
    const startsLocal = values["starts_at"] ?? "";

    if (!isValidTimezone(timezone) || !name || !startsLocal) {
      admin.setMessage("La zona horaria, el nombre y la fecha de inicio son obligatorios.");
      return;
    }

    const startsAt = localDateTimeToUtc(startsLocal, timezone);
    const endsLocal = values["ends_at"] ?? "";
    const endsAt = endsLocal ? localDateTimeToUtc(endsLocal, timezone) : null;

    // El fin anterior al inicio se corta acá: la RPC no lo valida.
    if (!startsAt || (endsLocal && (!endsAt || new Date(endsAt) < new Date(startsAt)))) {
      admin.setMessage("El horario del evento no es válido.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.rpc("tierly_create_event", {
      p_guild_id: admin.selectedGuildId,
      p_name: name,
      p_event_date: startsLocal.slice(0, 10),
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_timezone: timezone,
      p_location: values["location"] || null,
      p_luma_url: values["luma_url"] || null,
      p_description: values["description"] || null,
    });
    setBusy(false);
    admin.setMessage(error?.message ?? "");
    if (!error) form.reset();
    await admin.reload();
  }

  async function selfAction(
    eventId: string,
    action: "register" | "unregister" | "checkin",
  ): Promise<void> {
    const rpc =
      action === "register"
        ? "tierly_register_event"
        : action === "unregister"
          ? "tierly_unregister_event"
          : "tierly_check_in_event";

    setBusy(true);
    const { error } = await supabase.rpc(rpc, { p_event_id: eventId });
    setBusy(false);
    admin.setMessage(error?.message ?? "");
    await admin.reload();
  }

  async function confirm(eventId: string, playerId: string): Promise<void> {
    setBusy(true);
    const { error } = await supabase.rpc("tierly_confirm_event_attendance", {
      p_event_id: eventId,
      p_player_id: playerId,
    });
    setBusy(false);
    admin.setMessage(error?.message ?? "");
    await admin.reload();
  }

  async function revoke(eventId: string, playerId: string): Promise<void> {
    const reason = (reasons[playerId] ?? "").trim();
    // Sin motivo no hay auditoría. La RPC también lo rechaza, pero no vale el viaje.
    if (!reason) {
      admin.setMessage("Indicá el motivo de la revocación.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.rpc("tierly_revoke_event_confirmation", {
      p_event_id: eventId,
      p_player_id: playerId,
      p_reason: reason,
    });
    setBusy(false);
    admin.setMessage(error?.message ?? "");
    if (!error) setReasons((prev) => ({ ...prev, [playerId]: "" }));
    await admin.reload();
  }

  function AttendeeRow({ event, row }: { event: CommunityEvent; row: AttendanceRow }) {
    const state = attendanceState(row);
    const canConfirm = !row.confirmed_at && Boolean(row.checked_in_at);
    const canReconfirm = Boolean(row.revoked_at) && Boolean(row.checked_in_at);
    const canRevoke = Boolean(row.confirmed_at) && !row.revoked_at;

    return (
      <li className="tla-card" style={{ display: "grid", gap: 8, padding: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span>{row.is_current_user ? "Vos" : "Participante"}</span>
          <span className="tla-badge" data-state={state}>
            {state}
          </span>
        </div>

        {row.revoked_at && row.revocation_reason && (
          <p className="tla-note">Motivo: {row.revocation_reason}</p>
        )}

        {isAdmin && (canConfirm || canReconfirm || canRevoke) && (
          <div style={{ display: "grid", gap: 8 }}>
            {canRevoke && (
              <label className="tla-field">
                Motivo de la revocación
                <textarea
                  maxLength={200}
                  value={reasons[row.player_id] ?? ""}
                  onChange={(event) =>
                    setReasons((prev) => ({ ...prev, [row.player_id]: event.target.value }))
                  }
                />
              </label>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(canConfirm || canReconfirm) && (
                <button
                  type="button"
                  className="tla-btn tla-btn-sm"
                  disabled={busy}
                  onClick={() => void confirm(event.id, row.player_id)}
                >
                  {canReconfirm ? "Reconfirmar" : "Confirmar"}
                </button>
              )}
              {canRevoke && (
                <button
                  type="button"
                  className="tla-btn tla-btn-danger tla-btn-sm"
                  disabled={busy}
                  onClick={() => void revoke(event.id, row.player_id)}
                >
                  Revocar
                </button>
              )}
            </div>
          </div>
        )}
      </li>
    );
  }

  function EventCard({ event }: { event: CommunityEvent }) {
    const rows = attendance.filter((row) => String(row.event_id) === String(event.id));
    const mine = rows.find((row) => row.is_current_user);

    const canLeave = Boolean(mine && !mine.unregistered_at && !mine.checked_in_at && !mine.confirmed_at);
    const canRegister = !mine || Boolean(mine.unregistered_at && !mine.confirmed_at);
    const canCheckIn = Boolean(mine && !mine.unregistered_at && !mine.checked_in_at && !mine.confirmed_at);
    const communityName = communities.find((c) => c.guild_id === event.guild_id)?.name ?? "Comunidad";

    return (
      <article className="tla-card" style={{ display: "grid", gap: 12 }}>
        <div>
          <p className="tla-kicker">{communityName}</p>
          <h3>{event.name}</h3>
          <p className="tla-note">
            {formatEventWhen(event)} · {event.location ?? "Sin ubicación"}
          </p>
          {event.description && <p style={{ marginTop: 8 }}>{event.description}</p>}
        </div>

        {admin.session && (canLeave || canRegister || canCheckIn) && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(canLeave || canRegister) && (
              <button
                type="button"
                className="tla-btn tla-btn-ghost tla-btn-sm"
                disabled={busy}
                onClick={() => void selfAction(event.id, canLeave ? "unregister" : "register")}
              >
                {canLeave ? "Salir" : "Registrarme"}
              </button>
            )}
            {canCheckIn && (
              <button
                type="button"
                className="tla-btn tla-btn-sm"
                disabled={busy}
                onClick={() => void selfAction(event.id, "checkin")}
              >
                Check-in
              </button>
            )}
          </div>
        )}

        <details>
          <summary>
            Asistentes ({formatNumber(rows.filter((row) => !row.unregistered_at).length)})
          </summary>
          <ul style={{ display: "grid", gap: 8, marginTop: 12, listStyle: "none" }}>
            {rows.length ? (
              rows.map((row) => (
                <AttendeeRow key={`${row.event_id}-${row.player_id}`} event={event} row={row} />
              ))
            ) : (
              <li className="tla-empty">Nadie se registró todavía.</li>
            )}
          </ul>
        </details>
      </article>
    );
  }

  if (admin.loading && !events.length) return <TableSkeleton rows={3} />;

  return (
    <>
      <div className="tla-grid">
        <div className="tla-stat">
          <strong>{formatNumber(totals.xp)}</strong>
          <span>XP acumulado</span>
        </div>
        <div className="tla-stat">
          <strong>{formatNumber(totals.stamps)}</strong>
          <span>stamps confirmados</span>
        </div>
        <div className="tla-stat">
          <strong>{formatNumber(events.length)}</strong>
          <span>eventos de la comunidad</span>
        </div>
      </div>

      {isAdmin && (
        <section className="tla-card">
          <h3 style={{ marginBottom: 16 }}>Crear evento</h3>
          <form
            className="tla-form"
            onSubmit={(event) => {
              event.preventDefault();
              void createEvent(event.currentTarget);
            }}
          >
            <label className="tla-field">
              Zona horaria
              <select name="timezone" required defaultValue={timezoneOptions[0] ?? "UTC"}>
                {timezoneOptions.map((timezone) => (
                  <option key={timezone} value={timezone}>
                    {timezone}
                  </option>
                ))}
              </select>
            </label>
            <label className="tla-field">
              Nombre
              <input name="name" required maxLength={160} />
            </label>
            <label className="tla-field">
              Fecha y hora local
              <input name="starts_at" type="datetime-local" required />
            </label>
            <label className="tla-field">
              Fin local
              <input name="ends_at" type="datetime-local" />
            </label>
            <label className="tla-field">
              Ubicación
              <input name="location" maxLength={200} />
            </label>
            <label className="tla-field">
              Enlace del evento
              <input name="luma_url" type="url" />
            </label>
            <label className="tla-field tla-field-wide">
              Descripción
              <textarea name="description" maxLength={1000} />
            </label>
            <div className="tla-field-wide">
              <button type="submit" className="tla-btn" disabled={busy}>
                Crear evento
              </button>
            </div>
          </form>
        </section>
      )}

      {events.length ? (
        <div className="tla-grid">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <p className="tla-empty">Todavía no hay eventos en esta comunidad.</p>
      )}
    </>
  );
}
