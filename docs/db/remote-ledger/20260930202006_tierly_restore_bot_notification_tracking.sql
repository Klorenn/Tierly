create table if not exists public.gaming_bot_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('event')),
  ref_id uuid not null,
  created_at timestamptz not null default now(),
  unique (kind, ref_id)
);

create index if not exists gaming_bot_notifications_created
  on public.gaming_bot_notifications (created_at desc);

alter table public.gaming_bot_notifications enable row level security;

revoke all on table public.gaming_bot_notifications from anon, authenticated;
grant select, insert on public.gaming_bot_notifications to service_role;

