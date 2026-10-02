-- Detalle público por juego: en qué servers se juega y quién se muestra (opt-in).
-- Sin guild_id / discord_user_id. Jugadores solo con consentimiento + identity_visible.

drop view if exists public.tierly_public_game_players_view;
drop view if exists public.tierly_public_game_communities_view;

-- Servers que jugaron este juego (30 días), agregados desde rollups.
create view public.tierly_public_game_communities_view as
select g.display_name                      as game_name,
       c.name                              as community_name,
       c.icon_url                          as community_icon_url,
       c.invite_url                        as invite_url,
       sum(r.total_minutes)::bigint        as total_minutes,
       sum(r.session_count)::bigint        as session_count,
       max(r.day)                          as last_played_day
from public.daily_game_rollups r
join public.games g on g.id = r.game_id
join public.communities c on c.guild_id = r.guild_id
where c.public_directory is true
  and c.presence_enabled is true
  and r.day >= current_date - interval '30 days'
group by g.display_name, c.name, c.icon_url, c.invite_url
having sum(r.total_minutes) > 0;

grant select on public.tierly_public_game_communities_view to anon, authenticated, service_role;

-- Quién jugó este juego (30 días), por comunidad, solo identidad publicada.
create view public.tierly_public_game_players_view as
select g.display_name                      as game_name,
       c.name                              as community_name,
       c.icon_url                          as community_icon_url,
       m.display_name                      as player_name,
       m.avatar_url                        as player_avatar_url,
       sum(s.minutes)::bigint              as total_minutes,
       count(*)::integer                   as session_count,
       max(s.ended_at)                     as last_session_at
from public.play_sessions s
join public.games g on g.id = s.game_id
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
group by s.guild_id, g.display_name, c.name, c.icon_url, m.display_name, m.avatar_url
having sum(s.minutes) > 0;

grant select on public.tierly_public_game_players_view to anon, authenticated, service_role;
