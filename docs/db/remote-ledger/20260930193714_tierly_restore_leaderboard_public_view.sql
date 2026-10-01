drop view if exists public.leaderboard_public_view;

create view public.leaderboard_public_view as
select p.id                        as player_id,
       p.username,
       p.display_name,
       p.avatar_url,
       p.discord_member,
       p.banner,
       p.banner_fit,
       p.bio,
       coalesce(s.total_points, 0) as total_points
from public.gaming_players p
left join public.gaming_scores s on s.player_id = p.id
where p.discord_member is true;

grant select on public.leaderboard_public_view to anon, authenticated;
