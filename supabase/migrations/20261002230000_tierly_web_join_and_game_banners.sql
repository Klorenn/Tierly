-- Join CTA por comunidad + banners de juegos para Discover/Live.
-- Las vistas públicas ya referenciaban g.icon_url y c.invite_url sin columnas en prod.

alter table public.communities
  add column if not exists invite_url text;

alter table public.games
  add column if not exists icon_url text;

alter table public.games
  add column if not exists banner_url text;

-- DROP + CREATE: replace no permite reordenar/renombrar columnas de la view.
drop view if exists public.tierly_public_live_presence_view;
drop view if exists public.tierly_public_top_games_view;
drop view if exists public.tierly_public_communities_view;

-- Comunidades públicas: proyectar invite_url (sin guild_id).
create view public.tierly_public_communities_view as
select c.name                                as community_name,
       c.icon_url                            as community_icon_url,
       c.invite_url                          as invite_url,
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

grant select on public.tierly_public_communities_view to anon, authenticated, service_role;

-- Top games con arte.
create view public.tierly_public_top_games_view as
select g.display_name                      as game_name,
       g.icon_url                          as game_icon_url,
       g.banner_url                        as game_banner_url,
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
group by g.display_name, g.icon_url, g.banner_url
having sum(r.total_minutes) > 0;

grant select on public.tierly_public_top_games_view to anon, authenticated, service_role;

-- Live: una fila por juego + comunidad (join apunta a ese server).
create view public.tierly_public_live_presence_view as
select g.display_name                      as game_name,
       g.icon_url                          as game_icon_url,
       g.banner_url                        as game_banner_url,
       c.name                              as community_name,
       c.icon_url                          as community_icon_url,
       c.invite_url                        as invite_url,
       count(distinct s.discord_user_id)   as player_count,
       sum(extract(epoch from (now() - s.started_at)) / 60)::bigint as total_minutes
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
group by g.display_name, g.icon_url, g.banner_url, c.name, c.icon_url, c.invite_url
having count(distinct s.discord_user_id) > 0;

grant select on public.tierly_public_live_presence_view to anon, authenticated, service_role;
