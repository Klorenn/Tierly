-- Corrección y revocación auditada de confirmaciones de asistencia, con
-- reversión del XP/stamp otorgado.
--
-- Contexto: `tierly_confirm_event_attendance` otorgaba XP de forma idempotente,
-- pero no existía forma de deshacer una confirmación errónea. El roadmap lo marca
-- como bloqueo del criterio de salida de Fase 1.
--
-- Decisiones:
--
--   1. El ledger es APPEND-ONLY. Revertir no borra ni edita la fila original:
--      inserta una fila compensatoria con `xp`/`stamps` de signo opuesto y
--      `reverses_ledger_id` apuntando al otorgamiento. Los dos consumidores
--      (`tierly_pilot_report` y el panel admin) ya agregan con `sum`, así que el
--      total se corrige solo y la evidencia de qué pasó queda intacta.
--
--   2. Eso obliga a soltar el `check (stamps >= 0)` original, que hacía imposible
--      la fila compensatoria. El invariante real pasa a ser "la suma por jugador
--      no baja de cero", que no se puede expresar como check de fila.
--
--   3. `confirmation_seq` en la asistencia resuelve el one-way door: la
--      idempotency_key vieja (`event-attendance:<evento>:<jugador>`) hacía que
--      re-confirmar después de revocar no otorgara nada, porque la clave ya
--      existía. Ahora la clave incluye la secuencia. La secuencia 0 CONSERVA el
--      formato viejo a propósito, para no re-otorgar lo que ya está aplicado en
--      producción.

-- 1. El check de fila que bloqueaba la compensación. Se busca por definición y no
--    por nombre, porque la tabla se creó con un check anónimo.
do $revocation$
declare
  v_name text;
begin
  select conname into v_name
  from pg_constraint
  where conrelid = 'public.tierly_xp_ledger'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) = 'CHECK ((stamps >= 0))';

  if v_name is not null then
    execute format('alter table public.tierly_xp_ledger drop constraint if exists %I', v_name);
  end if;
end;
$revocation$;

-- 2. Trazabilidad en el ledger.
alter table public.tierly_xp_ledger add column if not exists reverses_ledger_id bigint references public.tierly_xp_ledger(id) on delete restrict;
alter table public.tierly_xp_ledger add column if not exists actor_id uuid references auth.users(id) on delete set null;
alter table public.tierly_xp_ledger add column if not exists note text;

-- Una fila sólo se puede revertir una vez. Los NULL son distintos entre sí en
-- Postgres, así que los otorgamientos normales no colisionan.
create unique index if not exists tierly_xp_ledger_reverses_key
  on public.tierly_xp_ledger(reverses_ledger_id);

-- 3. Motivo, emisor e instante de la revocación, más la secuencia de confirmación.
alter table public.tierly_event_attendance add column if not exists revoked_at timestamptz;
alter table public.tierly_event_attendance add column if not exists revoked_by uuid references auth.users(id) on delete set null;
alter table public.tierly_event_attendance add column if not exists revocation_reason text;
alter table public.tierly_event_attendance add column if not exists confirmation_seq integer not null default 0;

-- 4. La confirmación, ahora consciente de la revocación.
create or replace function public.tierly_confirm_event_attendance(p_event_id uuid, p_player_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_guild text;
  v_seq integer;
  v_key text;
begin
  select guild_id into v_guild
  from public.gaming_events
  where id = p_event_id;

  if v_guild is null or not public.is_community_admin(v_guild) then
    raise exception 'Administrador de comunidad requerido';
  end if;

  -- Si la confirmación anterior fue revocada, esta es un intento nuevo y avanza la
  -- secuencia. Si ya estaba confirmada y vigente, `confirmed_at` no se mueve y la
  -- secuencia tampoco: el otorgamiento sigue siendo idempotente.
  update public.tierly_event_attendance
  set confirmation_seq = confirmation_seq + (case when revoked_at is not null then 1 else 0 end),
      confirmed_at = case when revoked_at is not null then now() else coalesce(confirmed_at, now()) end,
      confirmed_by = case when revoked_at is not null then (select auth.uid()) else coalesce(confirmed_by, (select auth.uid())) end,
      revoked_at = null,
      revoked_by = null,
      revocation_reason = null
  where event_id = p_event_id
    and player_id = p_player_id
    and checked_in_at is not null
    and unregistered_at is null
  returning confirmation_seq into v_seq;

  if v_seq is null then
    return false;
  end if;

  -- La secuencia 0 mantiene el formato original de la clave a propósito: cambiarlo
  -- re-otorgaría XP sobre las confirmaciones ya aplicadas en producción.
  v_key = 'event-attendance:' || p_event_id::text || ':' || p_player_id::text;
  if v_seq > 0 then
    v_key = v_key || ':' || v_seq::text;
  end if;

  insert into public.tierly_xp_ledger (guild_id, player_id, event_id, xp, stamps, reason, idempotency_key, actor_id)
  values (v_guild, p_player_id, p_event_id, 10, 1, 'event_attendance', v_key, (select auth.uid()))
  on conflict (guild_id, idempotency_key) do nothing;

  return true;
end;
$$;

-- 5. La revocación auditada.
create or replace function public.tierly_revoke_event_confirmation(p_event_id uuid, p_player_id uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_guild text;
  v_reason text;
  v_seq integer;
  v_key text;
  v_ledger_id bigint;
  v_xp integer;
  v_stamps integer;
begin
  select guild_id into v_guild
  from public.gaming_events
  where id = p_event_id;

  if v_guild is null or not public.is_community_admin(v_guild) then
    raise exception 'Administrador de comunidad requerido';
  end if;

  -- El motivo es la razón de ser de esta operación: sin motivo no hay auditoría.
  v_reason = nullif(trim(p_reason), '');
  if v_reason is null then
    raise exception 'Motivo de la revocación requerido';
  end if;

  update public.tierly_event_attendance
  set revoked_at = now(),
      revoked_by = (select auth.uid()),
      revocation_reason = v_reason
  where event_id = p_event_id
    and player_id = p_player_id
    and confirmed_at is not null
    and revoked_at is null
  returning confirmation_seq into v_seq;

  -- No había confirmación vigente que revocar. Revocar dos veces es un no-op.
  if v_seq is null then
    return false;
  end if;

  v_key = 'event-attendance:' || p_event_id::text || ':' || p_player_id::text;
  if v_seq > 0 then
    v_key = v_key || ':' || v_seq::text;
  end if;

  select id, xp, stamps into v_ledger_id, v_xp, v_stamps
  from public.tierly_xp_ledger
  where guild_id = v_guild
    and idempotency_key = v_key;

  -- La confirmación pudo no haber otorgado nada (por ejemplo si la fila del ledger
  -- se perdió con el evento). La revocación de la asistencia ya quedó registrada.
  if v_ledger_id is null then
    return true;
  end if;

  insert into public.tierly_xp_ledger (guild_id, player_id, event_id, xp, stamps, reason, idempotency_key, reverses_ledger_id, actor_id, note)
  values (v_guild, p_player_id, p_event_id, -v_xp, -v_stamps, 'event_attendance_reversal', v_key || ':reversal', v_ledger_id, (select auth.uid()), v_reason)
  on conflict (guild_id, idempotency_key) do nothing;

  return true;
end;
$$;

revoke all on function public.tierly_revoke_event_confirmation(uuid, uuid, text) from public, anon;
grant execute on function public.tierly_revoke_event_confirmation(uuid, uuid, text) to authenticated;
