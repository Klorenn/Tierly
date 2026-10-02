-- Descubrimiento público: qué comunidades usan Tierly, qué se juega y quién juega más.
--
-- El roadmap (Fase 0) no asume autorizado publicar un grafo personal persistente entre
-- servidores, y el directorio de comunidades estaba parkeado en Fase 4. Por eso nada de
-- esto es automático: cada comunidad decide aparecer con `communities.public_directory`,
-- que arranca apagado y solo un administrador de esa guild puede prender.
--
-- Tres límites que estas vistas NO cruzan:
--   1. Ninguna expone `guild_id` ni `discord_user_id`. El navegador recibe nombre e icono.
--   2. El ranking de jugadores agrupa POR comunidad, no entre comunidades. Una persona que
--      juega en dos servidores públicos aparece como dos filas, cada una dentro de su
--      comunidad. No se construye un perfil cruzado.
--   3. El ranking nominal exige consentimiento aceptado e `identity_visible`, los dos
--      controles que ya definió `tierly_presence_consent`.

alter table public.communities
  add column if not exists public_directory boolean not null default false;

create index if not exists communities_public_directory
  on public.communities (public_directory)
  where public_directory;

-- ── Comunidades que tienen Tierly ───────────────────────────────────────────────────
-- `consenting_member_count` cuenta miembros que aceptaron la observación de presencia,
-- no miembros de la guild: Tierly no conoce el padrón completo del servidor.

create or replace view public.tierly_public_communities_view as
select c.name                                as community_name,
       c.icon_url                            as community_icon_url,
       c.locale,
       c.timezone,
       c.installed_at,
       c.presence_enabled,
       (select count(*)
          from public.observed_members m
         where m.guild_id = c.guild_id
           and m.consent_status = 'accepted'
           and m.deletion_requested_at is null) as consenting_member_count,
       (select count(distinct r.game_id)
          from public.daily_game_rollups r
         where r.guild_id = c.guild_id
           and r.day >= current_date - interval '30 days')  as games_tracked
from public.communities c
where c.public_directory is true;

grant select on public.tierly_public_communities_view to anon, authenticated;

-- ── Juegos más jugados ──────────────────────────────────────────────────────────────
-- Lee `daily_game_rollups`, no `play_sessions`: el rollup ya aplicó el cap de minutos
-- por comunidad y la purga de retención.
--
-- No se suma `unique_players` entre comunidades. Ese campo es único POR guild y POR día,
-- así que sumarlo cuenta a la misma persona muchas veces y produciría un número inflado
-- que parece "jugadores" sin serlo. Se publica `community_count` y `session_count`, que
-- sí son lo que dicen ser.

create or replace view public.tierly_public_top_games_view as
select g.display_name                      as game_name,
       sum(r.total_minutes)::bigint        as total_minutes,
       sum(r.session_count)::bigint        as session_count,
       count(distinct r.guild_id)::integer as community_count,
       max(r.day)                          as last_played_day
from public.daily_game_rollups r
join public.games g on g.id = r.game_id
join public.communities c on c.guild_id = r.guild_id
where c.public_directory is true
  and c.presence_enabled is true
  and r.day >= current_date - interval '30 days'
group by g.display_name
having sum(r.total_minutes) > 0;

grant select on public.tierly_public_top_games_view to anon, authenticated;

-- ── Quién juega más, dentro de cada comunidad ───────────────────────────────────────
-- Solo sesiones cerradas: una sesión abierta no tiene `minutes` todavía y publicarla
-- inventaría duración. La identidad sale de `observed_members`, que es la identidad
-- guild-scoped que el miembro aceptó mostrar.

create or replace view public.tierly_public_top_players_view as
select c.name                        as community_name,
       c.icon_url                    as community_icon_url,
       m.display_name                as player_name,
       m.avatar_url                  as player_avatar_url,
       sum(s.minutes)::bigint        as total_minutes,
       count(*)::integer             as session_count,
       count(distinct s.game_id)::integer as game_count,
       max(s.ended_at)               as last_session_at
from public.play_sessions s
join public.communities c on c.guild_id = s.guild_id
join public.observed_members m
  on m.guild_id = s.guild_id
 and m.discord_user_id = s.discord_user_id
where c.public_directory is true
  and c.presence_enabled is true
  and m.consent_status = 'accepted'
  and m.identity_visible is true
  and m.deletion_requested_at is null
  and m.display_name is not null
  and s.ended_at is not null
  and s.started_at >= now() - interval '30 days'
group by s.guild_id, c.name, c.icon_url, m.display_name, m.avatar_url
having sum(s.minutes) > 0;

grant select on public.tierly_public_top_players_view to anon, authenticated;

-- ── Control del flag ────────────────────────────────────────────────────────────────
-- `security definer` porque el flag vive en `communities`, cuya RLS no concede update al
-- panel. La autorización no se delega al cliente: se verifica contra `community_admins`
-- con el `auth.uid()` de quien llama.

create or replace function public.tierly_set_public_directory(
  target_guild text,
  listed boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Se requiere una sesion autenticada';
  end if;

  if not exists (
    select 1
    from public.community_admins a
    where a.guild_id = target_guild
      and a.user_id = auth.uid()
  ) then
    raise exception using errcode = '42501', message = 'No administras esta comunidad';
  end if;

  update public.communities
  set public_directory = listed
  where guild_id = target_guild;

  return listed;
end;
$$;

revoke all on function public.tierly_set_public_directory(text, boolean) from public, anon;
grant execute on function public.tierly_set_public_directory(text, boolean) to authenticated, service_role;

-- ── Qué se está jugando AHORA (live) ─────────────────────────────────────────────────
-- Solo comunidades públicas con presence_enabled y miembros que aceptaron mostrarse.
-- Agrupa por juego, cuenta jugadores activos, minutos y comunidades.
create or replace view public.tierly_public_live_presence_view as
select g.display_name                      as game_name,
       g.icon_url                           as game_icon_url,
       count(distinct s.discord_user_id)    as player_count,
       sum(extract(epoch from (now() - s.started_at)) / 60)::bigint as total_minutes,
       count(distinct s.guild_id)           as community_count,
       c.invite_url                         as invite_url
from public.play_sessions s
join public.games g on g.id = s.game_id
join public.communities c on c.guild_id = s.guild_id
join public.observed_members m
  on m.guild_id = s.guild_id
 and m.discord_user_id = s.discord_user_id
where s.ended_at is null
  and c.public_directory is true
  and c.presence_enabled is true
  and m.consent_status = 'accepted'
  and m.identity_visible is true
  and m.deletion_requested_at is null
  and s.last_heartbeat_at >= now() - interval '10 minutes'
group by g.display_name, g.icon_url, c.invite_url
having count(distinct s.discord_user_id) > 0;

grant select on public.tierly_public_live_presence_view to anon, authenticated;

grant execute on function public.tierly_set_public_directory(text, boolean) to authenticated, service_role;
