create table if not exists public.tierly_event_series (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null references public.communities(guild_id) on delete cascade,
  first_event_id uuid not null references public.gaming_events(id) on delete cascade,
  name text not null,
  recurrence_rule text not null check (recurrence_rule in ('weekly', 'monthly')),
  timezone text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists tierly_event_series_guild_idx on public.tierly_event_series(guild_id, created_at desc);
alter table public.tierly_event_series enable row level security;
drop policy if exists tierly_event_series_read on public.tierly_event_series;
create policy tierly_event_series_read on public.tierly_event_series for select to authenticated using (public.is_community_admin(guild_id));
grant select on public.tierly_event_series to authenticated;
grant select, insert, update, delete on public.tierly_event_series to service_role;
create or replace function public.tierly_create_event_series(p_guild_id text, p_first_event_id uuid, p_name text, p_recurrence_rule text, p_timezone text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_community_admin(p_guild_id) then raise exception 'Administrador de comunidad requerido'; end if;
  if p_recurrence_rule not in ('weekly', 'monthly') then raise exception 'Regla de recurrencia no permitida'; end if;
  if not exists (select 1 from public.gaming_events where id = p_first_event_id and guild_id = p_guild_id) then raise exception 'El evento no pertenece a la comunidad'; end if;
  insert into public.tierly_event_series (guild_id, first_event_id, name, recurrence_rule, timezone) values (p_guild_id, p_first_event_id, trim(p_name), p_recurrence_rule, coalesce(nullif(trim(p_timezone), ''), 'America/Santiago')) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.tierly_create_event_series(text, uuid, text, text, text) from public, anon;
grant execute on function public.tierly_create_event_series(text, uuid, text, text, text) to authenticated;
