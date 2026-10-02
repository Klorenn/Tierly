-- Asistencia sin cuenta reclamada, y el perfil propio entre comunidades.
--
-- El agujero que cierra: toda RPC de asistencia resolvia al jugador con
-- `auth_user_id = auth.uid()`, asi que alguien que llega al evento sin saber que
-- existe TIRLY no podia quedar registrado. El modelo ya lo soportaba
-- (`gaming_players.auth_user_id` es nullable y `discord_id` es la clave natural),
-- faltaba el camino de escritura.
--
-- El reclamo NO necesita backfill: la asistencia y el ledger cuelgan de
-- `gaming_players.id`, y `discord-verify` hace upsert con
-- `onConflict: "discord_id"`. Al verificar, la fila que ya existia recibe su
-- `auth_user_id` y las estampas pasan a ser de esa persona sin mover una sola.

-- 1. Anotar asistencia por discord_id.
--
-- Solo `service_role`: si esto fuera `authenticated`, cualquiera con sesion
-- podria anotar la asistencia de un tercero pasando su discord_id y fabricar
-- estampas ajenas. El unico llamador legitimo es el bot, y solo cuando la
-- persona misma ejecuta el comando: eso es el consentimiento por accion que
-- justifica guardar su nombre y avatar.
create or replace function public.tierly_bot_record_attendance(
  p_guild_id text,
  p_event_id uuid,
  p_discord_id text,
  p_display_name text default null,
  p_avatar_url text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_player uuid;
  v_discord text;
begin
  v_discord = nullif(trim(p_discord_id), '');
  if v_discord is null then
    raise exception 'discord_id requerido';
  end if;

  -- La ventana se exige igual que en el check-in autenticado: sin esto se
  -- podrian acunar estampas de un evento que ya termino.
  if not exists (
    select 1 from public.gaming_events
    where id = p_event_id
      and guild_id = p_guild_id
      and status in ('scheduled', 'live')
      and starts_at is not null
      and ends_at is not null
      and now() between starts_at and ends_at
  ) then
    raise exception 'El evento no acepta asistencia en este momento';
  end if;

  -- `auth_user_id` NO se toca nunca aca: vincular una identidad de Discord con
  -- una cuenta es atribucion de identidad y solo puede pasar en el reclamo,
  -- donde el usuario probo ser dueno de ese Discord via OAuth.
  insert into public.gaming_players as p (discord_id, display_name, avatar_url)
  values (v_discord, nullif(trim(p_display_name), ''), nullif(trim(p_avatar_url), ''))
  on conflict (discord_id) do update
    set display_name = coalesce(p.display_name, excluded.display_name),
        avatar_url = coalesce(p.avatar_url, excluded.avatar_url)
  returning p.id into v_player;

  -- `confirmed_at` y `revoked_at` quedan fuera a proposito: confirmar es una
  -- decision del administrador, no un efecto de aparecer en el evento.
  insert into public.tierly_event_attendance as a (event_id, player_id, registered_at, checked_in_at)
  values (p_event_id, v_player, now(), now())
  on conflict (event_id, player_id) do update
    set checked_in_at = coalesce(a.checked_in_at, now()),
        unregistered_at = null;

  return v_player;
end;
$$;

revoke all on function public.tierly_bot_record_attendance(text, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.tierly_bot_record_attendance(text, uuid, text, text, text)
  to service_role;

-- 2. Eventos abiertos de cualquier comunidad, para que el bot resuelva "a cual
-- de los eventos de este server estoy anotando" sin exponer nada mas.
create or replace function public.tierly_bot_open_event(p_guild_id text)
returns uuid language sql security definer set search_path = '' as $$
  select id from public.gaming_events
  where guild_id = p_guild_id
    and status in ('scheduled', 'live')
    and starts_at is not null and ends_at is not null
    and now() between starts_at and ends_at
  order by starts_at asc
  limit 1;
$$;

revoke all on function public.tierly_bot_open_event(text) from public, anon, authenticated;
grant execute on function public.tierly_bot_open_event(text) to service_role;

-- 3. El perfil propio, entre todas las comunidades.
--
-- La RLS del ledger ya permite leer las filas propias sin filtro de guild, asi
-- que esto no abre nada nuevo: solo le da forma. El `auth_user_id = auth.uid()`
-- explicito es imprescindible porque esa misma policy tambien habilita a un
-- administrador a leer TODO su guild; sin este filtro el perfil de un admin
-- mostraria las estampas de los demas.
create or replace view public.tierly_my_stamps_view with (security_invoker = true) as
select
  ledger.id,
  ledger.guild_id,
  communities.name as community_name,
  ledger.event_id,
  events.name as event_name,
  events.starts_at as event_starts_at,
  ledger.xp,
  ledger.stamps,
  ledger.reason,
  ledger.created_at
from public.tierly_xp_ledger as ledger
join public.gaming_players as players on players.id = ledger.player_id
left join public.communities as communities on communities.guild_id = ledger.guild_id
left join public.gaming_events as events on events.id = ledger.event_id
where players.auth_user_id = (select auth.uid());

revoke all on public.tierly_my_stamps_view from public, anon;
grant select on public.tierly_my_stamps_view to authenticated;
