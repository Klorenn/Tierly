-- Reporte técnico agregado para el piloto previo a smart contracts.
-- No devuelve identificadores, nombres ni filas individuales.
create or replace function public.tierly_pilot_report()
returns jsonb language sql security definer set search_path = public
as $$
  with health as (
    select coalesce(jsonb_agg(jsonb_build_object('heartbeat_age_seconds', greatest(0, extract(epoch from (now() - heartbeat_at))::bigint), 'connection_count', connection_count, 'heartbeat_count', heartbeat_count, 'error_count', error_count, 'last_error_code', last_error_code) order by bot_key), '[]'::jsonb) value from public.tierly_bot_health
  ), session_reasons as (
    select coalesce(jsonb_object_agg(coalesce(closed_reason, 'open'), total), '{}'::jsonb) value from (select closed_reason, count(*)::bigint total from public.play_sessions group by closed_reason) grouped
  ), active_games as (
    select jsonb_build_object('sessions', count(*)::bigint, 'games', count(distinct game_id)::bigint, 'communities', count(distinct guild_id)::bigint) value from public.play_sessions where ended_at is null
  ), rollups as (
    select jsonb_build_object('rows', count(*)::bigint, 'unique_players_sum', coalesce(sum(unique_players), 0)::bigint, 'total_minutes', coalesce(sum(total_minutes), 0)::bigint, 'session_count', coalesce(sum(session_count), 0)::bigint, 'days', count(distinct day)::bigint) value from public.daily_game_rollups
  ), suggestions as (
    select coalesce(jsonb_object_agg(status, total), '{}'::jsonb) value from (select status, count(*)::bigint total from public.suggested_events group by status) grouped
  ), events as (
    select jsonb_build_object('total', count(*)::bigint, 'scheduled', count(*) filter (where status = 'scheduled')::bigint, 'live', count(*) filter (where status = 'live')::bigint, 'completed', count(*) filter (where status = 'completed')::bigint, 'cancelled', count(*) filter (where status = 'cancelled')::bigint) value from public.gaming_events
  ), attendance as (
    select jsonb_build_object('registrations', count(*) filter (where unregistered_at is null)::bigint, 'check_ins', count(*) filter (where checked_in_at is not null and unregistered_at is null)::bigint, 'confirmations', count(*) filter (where confirmed_at is not null and unregistered_at is null)::bigint) value from public.tierly_event_attendance
  ), rewards as (
    select jsonb_build_object('ledger_rows', count(*)::bigint, 'xp', coalesce(sum(xp), 0)::bigint, 'stamps', coalesce(sum(stamps), 0)::bigint) value from public.tierly_xp_ledger
  )
  select jsonb_build_object('generated_at', now(), 'scope', 'global_aggregate', 'health', (select value from health), 'sessions_by_closed_reason', (select value from session_reasons), 'active_games', (select value from active_games), 'rollups', (select value from rollups), 'suggestions', (select value from suggestions), 'events', (select value from events), 'attendance', (select value from attendance), 'xp_stamps', (select value from rewards));
$$;
revoke all on function public.tierly_pilot_report() from public, anon, authenticated;
grant execute on function public.tierly_pilot_report() to service_role;
