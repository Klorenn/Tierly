-- Unica escritura desde el navegador en todo V0: el panel de admin necesita
-- poder marcar una sugerencia como aceptada o descartada sin pasar por
-- service-role. Todo lo demas del esquema V0 es solo lectura para
-- authenticated (ver 20260929090000_tierly_v0_schema.sql). Esta migracion
-- agota el permiso al minimo posible: solo la columna status, solo update,
-- solo filas del guild donde el usuario es admin, y con un check que impide
-- volver a poner una sugerencia en 'pending' (revivirla) o tocar cualquier
-- otro estado fuera de los dos terminales validos.
--
-- Recuperada del ledger remoto el 2026-10-01: se aplico a mano y nunca se
-- commiteo. El `drop policy if exists` es el unico cambio respecto de lo
-- aplicado, para que `db reset` pueda correrla dos veces.

grant update (status) on public.suggested_events to authenticated;

drop policy if exists suggested_events_update on public.suggested_events;
create policy suggested_events_update on public.suggested_events
  for update to authenticated
  using (public.is_community_admin(guild_id))
  with check (
    public.is_community_admin(guild_id)
    and status in ('accepted', 'dismissed')
  );
