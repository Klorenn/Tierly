create or replace view public.tierly_community_events_public_view as
select e.id         as event_id,
       e.name       as event_name,
       e.event_date,
       e.starts_at,
       e.ends_at,
       e.timezone,
       e.location,
       e.luma_url,
       e.banner_url,
       e.description,
       e.status,
       c.name       as community_name,
       c.icon_url   as community_icon_url,
       (select count(*)
          from public.tierly_event_attendance a
         where a.event_id = e.id
           and a.unregistered_at is null) as registration_count
from public.gaming_events e
join public.communities c on c.guild_id = e.guild_id
where e.guild_id is not null
  and e.status in ('scheduled', 'live');

grant select on public.tierly_community_events_public_view to anon, authenticated;
