-- version: 20260716183821  name: create_stellar_ops_dashboard
-- DESTRUCTIVE PROJECT REPURPOSING
-- This migration intentionally replaces the legacy application in the dedicated
-- Supabase project with Tellus Stellar Ops. It is expected to run exactly once.
delete from auth.users;
drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
create extension if not exists pgcrypto;
create type public.member_role as enum ('admin', 'operator', 'finance', 'viewer');
create type public.work_status as enum ('not_started', 'in_progress', 'at_risk', 'submitted', 'accepted', 'blocked');
create type public.initiative_type as enum ('event', 'content', 'scf', 'instaward', 'ambassador', 'developer', 'partnership');
create type public.payment_status as enum ('not_triggered', 'triggered', 'invoiced', 'paid', 'disputed');
create type public.fund_direction as enum ('credit', 'debit');
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members(user_id);
create table public.reporting_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text not null,
  starts_on date not null,
  ends_on date not null,
  report_due_on date,
  status public.work_status not null default 'not_started',
  created_at timestamptz not null default now(),
  unique (organization_id, starts_on)
);
create index reporting_periods_org_idx on public.reporting_periods(organization_id, starts_on);
create table public.metric_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  label text not null,
  category text not null,
  target numeric not null check (target >= 0),
  unit text not null,
  frequency text not null default 'monthly',
  validation_method text,
  contract_note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index metric_definitions_org_idx on public.metric_definitions(organization_id, sort_order);
create table public.metric_updates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_id uuid not null references public.reporting_periods(id) on delete cascade,
  metric_id uuid not null references public.metric_definitions(id) on delete cascade,
  actual numeric not null default 0 check (actual >= 0),
  status public.work_status not null default 'not_started',
  owner_id uuid references auth.users(id) on delete set null,
  notes text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (period_id, metric_id)
);
create index metric_updates_period_idx on public.metric_updates(period_id);
create index metric_updates_org_idx on public.metric_updates(organization_id);
create table public.initiatives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_id uuid references public.reporting_periods(id) on delete set null,
  type public.initiative_type not null,
  title text not null,
  status public.work_status not null default 'not_started',
  owner_id uuid references auth.users(id) on delete set null,
  due_on date,
  occurred_on date,
  count_value numeric not null default 1 check (count_value >= 0),
  details jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index initiatives_org_period_idx on public.initiatives(organization_id, period_id, type);
create index initiatives_due_idx on public.initiatives(due_on) where due_on is not null;
create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_id uuid references public.reporting_periods(id) on delete set null,
  title text not null,
  description text,
  due_on date not null,
  status public.work_status not null default 'not_started',
  owner_id uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  accepted_at timestamptz,
  correction_due_on date,
  acceptance_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index deliverables_org_due_idx on public.deliverables(organization_id, due_on);
create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  initiative_id uuid references public.initiatives(id) on delete cascade,
  deliverable_id uuid references public.deliverables(id) on delete cascade,
  title text not null,
  kind text not null,
  url text,
  storage_path text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (initiative_id is not null or deliverable_id is not null),
  check (url is not null or storage_path is not null)
);
create index evidence_org_idx on public.evidence(organization_id);
create table public.payment_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text not null,
  amount_usd numeric(12,2) not null check (amount_usd >= 0),
  due_after_acceptance text,
  status public.payment_status not null default 'not_triggered',
  accepted_at timestamptz,
  paid_at timestamptz,
  xlm_received numeric,
  transaction_hash text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index payment_milestones_org_idx on public.payment_milestones(organization_id, sort_order);
create table public.fund_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  occurred_on date not null,
  direction public.fund_direction not null,
  category text not null,
  description text not null,
  amount_usd numeric(12,2) not null check (amount_usd >= 0),
  amount_xlm numeric,
  transaction_hash text,
  receipt_url text,
  approved boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index fund_transactions_org_date_idx on public.fund_transactions(organization_id, occurred_on);
create or replace function public.touch_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger metric_updates_touch before update on public.metric_updates for each row execute function public.touch_updated_at();
create trigger initiatives_touch before update on public.initiatives for each row execute function public.touch_updated_at();
create trigger deliverables_touch before update on public.deliverables for each row execute function public.touch_updated_at();
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created
after insert on auth.users for each row execute function public.handle_new_user();
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.reporting_periods enable row level security;
alter table public.metric_definitions enable row level security;
alter table public.metric_updates enable row level security;
alter table public.initiatives enable row level security;
alter table public.deliverables enable row level security;
alter table public.evidence enable row level security;
alter table public.payment_milestones enable row level security;
alter table public.fund_transactions enable row level security;
create policy profiles_self_select on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_self_update on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy memberships_self_select on public.organization_members for select to authenticated using ((select auth.uid()) = user_id);
create policy organizations_member_select on public.organizations for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = id and m.user_id = (select auth.uid())));
create policy periods_member_all on public.reporting_periods for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = reporting_periods.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = reporting_periods.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
create policy periods_member_select on public.reporting_periods for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = reporting_periods.organization_id and m.user_id = (select auth.uid())));
create policy metric_definitions_member_select on public.metric_definitions for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = metric_definitions.organization_id and m.user_id = (select auth.uid())));
create policy metric_updates_member_all on public.metric_updates for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = metric_updates.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = metric_updates.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
create policy metric_updates_member_select on public.metric_updates for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = metric_updates.organization_id and m.user_id = (select auth.uid())));
create policy initiatives_member_all on public.initiatives for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = initiatives.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = initiatives.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
create policy initiatives_member_select on public.initiatives for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = initiatives.organization_id and m.user_id = (select auth.uid())));
create policy deliverables_member_all on public.deliverables for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = deliverables.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = deliverables.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
create policy deliverables_member_select on public.deliverables for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = deliverables.organization_id and m.user_id = (select auth.uid())));
create policy evidence_member_all on public.evidence for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = evidence.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = evidence.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
create policy evidence_member_select on public.evidence for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = evidence.organization_id and m.user_id = (select auth.uid())));
create policy payments_member_select on public.payment_milestones for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = payment_milestones.organization_id and m.user_id = (select auth.uid())));
create policy payments_finance_all on public.payment_milestones for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = payment_milestones.organization_id and m.user_id = (select auth.uid()) and m.role in ('admin', 'finance')))
with check (exists (select 1 from public.organization_members m where m.organization_id = payment_milestones.organization_id and m.user_id = (select auth.uid()) and m.role in ('admin', 'finance')));
create policy funds_member_select on public.fund_transactions for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = fund_transactions.organization_id and m.user_id = (select auth.uid())));
create policy funds_finance_all on public.fund_transactions for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = fund_transactions.organization_id and m.user_id = (select auth.uid()) and m.role in ('admin', 'finance')))
with check (exists (select 1 from public.organization_members m where m.organization_id = fund_transactions.organization_id and m.user_id = (select auth.uid()) and m.role in ('admin', 'finance')));
grant usage on schema public to authenticated;
grant select on public.organizations, public.profiles, public.organization_members, public.reporting_periods,
  public.metric_definitions, public.metric_updates, public.initiatives, public.deliverables,
  public.evidence, public.payment_milestones, public.fund_transactions to authenticated;
grant insert, update, delete on public.reporting_periods, public.metric_updates, public.initiatives,
  public.deliverables, public.evidence, public.payment_milestones, public.fund_transactions to authenticated;
grant update on public.profiles to authenticated;
insert into public.organizations (name, slug) values ('Tellus Cooperative Foundation', 'tellus');
with org as (select id from public.organizations where slug = 'tellus')
insert into public.reporting_periods (organization_id, label, starts_on, ends_on, report_due_on)
select org.id, p.label, p.starts_on, p.ends_on, p.report_due_on
from org cross join (values
  ('Julio 2026', date '2026-07-01', date '2026-07-31', date '2026-08-07'),
  ('Agosto 2026', date '2026-08-01', date '2026-08-31', date '2026-09-07'),
  ('Septiembre 2026', date '2026-09-01', date '2026-09-30', date '2026-10-07'),
  ('Octubre 2026', date '2026-10-01', date '2026-10-31', date '2026-11-06'),
  ('Noviembre 2026', date '2026-11-01', date '2026-11-30', date '2026-12-07'),
  ('Diciembre 2026', date '2026-12-01', date '2026-12-31', date '2027-01-08')
) as p(label, starts_on, ends_on, report_due_on);
with org as (select id from public.organizations where slug = 'tellus')
insert into public.metric_definitions (organization_id, code, label, category, target, unit, validation_method, contract_note, sort_order)
select org.id, m.code, m.label, m.category, m.target, m.unit, m.validation_method, m.contract_note, m.sort_order
from org cross join (values
  ('events', 'Eventos calificables', 'Operación', 3::numeric, 'eventos', 'Event Documentation Package', 'Presenciales, 20 asistentes válidos y 20 minutos Stellar.', 10),
  ('content', 'Contenido educativo', 'Operación', 2, 'piezas', 'Enlaces y materiales publicados', 'Contenido original o aprobado, adaptado al territorio.', 20),
  ('scf_referrals', 'Referidos SCF', 'Ecosistema', 2, 'referidos', 'SCF Project Referral Form', 'Presentados por el proceso designado.', 30),
  ('instaward_submissions', 'Candidatos Instaward', 'Ecosistema', 3, 'candidatos', 'Instaward Submissions Form', 'Elegibles y presentados por el proceso designado.', 40),
  ('ambassadors', 'Nuevos embajadores Tier 2+', 'Comunidad', 20, 'personas', 'Airtable / handbook', 'Objetivo KPI; definición mensual pendiente de confirmación.', 50),
  ('developers', 'Desarrolladores activos', 'Builders', 100, 'personas', 'GitHub / Electric Capital', 'Al menos un commit Stellar en una ventana de 28 días.', 60),
  ('scf_awards', 'Proyectos SCF adjudicados', 'Resultado externo', 1, 'proyectos', 'SCF Dashboard', 'KPI fuera del control directo de Tellus.', 70),
  ('instaward_awards', 'Instawards adjudicados', 'Resultado externo', 3, 'premios', 'Instawards Dashboard', 'KPI fuera del control directo de Tellus.', 80)
) as m(code, label, category, target, unit, validation_method, contract_note, sort_order);
insert into public.metric_updates (organization_id, period_id, metric_id)
select p.organization_id, p.id, m.id
from public.reporting_periods p
join public.metric_definitions m on m.organization_id = p.organization_id;
with org as (select id from public.organizations where slug = 'tellus')
insert into public.deliverables (organization_id, period_id, title, description, due_on)
select org.id, null, d.title, d.description, d.due_on
from org cross join (values
  ('Plan de lanzamiento', 'Plan de eventos, embajadores, developers, alianzas y pipelines.', date '2026-07-16'),
  ('Validación KPI — meses 1 a 3', 'Informe trimestral con evidencia para todas las categorías.', date '2026-09-30'),
  ('Validación KPI — meses 4 a 6', 'Informe final de validación con evidencia para todas las categorías.', date '2026-12-31'),
  ('Paquete de transición', 'Roster, cuentas, compromisos, alianzas y recomendaciones de traspaso.', date '2027-01-08')
) as d(title, description, due_on);
insert into public.deliverables (organization_id, period_id, title, description, due_on)
select p.organization_id, p.id, 'Entregables mensuales — ' || lower(p.label),
  'Eventos, contenidos, referidos SCF, candidatos Instaward y reporte mensual con evidencia.', p.report_due_on
from public.reporting_periods p;
with org as (select id from public.organizations where slug = 'tellus')
insert into public.payment_milestones (organization_id, label, amount_usd, status, sort_order)
select org.id, x.label, 2500, 'not_triggered', x.sort_order from org cross join (values
  ('Programa y plan de lanzamiento', 10), ('Desempeño mes 1', 20), ('Desempeño mes 2', 30),
  ('Revisión intermedia mes 3', 40), ('Desempeño meses 4–5', 50), ('Cierre final mes 6', 60)
) as x(label, sort_order);
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stellar-evidence', 'stellar-evidence', false, 15728640, array['application/pdf','image/jpeg','image/png','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;
create policy storage_evidence_select on storage.objects for select to authenticated
using (bucket_id = 'stellar-evidence' and exists (
  select 1 from public.organization_members m
  where m.user_id = (select auth.uid()) and (storage.foldername(name))[1] = m.organization_id::text
));
create policy storage_evidence_insert on storage.objects for insert to authenticated
with check (bucket_id = 'stellar-evidence' and exists (
  select 1 from public.organization_members m
  where m.user_id = (select auth.uid()) and m.role <> 'viewer' and (storage.foldername(name))[1] = m.organization_id::text
));
create policy storage_evidence_update on storage.objects for update to authenticated
using (bucket_id = 'stellar-evidence' and exists (
  select 1 from public.organization_members m
  where m.user_id = (select auth.uid()) and m.role <> 'viewer' and (storage.foldername(name))[1] = m.organization_id::text
)) with check (bucket_id = 'stellar-evidence' and exists (
  select 1 from public.organization_members m
  where m.user_id = (select auth.uid()) and m.role <> 'viewer' and (storage.foldername(name))[1] = m.organization_id::text
))
-- version: 20260716191350  name: harden_stellar_ops_policies
-- Remove inherited Storage access from the retired application.
drop policy if exists "Anyone can view avatars" on storage.objects;
drop policy if exists "Authenticated users can read avatars" on storage.objects;
drop policy if exists "Authenticated users can upload avatars" on storage.objects;
drop policy if exists "Doctors can upload prescriptions" on storage.objects;
drop policy if exists "Patients can view own prescriptions" on storage.objects;
drop policy if exists "Users can delete own avatars" on storage.objects;
drop policy if exists "Users can update own avatars" on storage.objects;
drop policy if exists "Users can upload own avatars" on storage.objects;
drop policy if exists "message_files_select" on storage.objects;
drop policy if exists "message_files_upload" on storage.objects;
drop policy if exists "professional_delete_consultation_photos" on storage.objects;
drop policy if exists "professional_read_consultation_photos" on storage.objects;
drop policy if exists "professional_upload_consultation_photos" on storage.objects;
drop policy if exists "professionals_upload_credentials" on storage.objects;
drop policy if exists "professionals_view_own_credential_files" on storage.objects;
update storage.buckets set public = false where id <> 'stellar-evidence';
-- Split write policies from SELECT so each request evaluates one permissive policy.
drop policy if exists periods_member_all on public.reporting_periods;
create policy periods_member_insert on public.reporting_periods for insert to authenticated
with check (exists (select 1 from public.organization_members m where m.organization_id = reporting_periods.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
create policy periods_member_update on public.reporting_periods for update to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = reporting_periods.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = reporting_periods.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
create policy periods_member_delete on public.reporting_periods for delete to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = reporting_periods.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
drop policy if exists metric_updates_member_all on public.metric_updates;
create policy metric_updates_member_insert on public.metric_updates for insert to authenticated
with check (exists (select 1 from public.organization_members m where m.organization_id = metric_updates.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
create policy metric_updates_member_update on public.metric_updates for update to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = metric_updates.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = metric_updates.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
create policy metric_updates_member_delete on public.metric_updates for delete to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = metric_updates.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
drop policy if exists initiatives_member_all on public.initiatives;
create policy initiatives_member_insert on public.initiatives for insert to authenticated
with check (exists (select 1 from public.organization_members m where m.organization_id = initiatives.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
create policy initiatives_member_update on public.initiatives for update to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = initiatives.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = initiatives.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
create policy initiatives_member_delete on public.initiatives for delete to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = initiatives.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
drop policy if exists deliverables_member_all on public.deliverables;
create policy deliverables_member_insert on public.deliverables for insert to authenticated
with check (exists (select 1 from public.organization_members m where m.organization_id = deliverables.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
create policy deliverables_member_update on public.deliverables for update to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = deliverables.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = deliverables.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
create policy deliverables_member_delete on public.deliverables for delete to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = deliverables.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
drop policy if exists evidence_member_all on public.evidence;
create policy evidence_member_insert on public.evidence for insert to authenticated
with check (exists (select 1 from public.organization_members m where m.organization_id = evidence.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
create policy evidence_member_update on public.evidence for update to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = evidence.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = evidence.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
create policy evidence_member_delete on public.evidence for delete to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = evidence.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
drop policy if exists payments_finance_all on public.payment_milestones;
create policy payments_finance_insert on public.payment_milestones for insert to authenticated
with check (exists (select 1 from public.organization_members m where m.organization_id = payment_milestones.organization_id and m.user_id = (select auth.uid()) and m.role in ('admin', 'finance')));
create policy payments_finance_update on public.payment_milestones for update to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = payment_milestones.organization_id and m.user_id = (select auth.uid()) and m.role in ('admin', 'finance')))
with check (exists (select 1 from public.organization_members m where m.organization_id = payment_milestones.organization_id and m.user_id = (select auth.uid()) and m.role in ('admin', 'finance')));
create policy payments_finance_delete on public.payment_milestones for delete to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = payment_milestones.organization_id and m.user_id = (select auth.uid()) and m.role in ('admin', 'finance')));
drop policy if exists funds_finance_all on public.fund_transactions;
create policy funds_finance_insert on public.fund_transactions for insert to authenticated
with check (exists (select 1 from public.organization_members m where m.organization_id = fund_transactions.organization_id and m.user_id = (select auth.uid()) and m.role in ('admin', 'finance')));
create policy funds_finance_update on public.fund_transactions for update to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = fund_transactions.organization_id and m.user_id = (select auth.uid()) and m.role in ('admin', 'finance')))
with check (exists (select 1 from public.organization_members m where m.organization_id = fund_transactions.organization_id and m.user_id = (select auth.uid()) and m.role in ('admin', 'finance')));
create policy funds_finance_delete on public.fund_transactions for delete to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = fund_transactions.organization_id and m.user_id = (select auth.uid()) and m.role in ('admin', 'finance')));
create index deliverables_owner_idx on public.deliverables(owner_id);
create index deliverables_period_idx on public.deliverables(period_id);
create index evidence_deliverable_idx on public.evidence(deliverable_id);
create index evidence_initiative_idx on public.evidence(initiative_id);
create index evidence_uploaded_by_idx on public.evidence(uploaded_by);
create index fund_transactions_created_by_idx on public.fund_transactions(created_by);
create index initiatives_created_by_idx on public.initiatives(created_by);
create index initiatives_owner_idx on public.initiatives(owner_id);
create index initiatives_period_idx on public.initiatives(period_id);
create index metric_updates_metric_idx on public.metric_updates(metric_id);
create index metric_updates_owner_idx on public.metric_updates(owner_id);
create index metric_updates_updated_by_idx on public.metric_updates(updated_by)
-- version: 20260716192111  name: reserve_master_admin
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.admin_allowlist (
  email text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role public.member_role not null default 'admin',
  created_at timestamptz not null default now()
);
revoke all on private.admin_allowlist from public, anon, authenticated;
insert into private.admin_allowlist (email, organization_id, role)
select lower('hola@telluscoop.org'), id, 'admin'
from public.organizations
where slug = 'tellus';
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  insert into public.organization_members (organization_id, user_id, role)
  select a.organization_id, new.id, a.role
  from private.admin_allowlist a
  where lower(a.email) = lower(new.email)
  on conflict (organization_id, user_id) do update set role = excluded.role;

  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user()
-- version: 20260716194700  name: add_initial_operators
insert into private.admin_allowlist (email, organization_id, role)
select invited.email, o.id, 'operator'::public.member_role
from public.organizations o
cross join (
  values
    ('kohcuendedani@gmail.com'),
    ('mishekoh@gmail.com'),
    ('bastian@telluscoop.org')
) as invited(email)
where o.slug = 'tellus'
on conflict (email) do update
set organization_id = excluded.organization_id,
    role = excluded.role
-- version: 20260716195800  name: promote_initial_team_to_admin
update private.admin_allowlist
set role = 'admin'::public.member_role
where lower(email) in (
  'hola@telluscoop.org',
  'kohcuendedani@gmail.com',
  'mishekoh@gmail.com',
  'bastian@telluscoop.org'
);
update public.organization_members m
set role = 'admin'::public.member_role
from auth.users u
where m.user_id = u.id
  and lower(u.email) in (
    'hola@telluscoop.org',
    'kohcuendedani@gmail.com',
    'mishekoh@gmail.com',
    'bastian@telluscoop.org'
  )
-- version: 20260716201500  name: add_luma_event_links
alter table public.initiatives
  add column luma_event_id text,
  add column luma_url text,
  add column luma_registered_count integer not null default 0 check (luma_registered_count >= 0),
  add column luma_checked_in_count integer not null default 0 check (luma_checked_in_count >= 0),
  add column luma_synced_at timestamptz;
create unique index initiatives_org_luma_event_unique
  on public.initiatives (organization_id, luma_event_id)
-- version: 20260716203200  name: add_kohcuendepau_master
insert into private.admin_allowlist (email, organization_id, role)
select 'kohcuendepau@gmail.com', id, 'admin'::public.member_role
from public.organizations
where slug = 'tellus'
on conflict (email) do update
set organization_id = excluded.organization_id,
    role = excluded.role;
insert into public.profiles (id, full_name)
select id, coalesce(raw_user_meta_data ->> 'full_name', split_part(email, '@', 1))
from auth.users
where lower(email) = 'kohcuendepau@gmail.com'
on conflict (id) do nothing;
insert into public.organization_members (organization_id, user_id, role)
select o.id, u.id, 'admin'::public.member_role
from public.organizations o
join auth.users u on lower(u.email) = 'kohcuendepau@gmail.com'
where o.slug = 'tellus'
on conflict (organization_id, user_id) do update set role = excluded.role
-- version: 20260716204500  name: add_assignment_resources
alter table public.initiatives
  add column if not exists resource_links jsonb not null default '[]'::jsonb;
alter table public.deliverables
  add column if not exists resource_links jsonb not null default '[]'::jsonb;
alter table public.initiatives
  add constraint initiatives_resource_links_array check (jsonb_typeof(resource_links) = 'array');
alter table public.deliverables
  add constraint deliverables_resource_links_array check (jsonb_typeof(resource_links) = 'array');
create policy profiles_team_select on public.profiles for select to authenticated
using (exists (
  select 1
  from public.organization_members mine
  join public.organization_members teammate on teammate.organization_id = mine.organization_id
  where mine.user_id = (select auth.uid()) and teammate.user_id = profiles.id
))
-- version: 20260716210000  name: add_programs_and_event_contacts
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);
alter table public.initiatives
  add column program_id uuid references public.programs(id) on delete set null;
create index initiatives_program_idx on public.initiatives(program_id);
create table public.event_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  initiative_id uuid not null references public.initiatives(id) on delete cascade,
  email text not null check (email = lower(trim(email))),
  full_name text,
  attendance_status text not null default 'registered' check (attendance_status in ('registered','attended','no_show')),
  consent_recorded boolean not null default false,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);
create unique index event_contacts_initiative_email_unique on public.event_contacts(initiative_id, email);
create index event_contacts_org_idx on public.event_contacts(organization_id, initiative_id);
insert into public.programs (organization_id, code, name)
select o.id, p.code, p.name
from public.organizations o
cross join (values
  ('stellar_chile','Stellar Chile'),
  ('stellar_barrio','Stellar Barrio'),
  ('stellar_academy','Stellar Academy'),
  ('coffee_breaks','Coffee Breaks')
) p(code,name)
where o.slug = 'tellus'
on conflict (organization_id, code) do nothing;
update public.initiatives i
set program_id = p.id
from public.programs p
where i.organization_id = p.organization_id and p.code = 'stellar_chile' and i.program_id is null;
alter table public.programs enable row level security;
alter table public.event_contacts enable row level security;
create policy programs_member_select on public.programs for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = programs.organization_id and m.user_id = (select auth.uid())));
create policy programs_admin_all on public.programs for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = programs.organization_id and m.user_id = (select auth.uid()) and m.role = 'admin'))
with check (exists (select 1 from public.organization_members m where m.organization_id = programs.organization_id and m.user_id = (select auth.uid()) and m.role = 'admin'));
create policy event_contacts_member_all on public.event_contacts for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = event_contacts.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = event_contacts.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
create policy event_contacts_member_select on public.event_contacts for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = event_contacts.organization_id and m.user_id = (select auth.uid())));
grant select on public.programs, public.event_contacts to authenticated;
grant insert, update, delete on public.programs, public.event_contacts to authenticated
-- version: 20260716211500  name: add_inboxblessedux_master
insert into private.admin_allowlist (email, organization_id, role)
select 'inboxblessedux@gmail.com', id, 'admin'::public.member_role
from public.organizations
where slug = 'tellus'
on conflict (email) do update
set organization_id = excluded.organization_id,
    role = excluded.role;
insert into public.profiles (id, full_name)
select id, coalesce(raw_user_meta_data ->> 'full_name', split_part(email, '@', 1))
from auth.users
where lower(email) = 'inboxblessedux@gmail.com'
on conflict (id) do nothing;
insert into public.organization_members (organization_id, user_id, role)
select o.id, u.id, 'admin'::public.member_role
from public.organizations o
join auth.users u on lower(u.email) = 'inboxblessedux@gmail.com'
where o.slug = 'tellus'
on conflict (organization_id, user_id) do update set role = excluded.role
-- version: 20260716213000  name: add_program_operations
alter table public.metric_definitions add column program_id uuid references public.programs(id) on delete cascade;
alter table public.fund_transactions add column program_id uuid references public.programs(id) on delete set null;
alter table public.evidence add column program_id uuid references public.programs(id) on delete cascade;
update public.metric_definitions m set program_id = p.id
from public.programs p where p.organization_id = m.organization_id and p.code = 'stellar_chile' and m.program_id is null;
update public.fund_transactions f set program_id = p.id
from public.programs p where p.organization_id = f.organization_id and p.code = 'stellar_chile' and f.program_id is null;
create index metric_definitions_program_idx on public.metric_definitions(program_id, sort_order);
create index fund_transactions_program_idx on public.fund_transactions(program_id, occurred_on);
create index evidence_program_idx on public.evidence(program_id, created_at);
create table public.program_budgets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  period_id uuid not null references public.reporting_periods(id) on delete cascade,
  allocated_usd numeric(12,2) not null default 0 check (allocated_usd >= 0),
  notes text,
  updated_at timestamptz not null default now(),
  unique (program_id, period_id)
);
create table public.program_resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  title text not null,
  resource_type text not null default 'other' check (resource_type in ('google_sheets','google_drive','notion','form','presentation','github','other')),
  url text not null check (url ~ '^https?://'),
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index program_resources_program_idx on public.program_resources(program_id, created_at desc);
alter table public.program_budgets enable row level security;
alter table public.program_resources enable row level security;
create policy program_budgets_member_select on public.program_budgets for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = program_budgets.organization_id and m.user_id = (select auth.uid())));
create policy program_budgets_editor_all on public.program_budgets for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = program_budgets.organization_id and m.user_id = (select auth.uid()) and m.role in ('admin','finance')))
with check (exists (select 1 from public.organization_members m where m.organization_id = program_budgets.organization_id and m.user_id = (select auth.uid()) and m.role in ('admin','finance')));
create policy program_resources_member_select on public.program_resources for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = program_resources.organization_id and m.user_id = (select auth.uid())));
create policy program_resources_editor_all on public.program_resources for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = program_resources.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = program_resources.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
grant select on public.program_budgets, public.program_resources to authenticated;
grant insert, update, delete on public.program_budgets, public.program_resources to authenticated
-- version: 20260716213500  name: scope_deliverables_to_programs
alter table public.deliverables add column program_id uuid references public.programs(id) on delete set null;
create index deliverables_program_idx on public.deliverables(program_id, due_on);
update public.deliverables d set program_id = p.id
from public.programs p where p.organization_id = d.organization_id and p.code = 'stellar_chile' and d.program_id is null
-- version: 20260716214000  name: allow_program_evidence
alter table public.evidence drop constraint evidence_check;
alter table public.evidence add constraint evidence_parent_check
  check (program_id is not null or initiative_id is not null or deliverable_id is not null)
-- version: 20260716220000  name: add_program_participants
create table public.program_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  full_name text,
  email text not null check (email = lower(trim(email))),
  github text,
  participant_rank text,
  source_name text,
  imported_by uuid references auth.users(id) on delete set null,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, email)
);
create index program_participants_program_idx on public.program_participants(program_id, full_name);
alter table public.program_participants enable row level security;
create policy program_participants_member_select on public.program_participants for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = program_participants.organization_id and m.user_id = (select auth.uid())));
create policy program_participants_editor_all on public.program_participants for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = program_participants.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = program_participants.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
grant select, insert, update, delete on public.program_participants to authenticated
-- version: 20260716223000  name: add_team_identity_and_audit
insert into private.admin_allowlist (email, organization_id, role)
select 'alexbnjmnch@gmail.com', id, 'admin'::public.member_role
from public.organizations where slug = 'tellus'
on conflict (email) do update set organization_id = excluded.organization_id, role = excluded.role;
with names(email, full_name) as (values
  ('kohcuendepau@gmail.com','Pau Koh'),
  ('hola@telluscoop.org','Tellus Cooperative Admin'),
  ('bastian@telluscoop.org','Bastian'),
  ('mishekoh@gmail.com','Mishelle'),
  ('kohcuendedani@gmail.com','Daniel'),
  ('alexbnjmnch@gmail.com','Alex Hernández'),
  ('inboxblessedux@gmail.com','Joaquín Farfán')
)
update auth.users u set raw_user_meta_data = coalesce(u.raw_user_meta_data,'{}'::jsonb) || jsonb_build_object('full_name', names.full_name)
from names where lower(u.email) = names.email;
with names(email, full_name) as (values
  ('kohcuendepau@gmail.com','Pau Koh'),
  ('hola@telluscoop.org','Tellus Cooperative Admin'),
  ('bastian@telluscoop.org','Bastian'),
  ('mishekoh@gmail.com','Mishelle'),
  ('kohcuendedani@gmail.com','Daniel'),
  ('alexbnjmnch@gmail.com','Alex Hernández'),
  ('inboxblessedux@gmail.com','Joaquín Farfán')
)
insert into public.profiles (id, full_name)
select u.id, names.full_name from auth.users u join names on lower(u.email) = names.email
on conflict (id) do update set full_name = excluded.full_name;
alter table public.programs add column lead_email text;
alter table public.programs add column lead_user_id uuid references auth.users(id) on delete set null;
update public.programs set lead_email = case code when 'stellar_academy' then 'alexbnjmnch@gmail.com' when 'stellar_barrio' then 'inboxblessedux@gmail.com' else lead_email end;
update public.programs p set lead_user_id = u.id from auth.users u where lower(u.email) = lower(p.lead_email);
create or replace function private.link_program_lead()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.programs set lead_user_id = new.id where lower(lead_email) = lower(new.email);
  return new;
end;
$$;
revoke all on function private.link_program_lead() from public, anon, authenticated;
create trigger link_program_lead_after_signup after insert on auth.users for each row execute function private.link_program_lead();
create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid references public.programs(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('insert','update','delete')),
  entity_table text not null,
  entity_id text,
  entity_label text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_org_created_idx on public.audit_log(organization_id, created_at desc);
create index audit_log_program_created_idx on public.audit_log(program_id, created_at desc);
alter table public.audit_log enable row level security;
create policy audit_log_member_select on public.audit_log for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = audit_log.organization_id and m.user_id = (select auth.uid())));
grant select on public.audit_log to authenticated;
create or replace function public.capture_ops_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  row_data jsonb;
  old_row jsonb;
  org uuid;
  program uuid;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_row := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  org := nullif(row_data ->> 'organization_id','')::uuid;
  program := nullif(row_data ->> 'program_id','')::uuid;
  if program is null and tg_table_name = 'metric_updates' then select program_id into program from public.metric_definitions where id = nullif(row_data ->> 'metric_id','')::uuid; end if;
  if program is null and tg_table_name = 'event_contacts' then select program_id into program from public.initiatives where id = nullif(row_data ->> 'initiative_id','')::uuid; end if;
  insert into public.audit_log (organization_id, program_id, actor_user_id, action, entity_table, entity_id, entity_label, old_data, new_data)
  values (org, program, (select auth.uid()), lower(tg_op), tg_table_name, row_data ->> 'id', coalesce(row_data ->> 'title', row_data ->> 'label', row_data ->> 'description', row_data ->> 'email', row_data ->> 'full_name'), old_row, case when tg_op = 'DELETE' then null else row_data end);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.capture_ops_audit() from public, anon, authenticated;
do $$
declare table_name text;
begin
  foreach table_name in array array['programs','program_budgets','program_resources','program_participants','initiatives','deliverables','evidence','fund_transactions','metric_definitions','metric_updates','event_contacts']
  loop
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.capture_ops_audit()', table_name, table_name);
  end loop;
end $$
-- version: 20260716223500  name: correct_program_lead_names
with names(email, full_name) as (values
  ('alexbnjmnch@gmail.com','Alex Hernández'),
  ('inboxblessedux@gmail.com','Joaquín Farfán')
)
update auth.users u set raw_user_meta_data = coalesce(u.raw_user_meta_data,'{}'::jsonb) || jsonb_build_object('full_name', names.full_name)
from names where lower(u.email) = names.email;
with names(email, full_name) as (values
  ('alexbnjmnch@gmail.com','Alex Hernández'),
  ('inboxblessedux@gmail.com','Joaquín Farfán')
)
insert into public.profiles (id, full_name)
select u.id, names.full_name from auth.users u join names on lower(u.email) = names.email
on conflict (id) do update set full_name = excluded.full_name
-- version: 20260716224500  name: expand_program_participant_profiles
alter table public.program_participants
  add column if not exists events_attended text,
  add column if not exists discord text,
  add column if not exists roster_source text,
  add column if not exists program_status text,
  add column if not exists program_role text,
  add column if not exists discord_roles text,
  add column if not exists participant_type text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists personal_url text,
  add column if not exists project_company text,
  add column if not exists experience text,
  add column if not exists classification_note text,
  add column if not exists phone text,
  add column if not exists source_data jsonb not null default '{}'::jsonb;
comment on column public.program_participants.source_data is
  'Original imported row retained losslessly for traceability and future mappings.'
-- version: 20260716225500  name: automate_ambassador_ranks
alter table public.program_participants
  add column if not exists events_attended_count integer not null default 0 check (events_attended_count >= 0),
  add column if not exists rank_mode text not null default 'automatic' check (rank_mode in ('automatic','manual')),
  add column if not exists rank_updated_at timestamptz,
  add column if not exists rank_updated_by uuid references auth.users(id) on delete set null;
update public.program_participants
set events_attended_count = case
      when coalesce(events_attended, '') ~ '^\s*[0-9]+\s*$' then trim(events_attended)::integer
      else 0
    end,
    rank_mode = case when lower(coalesce(participant_rank,'')) in ('leader','contributor') then 'manual' else 'automatic' end;
create or replace function public.apply_ambassador_rank()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.events_attended_count := greatest(coalesce(new.events_attended_count, 0), 0);
  new.events_attended := new.events_attended_count::text;

  if new.rank_mode = 'automatic' then
    new.participant_rank := case
      when new.events_attended_count >= 3 then 'Builder'
      when new.events_attended_count >= 2 and nullif(trim(coalesce(new.github,'')), '') is not null then 'Builder'
      else 'Explorer'
    end;
    if new.participant_rank is distinct from old.participant_rank then
      new.rank_updated_at := now();
      new.rank_updated_by := (select auth.uid());
    end if;
  elsif new.participant_rank not in ('Contributor','Leader') then
    raise exception 'Los rangos manuales permitidos son Contributor y Leader';
  end if;

  return new;
end;
$$;
drop trigger if exists apply_ambassador_rank_trigger on public.program_participants;
create trigger apply_ambassador_rank_trigger
before insert or update of events_attended_count, github, rank_mode, participant_rank
on public.program_participants
for each row execute function public.apply_ambassador_rank();
-- Run every automatic profile through the rule after the trigger exists.
update public.program_participants
set events_attended_count = events_attended_count
where rank_mode = 'automatic';
create or replace function public.sync_event_attendance_to_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_attended boolean := false;
  new_attended boolean := false;
  target_email text;
  target_initiative uuid;
  target_program uuid;
  delta integer;
begin
  if tg_op <> 'INSERT' then old_attended := old.attendance_status = 'attended'; end if;
  if tg_op <> 'DELETE' then new_attended := new.attendance_status = 'attended'; end if;
  delta := (case when new_attended then 1 else 0 end) - (case when old_attended then 1 else 0 end);
  if delta = 0 then return coalesce(new, old); end if;

  target_email := lower(trim(coalesce(new.email, old.email)));
  target_initiative := coalesce(new.initiative_id, old.initiative_id);
  select i.program_id into target_program from public.initiatives i where i.id = target_initiative;

  update public.program_participants p
  set events_attended_count = greatest(p.events_attended_count + delta, 0), updated_at = now()
  where p.program_id = target_program and p.email = target_email;

  return coalesce(new, old);
end;
$$;
drop trigger if exists sync_event_attendance_to_participant_trigger on public.event_contacts;
create trigger sync_event_attendance_to_participant_trigger
after insert or update of attendance_status or delete on public.event_contacts
for each row execute function public.sync_event_attendance_to_participant();
comment on column public.program_participants.rank_mode is
  'automatic promotes Explorer to Builder; manual is reserved for Contributor and Leader.'
-- version: 20260716231000  name: assign_program_lead_teams
alter table public.programs
  add column if not exists lead_emails text[] not null default '{}'::text[];
update public.programs
set lead_email = case code
      when 'stellar_chile' then 'bastian@telluscoop.org'
      when 'stellar_barrio' then 'inboxblessedux@gmail.com'
      when 'stellar_academy' then 'alexbnjmnch@gmail.com'
      when 'coffee_breaks' then 'kohcuendedani@gmail.com'
      else lead_email
    end,
    lead_emails = case code
      when 'stellar_chile' then array['bastian@telluscoop.org']
      when 'stellar_barrio' then array['inboxblessedux@gmail.com']
      when 'stellar_academy' then array['alexbnjmnch@gmail.com']
      when 'coffee_breaks' then array['kohcuendedani@gmail.com','mishekoh@gmail.com']
      else lead_emails
    end
where code in ('stellar_chile','stellar_barrio','stellar_academy','coffee_breaks');
update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name','Bastian Koh')
where lower(email) = 'bastian@telluscoop.org';
update public.profiles p
set full_name = 'Bastian Koh', updated_at = now()
from auth.users u
where p.id = u.id and lower(u.email) = 'bastian@telluscoop.org';
comment on column public.programs.lead_emails is
  'Ordered list of program leads; lead_email remains the primary lead for compatibility.'
-- version: 20260717001000  name: sync_sow_deliverable_descriptions
-- Keep Stellar Chile deliverables aligned with the signed SOW, Exhibit A, Section 4.
update public.deliverables d set description = case
  when d.title = 'Plan de lanzamiento' then
    'Chapter Launch Plan — Written plan outlining how the Service Provider will achieve the KPIs in Section 5, including: (i) proposed event calendar; (ii) ambassador recruitment and outreach strategy; (iii) developer engagement strategy; (iv) ecosystem partnership strategy; and (v) Instaward and SCF pipeline development approach. Delivery: written submission to Company POC. Acceptance: submitted by due date; addresses each KPI category in Section 5; accepted by the Company.'
  when d.title like 'Entregables mensuales — %' then
    'Community Events — Event Documentation Packages evidencing a minimum of three (3) Qualifying Events, including: (i) event agenda; (ii) attendance records; (iii) photographs, screenshots, or other evidence of event execution; (iv) event summary; and (v) outcomes achieved. Educational and Developer Content Deliverables — evidence of publication of a minimum of two (2) original content pieces. SCF Project Referrals — documentation of a minimum of two (2) SCF referrals submitted through Company-designated processes. Instaward Identifications — documentation of a minimum of three (3) eligible Instaward candidate submissions through Company-designated processes. Monthly Activity Report — covering: (i) ambassador recruitment activities and current chapter roster; (ii) Qualifying Events; (iii) developer engagement and onboarding; (iv) SCF referral pipeline; (v) Instaward candidate pipeline; (vi) ecosystem partnership outreach and partnerships established; and (vii) planned initiatives for the following month. Delivery: Airtable and Monthly Activity Report submission to Company POC. Acceptance: submitted by due date, all required documentation and sections included, and activity data consistent with Airtable records.'
  when d.title = 'Validación KPI — meses 1 a 3' then
    'Quarterly KPI Validation Report (Month 3) — Comprehensive KPI validation report evidencing performance against each KPI category in Section 5, supported by: (i) ambassador onboarding records; (ii) event documentation; (iii) developer engagement records; (iv) SCF referral records; (v) Instaward records; and (vi) ecosystem partnership documentation. Delivery: Airtable and written submission to Company POC. Acceptance: all KPI categories addressed and supporting documentation sufficient to validate reported figures.'
  when d.title = 'Validación KPI — meses 4 a 6' then
    'Quarterly KPI Validation Report (Month 6) — Comprehensive KPI validation report evidencing performance against each KPI category in Section 5, supported by: (i) ambassador onboarding records; (ii) event documentation; (iii) developer engagement records; (iv) SCF referral records; (v) Instaward records; and (vi) ecosystem partnership documentation. Delivery: Airtable and written submission to Company POC. Acceptance: all KPI categories addressed and supporting documentation sufficient to validate reported figures.'
  when d.title = 'Paquete de transición' then
    'End-of-Term Transition Package — Final chapter status report including: (i) current ambassador roster and tier status; (ii) inventory of Program accounts, assets, and access credentials; (iii) outstanding third-party commitments; (iv) status of ecosystem partnerships; and (v) transition recommendations and handover notes for any successor service provider. Delivery: written submission to Company POC. Acceptance: all required information provided and any requested materials transferred to the Company.'
  else d.description
end
from public.programs p
where d.program_id = p.id and p.code = 'stellar_chile'
-- version: 20260717003000  name: harden_sync_function_and_indexes
-- Trigger-only function: it must not be callable through the public RPC API.
revoke execute on function public.sync_event_attendance_to_participant() from public, anon, authenticated;
-- Cover foreign keys used by the operational dashboard and audit trail.
create index if not exists admin_allowlist_organization_idx
  on private.admin_allowlist (organization_id);
create index if not exists audit_log_actor_user_idx
  on public.audit_log (actor_user_id);
create index if not exists program_budgets_organization_period_idx
  on public.program_budgets (organization_id, period_id);
create index if not exists program_participants_organization_idx
  on public.program_participants (organization_id);
create index if not exists program_resources_organization_idx
  on public.program_resources (organization_id);
create index if not exists programs_lead_user_idx
  on public.programs (lead_user_id)
  where lead_user_id is not null
-- version: 20260717120000  name: create_social_analyzer
-- Ops/Social — analizador de contenido social (Fase 1)
-- Tablas org-scoped con el mismo modelo RLS que Stellar Ops:
-- lectura para miembros, escritura para roles distintos de viewer.

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform text not null check (platform in ('x', 'linkedin', 'instagram')),
  handle text not null,
  display_name text,
  category text not null default 'general',
  url text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, platform, handle)
);
create index social_accounts_org_idx on public.social_accounts(organization_id, platform, category);
create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid references public.social_accounts(id) on delete set null,
  platform text not null check (platform in ('x', 'linkedin', 'instagram')),
  author_handle text not null,
  url text,
  content text not null,
  media_url text,
  posted_at timestamptz,
  likes numeric not null default 0 check (likes >= 0),
  reposts numeric not null default 0 check (reposts >= 0),
  replies numeric not null default 0 check (replies >= 0),
  views numeric not null default 0 check (views >= 0),
  score numeric,
  analysis jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  source text not null default 'manual' check (source in ('manual', 'scraper')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index social_posts_org_idx on public.social_posts(organization_id, platform, posted_at desc);
create index social_posts_account_idx on public.social_posts(account_id);
create unique index social_posts_org_url_idx on public.social_posts(organization_id, url) where url is not null;
create table public.repo_picks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  repo_full_name text not null,
  url text not null,
  description text,
  stars numeric not null default 0 check (stars >= 0),
  language text,
  topics text[] not null default '{}',
  reason text,
  status text not null default 'inbox' check (status in ('inbox', 'reviewed', 'shared', 'discarded')),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, repo_full_name)
);
create index repo_picks_org_idx on public.repo_picks(organization_id, status);
create trigger social_accounts_touch before update on public.social_accounts for each row execute function public.touch_updated_at();
create trigger social_posts_touch before update on public.social_posts for each row execute function public.touch_updated_at();
create trigger repo_picks_touch before update on public.repo_picks for each row execute function public.touch_updated_at();
alter table public.social_accounts enable row level security;
alter table public.social_posts enable row level security;
alter table public.repo_picks enable row level security;
create policy social_accounts_member_select on public.social_accounts for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = social_accounts.organization_id and m.user_id = (select auth.uid())));
create policy social_accounts_member_all on public.social_accounts for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = social_accounts.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = social_accounts.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
create policy social_posts_member_select on public.social_posts for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = social_posts.organization_id and m.user_id = (select auth.uid())));
create policy social_posts_member_all on public.social_posts for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = social_posts.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = social_posts.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
create policy repo_picks_member_select on public.repo_picks for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = repo_picks.organization_id and m.user_id = (select auth.uid())));
create policy repo_picks_member_all on public.repo_picks for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = repo_picks.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = repo_picks.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
grant select on public.social_accounts, public.social_posts, public.repo_picks to authenticated;
grant insert, update, delete on public.social_accounts, public.social_posts, public.repo_picks to authenticated;
-- Cuentas semilla observadas en X, con su categoría editorial.
with org as (select id from public.organizations where slug = 'tellus')
insert into public.social_accounts (organization_id, platform, handle, display_name, category, url)
select org.id, 'x', a.handle, a.display_name, a.category, 'https://x.com/' || a.handle
from org cross join (values
  ('telluscoop', 'Tellus Cooperative', 'tellus-own'),
  ('midudev', 'Miguel Ángel Durán', 'ai-dev-news'),
  ('DotCSV', 'Dot CSV', 'ai-dev-news'),
  ('S0N_IA', 'SON IA', 'ai-dev-news'),
  ('nicos_ai', 'Nicos AI', 'ai-dev-news'),
  ('0xJokker', 'Jokker', 'ai-dev-news'),
  ('aresotik', 'Aresotik', 'ai-dev-news'),
  ('hqmank', 'HQ Mank', 'ai-dev-news'),
  ('angeldot_', 'Angeldot', 'ai-dev-news'),
  ('precisox', 'Precisox', 'ai-dev-news'),
  ('SantiTorAI', 'Santi Tor AI', 'ai-dev-news'),
  ('dev_gen88926', 'Dev Gen', 'memes'),
  ('marclou', 'Marc Lou', 'saas'),
  ('jackfriks', 'Jack Friks', 'micro-apps'),
  ('athcanft', 'Athcan', 'mobile-apps'),
  ('wickedguro', 'Wicked Guro', 'distribution'),
  ('levelsio', 'Pieter Levels', 'internet-business'),
  ('vitaliidodonov', 'Vitalii Dodonov', 'shipping'),
  ('robj3d3', 'Rob J3d3', 'ai-coding'),
  ('illyism', 'Illyism', 'seo'),
  ('kalashvasaniya', 'Kalash Vasaniya', 'launch'),
  ('gregisenberg', 'Greg Isenberg', 'startup-ideas'),
  ('tibo_maker', 'Tibo', 'audience'),
  ('sushilwtf', 'Sushil', 'indie-legend'),
  ('robiartec', 'Robiartec', 'repos')
) as a(handle, display_name, category)
-- version: 20260717130000  name: grant_social_service_role
-- The initial Stellar Ops migration recreated the public schema and granted
-- table privileges only to `authenticated`, so `service_role` (used by the
-- social scraper worker) has schema usage but no table privileges and hits
-- "permission denied". service_role bypasses RLS, so table GRANTs are all it
-- needs. Scope stays narrow: read organizations, full access to social tables.

grant select on public.organizations to service_role;
grant select, insert, update, delete on
  public.social_accounts, public.social_posts, public.repo_picks
  to service_role
-- version: 20260717140000  name: create_articles
-- Ops/Social — generador de artículos diarios (boletín Beehiiv)
-- Plantillas de prompt editables + artículos generados. Mismo modelo RLS.

create table public.article_prompts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  name text not null,
  prompt_md text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);
create index article_prompts_org_idx on public.article_prompts(organization_id, key);
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  prompt_key text not null default 'crypto',
  title text not null,
  subtitle text,
  summary text[] not null default '{}',
  body_md text not null,
  sources jsonb not null default '[]'::jsonb,
  model text,
  status text not null default 'draft' check (status in ('draft', 'approved', 'published', 'discarded')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index articles_org_idx on public.articles(organization_id, status, created_at desc);
create trigger article_prompts_touch before update on public.article_prompts for each row execute function public.touch_updated_at();
create trigger articles_touch before update on public.articles for each row execute function public.touch_updated_at();
alter table public.article_prompts enable row level security;
alter table public.articles enable row level security;
create policy article_prompts_member_select on public.article_prompts for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = article_prompts.organization_id and m.user_id = (select auth.uid())));
create policy article_prompts_member_all on public.article_prompts for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = article_prompts.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = article_prompts.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
create policy articles_member_select on public.articles for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = articles.organization_id and m.user_id = (select auth.uid())));
create policy articles_member_all on public.articles for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = articles.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = articles.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
grant select on public.article_prompts, public.articles to authenticated;
grant insert, update, delete on public.article_prompts, public.articles to authenticated;
-- Plantilla cripto (editorial Tellus). Dollar-quoted para no escapar comillas.
with org as (select id from public.organizations where slug = 'tellus')
insert into public.article_prompts (organization_id, key, name, prompt_md)
select org.id, 'crypto', 'Cripto diario (Beehiiv)', $prompt$Escribe una nota diaria de noticias cripto en español LATAM, con el tono y criterio editorial de Tellus Cooperative.

El artículo es un resumen de lo ocurrido el día anterior, pensado para leerse en la mañana por alguien que quiere entender qué pasó sin ruido ni hype.

VOZ Y ESTILO
- Cercano, claro y humano; como a un amigo inteligente (estilo Milk Road, sin exagerar).
- Sin jerga innecesaria, sin tono trader. Crítico pero constructivo.
- Enfocado en contexto y consecuencias, no solo en precios.
- Perspectiva LATAM: por qué lo que pasó en EE.UU., Europa o África importa en nuestra región.
- Frases cortas, ritmo ágil, analogías simples.

ESTRUCTURA OBLIGATORIA
1. Título SEO-friendly, corto y hooky (máx 5-6 palabras) que mencione el tema central del día.
2. Subtítulo SEO-friendly: 1 frase que resuma los 2-3 hechos clave, natural, sin keyword stuffing.
3. Resumen para gente ocupada: 3 a 5 bullets; cada uno responde qué pasó y por qué importa.
4. Desarrollo: secciones cortas con subtítulos; primero qué pasó, luego por qué importa; sin tecnicismos innecesarios; nada de predicciones de precio.
5. En foco (opcional): un tema transversal del día (regulación, privacidad, poder de plataformas, infraestructura) que conecte dos o más noticias.
6. Cierre Tellus: reflexión breve sobre poder y control, infraestructura financiera, inclusión o descentralización. No moralizar; invitar a pensar.

SEO: usar de forma natural Bitcoin, mercado cripto, regulación, exchanges, minería, DeFi. Lenguaje humano primero.

FUENTES: incluir todas las fuentes reales usadas, con links directos, solo medios/dashboards/comunicados confiables.

EVITAR: emojis excesivos, tono trader/gambling, clickbait vacío, copiar titulares anglo, opiniones sin contexto.$prompt$
from org;
-- Plantilla IA (misma voz, tema inteligencia artificial).
with org as (select id from public.organizations where slug = 'tellus')
insert into public.article_prompts (organization_id, key, name, prompt_md)
select org.id, 'ai', 'IA diario (Beehiiv)', $prompt$Escribe una nota diaria de noticias de inteligencia artificial en español LATAM, con el tono y criterio editorial de Tellus Cooperative.

El artículo es un resumen de lo ocurrido el día anterior, pensado para leerse en la mañana por alguien que quiere entender qué pasó sin ruido ni hype.

VOZ Y ESTILO
- Cercano, claro y humano; como a un amigo inteligente (estilo Milk Road, sin exagerar).
- Sin jerga innecesaria, sin tono de fanático. Crítico pero constructivo.
- Enfocado en contexto y consecuencias, no solo en anuncios de producto.
- Perspectiva LATAM: por qué lo que pasó en EE.UU., Europa, China o África importa en nuestra región.
- Frases cortas, ritmo ágil, analogías simples.

ESTRUCTURA OBLIGATORIA
1. Título SEO-friendly, corto y hooky (máx 5-6 palabras) que mencione el tema central del día.
2. Subtítulo SEO-friendly: 1 frase que resuma los 2-3 hechos clave, natural, sin keyword stuffing.
3. Resumen para gente ocupada: 3 a 5 bullets; cada uno responde qué pasó y por qué importa.
4. Desarrollo: secciones cortas con subtítulos; primero qué pasó, luego por qué importa; sin tecnicismos innecesarios.
5. En foco (opcional): un tema transversal del día (regulación, datos, poder de plataformas, cómputo, trabajo) que conecte dos o más noticias.
6. Cierre Tellus: reflexión breve sobre poder y control, infraestructura, inclusión o soberanía tecnológica. No moralizar; invitar a pensar.

SEO: usar de forma natural inteligencia artificial, modelos de lenguaje, código abierto, regulación, cómputo, agentes. Lenguaje humano primero.

FUENTES: incluir todas las fuentes reales usadas, con links directos, solo medios/blogs oficiales/comunicados confiables.

EVITAR: emojis excesivos, hype de producto, clickbait vacío, copiar titulares anglo, opiniones sin contexto.$prompt$
from org
-- version: 20260717150000  name: create_social_topics
-- Ops/Social — temas de búsqueda automática en X.
-- El equipo define temas; el cron (worker) y el botón "Buscar ahora" (Edge
-- Function x-search) traen posts de cada tema a social_posts. Reemplaza la
-- captura manual como flujo principal del feed.

create table public.social_topics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text not null,
  query text not null,
  active boolean not null default true,
  last_run_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, query)
);
create index social_topics_org_idx on public.social_topics(organization_id, active);
create trigger social_topics_touch before update on public.social_topics for each row execute function public.touch_updated_at();
alter table public.social_topics enable row level security;
create policy social_topics_member_select on public.social_topics for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = social_topics.organization_id and m.user_id = (select auth.uid())));
create policy social_topics_member_all on public.social_topics for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = social_topics.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = social_topics.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
grant select on public.social_topics to authenticated;
grant insert, update, delete on public.social_topics to authenticated;
-- Worker (service_role) reads topics and updates last_run_at.
grant select, update on public.social_topics to service_role;
-- A few seed topics to show the flow; edit or delete freely.
with org as (select id from public.organizations where slug = 'tellus')
insert into public.social_topics (organization_id, label, query)
select org.id, t.label, t.query
from org cross join (values
  ('Stellar', 'Stellar OR Soroban lang:es'),
  ('Agentes IA', '"AI agents" OR "agentes de IA"'),
  ('Indie hacking', 'indie hacker OR "build in public"')
) as t(label, query)
-- version: 20260717210000  name: add_social_posts_to_articles
-- Persist generated social posts (X/WhatsApp/LinkedIn) with the article so the
-- team can reopen them anytime instead of regenerating.
alter table public.articles
  add column if not exists social_posts jsonb,
  add column if not exists social_link text
-- version: 20260717220000  name: fix_social_posts_upsert_index
-- The partial unique index (where url is not null) cannot back
-- ON CONFLICT (organization_id, url) from supabase-js, which broke the
-- x-search upsert. Replace with a full unique index: Postgres treats NULLs
-- as distinct, so url-less manual rows keep working.

-- Dedupe first so the unique index can build.
delete from public.social_posts a
  using public.social_posts b
  where a.id > b.id
    and a.organization_id = b.organization_id
    and a.url = b.url
    and a.url is not null;
drop index if exists public.social_posts_org_url_idx;
create unique index social_posts_org_url_idx
  on public.social_posts(organization_id, url)
-- version: 20260717230000  name: keep_x_search_awake
-- Render free instances sleep after 15 min idle; the cold start then blows the
-- edge function budget and the feed errors. Ping /health every 10 minutes.
-- Render free tier grants 750 instance-hours/month, so 24/7 fits.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
select cron.schedule(
  'keep-x-search-awake',
  '*/10 * * * *',
  $$ select net.http_get('https://telluscoop-x-search.onrender.com/health') $$
)
-- version: 20260721030000  name: create_guides
-- Ops/Social — sección de Guías técnicas por blockchain (Stellar, Avalanche,
-- Circle/USDC, Ethereum, Solana, Base, Mantle). Mismo modelo RLS que articles.

create table public.guides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  chain text not null,
  title text not null,
  subtitle text,
  body_md text not null,
  sources jsonb not null default '[]'::jsonb,
  images jsonb not null default '[]'::jsonb,
  social_posts jsonb,
  social_link text,
  model text,
  status text not null default 'draft' check (status in ('draft', 'approved', 'published', 'discarded')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index guides_org_idx on public.guides(organization_id, status, created_at desc);
create trigger guides_touch before update on public.guides for each row execute function public.touch_updated_at();
alter table public.guides enable row level security;
create policy guides_member_select on public.guides for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = guides.organization_id and m.user_id = (select auth.uid())));
create policy guides_member_all on public.guides for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = guides.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = guides.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
grant select on public.guides to authenticated;
grant insert, update, delete on public.guides to authenticated
-- version: 20260721040000  name: create_social_summary
-- Ops/Social — Resumen (seguidores, metas y frecuencia de posteo propia)

create table public.social_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform text not null check (platform in ('x', 'linkedin', 'instagram')),
  followers numeric not null check (followers >= 0),
  source text not null default 'manual' check (source in ('manual', 'scraper')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  captured_at timestamptz not null default now()
);
create index social_metrics_org_idx on public.social_metrics(organization_id, platform, captured_at desc);
create table public.social_goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform text not null check (platform in ('x', 'linkedin', 'instagram')),
  target_followers numeric check (target_followers >= 0),
  target_posts_per_week numeric check (target_posts_per_week >= 0),
  updated_at timestamptz not null default now(),
  unique (organization_id, platform)
);
create trigger social_goals_touch before update on public.social_goals for each row execute function public.touch_updated_at();
alter table public.social_metrics enable row level security;
alter table public.social_goals enable row level security;
create policy social_metrics_member_select on public.social_metrics for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = social_metrics.organization_id and m.user_id = (select auth.uid())));
create policy social_metrics_member_all on public.social_metrics for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = social_metrics.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = social_metrics.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
create policy social_goals_member_select on public.social_goals for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = social_goals.organization_id and m.user_id = (select auth.uid())));
create policy social_goals_member_all on public.social_goals for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = social_goals.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = social_goals.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
grant select, insert on public.social_metrics to authenticated;
grant select, insert, update on public.social_goals to authenticated;
-- Cuentas propias en LinkedIn e Instagram (X ya existe desde 20260717120000).
with org as (select id from public.organizations where slug = 'tellus')
insert into public.social_accounts (organization_id, platform, handle, display_name, category, url)
select org.id, a.platform, a.handle, a.display_name, 'tellus-own', a.url
from org cross join (values
  ('linkedin', 'tellus-cooperative', 'Tellus Cooperative', 'https://www.linkedin.com/company/tellus-cooperative'),
  ('instagram', 'telluscoop', 'Tellus Cooperative', 'https://www.instagram.com/telluscoop')
) as a(platform, handle, display_name, url)
on conflict (organization_id, platform, handle) do nothing
-- version: 20260721050000  name: monthly_growth_goal_and_cron
-- Ops/Social — meta de crecimiento neto mensual + refresh diario automático de X.
--
-- El refresh automático solo existe para X (único canal con scraper). LinkedIn
-- e Instagram no tienen API/scraper aprobado todavía y siguen siendo manuales
-- (ver ops/social/README.md, Fase 5).
--
-- Requisito único, manual, NO versionado acá (son secretos): correr una vez en
-- el SQL editor de Supabase antes de aplicar esta migración —
--   select vault.create_secret('https://rhzanxzoqmbxptvxgnfj.supabase.co', 'project_url');
--   select vault.create_secret('<service-role key del proyecto>', 'service_role_key');

alter table public.social_goals add column if not exists target_monthly_growth numeric check (target_monthly_growth >= 0);
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
select cron.schedule(
  'daily-x-profile-refresh',
  '0 9 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/x-profile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('handle', 'telluscoop')
  );
  $$
)
-- version: 20260721060000  name: refresh_all_default_goals_meme_picks
-- Ops/Social — el cron diario refresca las 3 cuentas, metas default de
-- crecimiento (+200/mes) y banco de memes guardados (meme_picks).

-- 1. Reprogramar el cron para refrescar X + Instagram + LinkedIn.
select cron.unschedule('daily-x-profile-refresh')
where exists (select 1 from cron.job where jobname = 'daily-x-profile-refresh');
select cron.schedule(
  'daily-x-profile-refresh',
  '0 9 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/x-profile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('handle', 'telluscoop', 'refresh', 'all')
  );
  $$
);
-- 2. Meta default: +200 seguidores al mes por cuenta (editable desde la UI).
with org as (select id from public.organizations where slug = 'tellus')
insert into public.social_goals (organization_id, platform, target_monthly_growth)
select org.id, p.platform, 200
from org cross join (values ('x'), ('linkedin'), ('instagram')) as p(platform)
on conflict (organization_id, platform) do update
  set target_monthly_growth = coalesce(public.social_goals.target_monthly_growth, excluded.target_monthly_growth);
-- 3. Banco de memes: los que scrapeamos/elegimos para reusar.
create table public.meme_picks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text,
  image_url text not null,
  page_url text,
  source text not null default 'reddit',
  subreddit text,
  score numeric not null default 0 check (score >= 0),
  status text not null default 'inbox' check (status in ('inbox', 'used', 'discarded')),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, image_url)
);
create index meme_picks_org_idx on public.meme_picks(organization_id, status, created_at desc);
create trigger meme_picks_touch before update on public.meme_picks for each row execute function public.touch_updated_at();
alter table public.meme_picks enable row level security;
create policy meme_picks_member_select on public.meme_picks for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = meme_picks.organization_id and m.user_id = (select auth.uid())));
create policy meme_picks_member_all on public.meme_picks for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = meme_picks.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = meme_picks.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
grant select, insert, update, delete on public.meme_picks to authenticated
-- version: 20260721070000  name: follow_targets
-- Ops/Social — listas de prospectos para follow asistido.
-- El follow lo confirma un humano en X (la sesión del scraper es de solo
-- lectura y automatizar follows quema la cuenta); acá solo guardamos a quién
-- queremos seguir, en qué lista, y si ya lo seguimos.

create table public.follow_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  list_name text not null default 'Prospectos',
  handle text not null,
  display_name text,
  bio text,
  followers numeric not null default 0 check (followers >= 0),
  source_handle text,
  status text not null default 'pending' check (status in ('pending', 'followed', 'skipped')),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, list_name, handle)
);
create index follow_targets_org_idx on public.follow_targets(organization_id, list_name, status);
create trigger follow_targets_touch before update on public.follow_targets for each row execute function public.touch_updated_at();
alter table public.follow_targets enable row level security;
create policy follow_targets_member_select on public.follow_targets for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = follow_targets.organization_id and m.user_id = (select auth.uid())));
create policy follow_targets_member_all on public.follow_targets for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = follow_targets.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = follow_targets.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
grant select, insert, update, delete on public.follow_targets to authenticated
-- version: 20260721080000  name: keep_awake_5min
-- Render free sleeps after ~15 min idle. Pinging every 10 min left windows
-- where a missed ping (job hiccup) let it sleep. Ping every 5 min instead —
-- 750 instance-hours/month still covers 24/7 since the ping just keeps the
-- existing instance warm, it doesn't spawn new ones.
select cron.unschedule('keep-x-search-awake')
where exists (select 1 from cron.job where jobname = 'keep-x-search-awake');
select cron.schedule(
  'keep-x-search-awake',
  '*/5 * * * *',
  $$ select net.http_get('https://telluscoop-x-search.onrender.com/health') $$
)
-- version: 20260819090000  name: create_qr_codes
-- Ops/Social — banco de códigos QR (link/texto -> QR reusable para bio, flyers, etc).

create table public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text,
  content text not null,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index qr_codes_org_idx on public.qr_codes(organization_id, created_at desc);
create trigger qr_codes_touch before update on public.qr_codes for each row execute function public.touch_updated_at();
alter table public.qr_codes enable row level security;
create policy qr_codes_member_select on public.qr_codes for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = qr_codes.organization_id and m.user_id = (select auth.uid())));
create policy qr_codes_member_all on public.qr_codes for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = qr_codes.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = qr_codes.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
grant select, insert, update, delete on public.qr_codes to authenticated
-- version: 20260825120000  name: create_gaming_leaderboard
-- supabase/migrations/20260825120000_create_gaming_leaderboard.sql
-- Gaming leaderboard — Fase 1 (core): jugadores, eventos, torneos, partidas, puntajes, premios.
-- Ver docs/superpowers/specs/2026-08-24-gaming-leaderboard-design.md

create table public.gaming_players (
  id uuid primary key default gen_random_uuid(),
  discord_id text not null unique,
  display_name text,
  avatar_url text,
  stellar_address text,
  discord_member boolean,
  discord_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger gaming_players_touch before update on public.gaming_players
for each row execute function public.touch_updated_at();
create table public.gaming_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  event_date date,
  location text,
  created_at timestamptz not null default now()
);
create index gaming_events_org_idx on public.gaming_events(organization_id, event_date desc);
create table public.gaming_tournaments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.gaming_events(id) on delete cascade,
  game text not null,
  format text not null check (format in ('elimination', 'heats')),
  status text not null default 'draft' check (status in ('draft', 'live', 'completed')),
  created_at timestamptz not null default now()
);
create index gaming_tournaments_event_idx on public.gaming_tournaments(event_id);
create table public.gaming_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.gaming_tournaments(id) on delete cascade,
  round int,
  next_match_id uuid references public.gaming_matches(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'live', 'confirmed')),
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index gaming_matches_tournament_idx on public.gaming_matches(tournament_id);
create table public.gaming_match_participants (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.gaming_matches(id) on delete cascade,
  player_id uuid not null references public.gaming_players(id) on delete cascade,
  placement int not null check (placement > 0),
  points_awarded int not null default 0,
  unique (match_id, player_id)
);
create index gaming_match_participants_player_idx on public.gaming_match_participants(player_id);
create table public.gaming_scores (
  player_id uuid primary key references public.gaming_players(id) on delete cascade,
  total_points int not null default 0,
  updated_at timestamptz not null default now()
);
create table public.gaming_rewards (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.gaming_players(id) on delete cascade,
  tournament_id uuid not null references public.gaming_tournaments(id) on delete cascade,
  description text not null,
  fulfilled boolean not null default false,
  fulfilled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index gaming_rewards_player_idx on public.gaming_rewards(player_id);
-- Fórmula de puntos (debe coincidir con leaderboard/points.mjs: 1ro=10, 2do=6, 3ro=3, resto=1)
create or replace function public.gaming_points_for_placement(placement int)
returns int
language sql
immutable
set search_path = ''
as $$
  select case
    when placement = 1 then 10
    when placement = 2 then 6
    when placement = 3 then 3
    else 1
  end;
$$;
create or replace function public.recalculate_gaming_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'UPDATE' and new.status = 'confirmed' and old.status is distinct from 'confirmed') then
    update public.gaming_match_participants
    set points_awarded = public.gaming_points_for_placement(placement)
    where match_id = new.id;

    insert into public.gaming_scores (player_id, total_points, updated_at)
    select mp.player_id, sum(mp.points_awarded), now()
    from public.gaming_match_participants mp
    join public.gaming_matches m on m.id = mp.match_id
    where m.status = 'confirmed'
      and mp.player_id in (select player_id from public.gaming_match_participants where match_id = new.id)
    group by mp.player_id
    on conflict (player_id) do update set total_points = excluded.total_points, updated_at = excluded.updated_at;
  end if;
  return new;
end;
$$;
drop trigger if exists gaming_matches_confirm_score on public.gaming_matches;
create trigger gaming_matches_confirm_score after update of status on public.gaming_matches
for each row execute function public.recalculate_gaming_score();
-- RLS: escritura de staff acotada por organization_members, igual que el resto del repo.
alter table public.gaming_players enable row level security;
alter table public.gaming_events enable row level security;
alter table public.gaming_tournaments enable row level security;
alter table public.gaming_matches enable row level security;
alter table public.gaming_match_participants enable row level security;
alter table public.gaming_scores enable row level security;
alter table public.gaming_rewards enable row level security;
create policy gaming_players_member_select on public.gaming_players for select to authenticated
using (exists (select 1 from public.organization_members m where m.user_id = (select auth.uid())));
create policy gaming_players_member_all on public.gaming_players for all to authenticated
using (exists (select 1 from public.organization_members m where m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.user_id = (select auth.uid()) and m.role <> 'viewer'));
grant select, insert, update, delete on public.gaming_players to authenticated;
create policy gaming_events_member_select on public.gaming_events for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = gaming_events.organization_id and m.user_id = (select auth.uid())));
create policy gaming_events_member_all on public.gaming_events for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = gaming_events.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.organization_members m where m.organization_id = gaming_events.organization_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
grant select, insert, update, delete on public.gaming_events to authenticated;
create policy gaming_tournaments_member_select on public.gaming_tournaments for select to authenticated
using (exists (select 1 from public.gaming_events e join public.organization_members m on m.organization_id = e.organization_id where e.id = gaming_tournaments.event_id and m.user_id = (select auth.uid())));
create policy gaming_tournaments_member_all on public.gaming_tournaments for all to authenticated
using (exists (select 1 from public.gaming_events e join public.organization_members m on m.organization_id = e.organization_id where e.id = gaming_tournaments.event_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.gaming_events e join public.organization_members m on m.organization_id = e.organization_id where e.id = gaming_tournaments.event_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
grant select, insert, update, delete on public.gaming_tournaments to authenticated;
create policy gaming_matches_member_select on public.gaming_matches for select to authenticated
using (exists (select 1 from public.gaming_tournaments t join public.gaming_events e on e.id = t.event_id join public.organization_members m on m.organization_id = e.organization_id where t.id = gaming_matches.tournament_id and m.user_id = (select auth.uid())));
create policy gaming_matches_member_all on public.gaming_matches for all to authenticated
using (exists (select 1 from public.gaming_tournaments t join public.gaming_events e on e.id = t.event_id join public.organization_members m on m.organization_id = e.organization_id where t.id = gaming_matches.tournament_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.gaming_tournaments t join public.gaming_events e on e.id = t.event_id join public.organization_members m on m.organization_id = e.organization_id where t.id = gaming_matches.tournament_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
grant select, insert, update, delete on public.gaming_matches to authenticated;
create policy gaming_match_participants_member_select on public.gaming_match_participants for select to authenticated
using (exists (select 1 from public.gaming_matches gm join public.gaming_tournaments t on t.id = gm.tournament_id join public.gaming_events e on e.id = t.event_id join public.organization_members m on m.organization_id = e.organization_id where gm.id = gaming_match_participants.match_id and m.user_id = (select auth.uid())));
create policy gaming_match_participants_member_all on public.gaming_match_participants for all to authenticated
using (exists (select 1 from public.gaming_matches gm join public.gaming_tournaments t on t.id = gm.tournament_id join public.gaming_events e on e.id = t.event_id join public.organization_members m on m.organization_id = e.organization_id where gm.id = gaming_match_participants.match_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.gaming_matches gm join public.gaming_tournaments t on t.id = gm.tournament_id join public.gaming_events e on e.id = t.event_id join public.organization_members m on m.organization_id = e.organization_id where gm.id = gaming_match_participants.match_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
grant select, insert, update, delete on public.gaming_match_participants to authenticated;
create policy gaming_scores_member_select on public.gaming_scores for select to authenticated
using (exists (select 1 from public.organization_members m where m.user_id = (select auth.uid())));
grant select on public.gaming_scores to authenticated;
-- gaming_scores solo se escribe desde recalculate_gaming_score() (security definer); sin policy "all" a propósito.

create policy gaming_rewards_member_select on public.gaming_rewards for select to authenticated
using (exists (select 1 from public.gaming_tournaments t join public.gaming_events e on e.id = t.event_id join public.organization_members m on m.organization_id = e.organization_id where t.id = gaming_rewards.tournament_id and m.user_id = (select auth.uid())));
create policy gaming_rewards_member_all on public.gaming_rewards for all to authenticated
using (exists (select 1 from public.gaming_tournaments t join public.gaming_events e on e.id = t.event_id join public.organization_members m on m.organization_id = e.organization_id where t.id = gaming_rewards.tournament_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'))
with check (exists (select 1 from public.gaming_tournaments t join public.gaming_events e on e.id = t.event_id join public.organization_members m on m.organization_id = e.organization_id where t.id = gaming_rewards.tournament_id and m.user_id = (select auth.uid()) and m.role <> 'viewer'));
grant select, insert, update, delete on public.gaming_rewards to authenticated;
-- Vistas públicas: única superficie de lectura anónima. Las tablas base quedan cerradas a anon.
create view public.leaderboard_public_view as
select
  p.id as player_id,
  p.display_name,
  p.avatar_url,
  coalesce(s.total_points, 0) as total_points
from public.gaming_players p
left join public.gaming_scores s on s.player_id = p.id
order by coalesce(s.total_points, 0) desc;
grant select on public.leaderboard_public_view to anon, authenticated;
create view public.event_bracket_public_view as
select
  e.id as event_id,
  e.name as event_name,
  e.event_date,
  t.id as tournament_id,
  t.game,
  t.format,
  t.status as tournament_status,
  gm.id as match_id,
  gm.round,
  gm.status as match_status,
  mp.placement,
  p.display_name,
  p.avatar_url
from public.gaming_events e
join public.gaming_tournaments t on t.event_id = e.id
join public.gaming_matches gm on gm.tournament_id = t.id
join public.gaming_match_participants mp on mp.match_id = gm.id
join public.gaming_players p on p.id = mp.player_id;
grant select on public.event_bracket_public_view to anon, authenticated;
create view public.gaming_rewards_public_view as
select
  r.id as reward_id,
  r.description,
  r.fulfilled,
  r.fulfilled_at,
  p.display_name,
  p.avatar_url
from public.gaming_rewards r
join public.gaming_players p on p.id = r.player_id
where r.fulfilled = true;
grant select on public.gaming_rewards_public_view to anon, authenticated
-- version: 20260826010000  name: add_discord_member_to_leaderboard_view
-- Expone discord_member en leaderboard_public_view — permite mostrar un check
-- "verificado" real en la fila del jugador, sin agregar ninguna columna sensible:
-- el identificador de Discord y el email siguen sin exponerse a anon.

create or replace view public.leaderboard_public_view as
select
  p.id as player_id,
  p.display_name,
  p.avatar_url,
  coalesce(s.total_points, 0) as total_points,
  p.discord_member
from public.gaming_players p
left join public.gaming_scores s on s.player_id = p.id
order by coalesce(s.total_points, 0) desc;
grant select on public.leaderboard_public_view to anon, authenticated
-- version: 20260826020000  name: add_stellar_passport_url
-- Permite a un jugador vincular su perfil de builder de Stellar Passport
-- (demo.stellarpassport.xyz) a su fila de gaming_players. Stellar Passport
-- todavía no tiene API pública (confirmado: solo hay perfiles autoalojados),
-- así que esto es un link autoreportado por el propio jugador, guardado por
-- discord-verify (mismo canal service-role ya validado — no se abre RLS
-- nueva de escritura directa del cliente sobre gaming_players).

alter table public.gaming_players
  add column if not exists stellar_passport_url text;
create or replace view public.leaderboard_public_view as
select
  p.id as player_id,
  p.display_name,
  p.avatar_url,
  coalesce(s.total_points, 0) as total_points,
  p.discord_member,
  p.stellar_passport_url
from public.gaming_players p
left join public.gaming_scores s on s.player_id = p.id
order by coalesce(s.total_points, 0) desc;
grant select on public.leaderboard_public_view to anon, authenticated
-- version: 20260826030000  name: add_stellar_passport_name
alter table public.gaming_players
  add column if not exists stellar_passport_name text;
create or replace view public.leaderboard_public_view as
select
  p.id as player_id,
  p.display_name,
  p.avatar_url,
  coalesce(s.total_points, 0) as total_points,
  p.discord_member,
  p.stellar_passport_url,
  p.stellar_passport_name
from public.gaming_players p
left join public.gaming_scores s on s.player_id = p.id
order by coalesce(s.total_points, 0) desc;
grant select on public.leaderboard_public_view to anon, authenticated
-- version: 20260826040000  name: add_username_bio_to_players
-- Adds a public username slug + short bio to gaming_players, so a player can
-- have a real, shareable profile URL (/tierly/u/:username) instead of only
-- being addressable by matching Discord display_name at runtime.

alter table public.gaming_players
  add column if not exists username text,
  add column if not exists bio text;
create unique index if not exists gaming_players_username_key
  on public.gaming_players (username)
  where username is not null;
drop view if exists public.leaderboard_public_view;
create view public.leaderboard_public_view as
select
  p.id as player_id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.bio,
  coalesce(s.total_points, 0) as total_points,
  p.discord_member,
  p.stellar_passport_url,
  p.stellar_passport_name
from public.gaming_players p
left join public.gaming_scores s on s.player_id = p.id
order by coalesce(s.total_points, 0) desc;
grant select on public.leaderboard_public_view to anon, authenticated
-- version: 20260826050000  name: sync_passport_profile_snapshot
-- Persiste en gaming_players el snapshot vinculado desde Stellar Passport
-- y los campos editables locales del perfil público de Tierly.

alter table public.gaming_players
  add column if not exists username text,
  add column if not exists bio text,
  add column if not exists twitter_handle text,
  add column if not exists telegram_handle text,
  add column if not exists discord_handle text,
  add column if not exists stellar_passport_username text,
  add column if not exists stellar_passport_avatar_url text,
  add column if not exists stellar_passport_bio text,
  add column if not exists stellar_passport_role_title text,
  add column if not exists stellar_passport_tier text,
  add column if not exists stellar_passport_project_count int,
  add column if not exists stellar_passport_commits_30d int,
  add column if not exists stellar_passport_active_days_30d int;
create unique index if not exists gaming_players_username_key
  on public.gaming_players (username)
  where username is not null;
drop view if exists public.leaderboard_public_view;
create view public.leaderboard_public_view as
select
  p.id as player_id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.bio,
  coalesce(s.total_points, 0) as total_points,
  p.discord_member,
  p.stellar_passport_url,
  p.stellar_passport_name
from public.gaming_players p
left join public.gaming_scores s on s.player_id = p.id
order by coalesce(s.total_points, 0) desc;
grant select on public.leaderboard_public_view to anon, authenticated
-- version: 20260826060000  name: add_instagram_handle
-- Agrega instagram_handle al perfil de gaming_players.

alter table public.gaming_players
  add column if not exists instagram_handle text
-- version: 20260827010000  name: add_player_id_to_public_views
-- Expone player_id (id estable de gaming_players) en las vistas públicas de
-- bracket y rewards, para dejar de matchear al jugador logueado por
-- display_name (frágil: colisiona si dos jugadores comparten nombre).

drop view if exists public.event_bracket_public_view;
create view public.event_bracket_public_view as
select
  e.id as event_id,
  e.name as event_name,
  e.event_date,
  t.id as tournament_id,
  t.game,
  t.format,
  t.status as tournament_status,
  gm.id as match_id,
  gm.round,
  gm.status as match_status,
  mp.placement,
  p.id as player_id,
  p.display_name,
  p.avatar_url
from public.gaming_events e
join public.gaming_tournaments t on t.event_id = e.id
join public.gaming_matches gm on gm.tournament_id = t.id
join public.gaming_match_participants mp on mp.match_id = gm.id
join public.gaming_players p on p.id = mp.player_id;
grant select on public.event_bracket_public_view to anon, authenticated;
drop view if exists public.gaming_rewards_public_view;
create view public.gaming_rewards_public_view as
select
  r.id as reward_id,
  r.description,
  r.fulfilled,
  r.fulfilled_at,
  p.id as player_id,
  p.display_name,
  p.avatar_url
from public.gaming_rewards r
join public.gaming_players p on p.id = r.player_id
where r.fulfilled = true;
grant select on public.gaming_rewards_public_view to anon, authenticated
-- version: 20260827020000  name: add_gaming_seasons
-- Temporadas de 6 meses: el ranking público se resetea cada 6 meses desde el
-- ancla 2026-08-27. gaming_scores/gaming_match_participants no se tocan (se
-- guarda todo el historial); el filtro por temporada vive en el view público,
-- calculado en vivo — así no hace falta cron ni estado que se pueda desincronizar.

create or replace function public.gaming_season_start(as_of date default current_date)
returns date
language sql
stable
set search_path = ''
as $$
  select (date '2026-08-27' + (
    (floor(
      (extract(year from age(as_of, date '2026-08-27')) * 12
        + extract(month from age(as_of, date '2026-08-27'))) / 6
    ))::int * 6
  ) * interval '1 month')::date;
$$;
drop view if exists public.leaderboard_public_view;
create view public.leaderboard_public_view as
select
  p.id as player_id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.bio,
  coalesce(sp.season_points, 0) as total_points,
  p.discord_member,
  p.stellar_passport_url,
  p.stellar_passport_name
from public.gaming_players p
left join (
  select mp.player_id, sum(mp.points_awarded) as season_points
  from public.gaming_match_participants mp
  join public.gaming_matches m on m.id = mp.match_id
  join public.gaming_tournaments t on t.id = m.tournament_id
  join public.gaming_events e on e.id = t.event_id
  where m.status = 'confirmed'
    and e.event_date >= public.gaming_season_start()
  group by mp.player_id
) sp on sp.player_id = p.id
order by coalesce(sp.season_points, 0) desc;
grant select on public.leaderboard_public_view to anon, authenticated
-- version: 20260827030000  name: add_bot_notification_tracking
-- Estado para que discord-bot pueda anunciar eventos nuevos y subidas de
-- rango una sola vez cada uno, sin reinstalar en memoria (el bot puede
-- reiniciar en cada deploy de Render).

alter table public.gaming_players
  add column if not exists last_notified_rank_min int;
create table public.gaming_bot_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('event')),
  ref_id uuid not null,
  created_at timestamptz not null default now(),
  unique (kind, ref_id)
);
alter table public.gaming_bot_notifications enable row level security;
-- Sin policies a propósito: solo el bot (service_role) lee/escribe acá, igual
-- que gaming_scores.
-- version: 20260828010000  name: add_profile_banner
-- Banner de perfil: vivía solo en localStorage del navegador de cada usuario,
-- por eso no se veía en /tierly#u/<username> desde otra sesión. Se persiste
-- en gaming_players y se expone en la vista pública.

alter table public.gaming_players
  add column if not exists banner text,
  add column if not exists banner_fit jsonb;
drop view if exists public.leaderboard_public_view;
create view public.leaderboard_public_view as
select
  p.id as player_id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.bio,
  p.banner,
  p.banner_fit,
  coalesce(sp.season_points, 0) as total_points,
  p.discord_member,
  p.stellar_passport_url,
  p.stellar_passport_name
from public.gaming_players p
left join (
  select mp.player_id, sum(mp.points_awarded) as season_points
  from public.gaming_match_participants mp
  join public.gaming_matches m on m.id = mp.match_id
  join public.gaming_tournaments t on t.id = m.tournament_id
  join public.gaming_events e on e.id = t.event_id
  where m.status = 'confirmed'
    and e.event_date >= public.gaming_season_start()
  group by mp.player_id
) sp on sp.player_id = p.id
order by coalesce(sp.season_points, 0) desc;
grant select on public.leaderboard_public_view to anon, authenticated
-- version: 20260829120000  name: add_chess_module
-- supabase/migrations/20260829120000_add_chess_module.sql
-- Chess module — Tierly. Partidas contra el bot (Stockfish) o PvP, todas las
-- semanas dentro del torneo "Chess" de la temporada vigente. La puntuación
-- entra SIEMPRE por el pipeline existente: gaming_matches -> 'confirmed'
-- -> trigger recalculate_gaming_score(), igual que cualquier otro evento.
-- Anti-cheat: nada de esto se sirve ni se escribe por REST; la tabla solo la
-- toca el edge function via service role, y el resultado lo decide chess.js
-- del lado del servidor.

create table public.gaming_chess_games (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.gaming_tournaments(id) on delete cascade,
  white_player_id uuid references public.gaming_players(id) on delete set null,
  black_player_id uuid references public.gaming_players(id) on delete set null,
  mode text not null check (mode in ('bot', 'pvp')),
  bot_difficulty text check (
    (mode = 'bot' and bot_difficulty in ('easy', 'medium', 'hard'))
    or (mode = 'pvp' and bot_difficulty is null)
  ),
  status text not null default 'pending' check (status in ('pending', 'active', 'finished')),
  winner text check (winner in ('white', 'black', 'draw')),
  fen text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  pgn text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index gaming_chess_games_white_idx on public.gaming_chess_games(white_player_id);
create index gaming_chess_games_black_idx on public.gaming_chess_games(black_player_id);
create index gaming_chess_games_status_idx on public.gaming_chess_games(status);
create trigger gaming_chess_games_touch before update on public.gaming_chess_games
for each row execute function public.touch_updated_at();
-- Cero superficie REST / anónima: ni anon ni authenticated agarran nada acá.
alter table public.gaming_chess_games enable row level security;
revoke all on table public.gaming_chess_games from anon, authenticated;
-- Obtiene (o crea) el torneo "Chess" del evento vigente de ESTE juego. El
-- evento se ancla al inicio de la temporada actual (gaming_season_start)
-- para que las partidas sumen al leaderboard — el view público filtra
-- e.event_date >= gaming_season_start(). Security definer + search path
-- vacío, igual que el resto del repo.
create or replace function public.ensure_gaming_season_tournament(p_game text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_event_date date := public.gaming_season_start();
  v_event_id uuid;
  v_tournament_id uuid;
begin
  -- Buscá el evento anclado a la temporada vigente para ESTE juego.
  select id, organization_id into v_event_id, v_org_id
  from public.gaming_events
  where name = p_game
    and event_date = v_event_date
  order by created_at desc
  limit 1;

  -- No existe todavía: resolvé la organización (del evento existente más
  -- reciente, o de la primera organización) y anclá el evento a la temporada.
  if v_event_id is null then
    select organization_id into v_org_id
    from public.gaming_events
    where organization_id is not null
    order by created_at desc
    limit 1;

    if v_org_id is null then
      select id into v_org_id
      from public.organizations
      order by created_at
      limit 1;
    end if;

    if v_org_id is null then
      raise exception 'No hay organización configurada para el torneo de ajedrez';
    end if;

    insert into public.gaming_events (organization_id, name, event_date)
    values (v_org_id, p_game, v_event_date)
    returning id into v_event_id;
  end if;

  select id into v_tournament_id
  from public.gaming_tournaments
  where event_id = v_event_id
    and game = p_game
    and format = 'elimination'
  order by created_at desc
  limit 1;

  if v_tournament_id is null then
    insert into public.gaming_tournaments (event_id, game, format, status)
    values (v_event_id, p_game, 'elimination', 'completed')
    returning id into v_tournament_id;
  end if;

  return v_tournament_id;
end;
$$
-- version: 20260829130000  name: grant_service_role_gaming_tables
-- Edge functions (discord-verify, chess) write via service_role, not RLS.
-- The chess module migration only granted to authenticated, so service_role
-- inserts into gaming_chess_games failed with "permission denied for table".
-- Grant service_role full access on every gaming_* table so backend flows work
-- regardless of RLS (service_role bypasses RLS by default).
grant all on table public.gaming_events to service_role;
grant all on table public.gaming_tournaments to service_role;
grant all on table public.gaming_matches to service_role;
grant all on table public.gaming_match_participants to service_role;
grant all on table public.gaming_scores to service_role;
grant all on table public.gaming_rewards to service_role;
grant all on table public.gaming_chess_games to service_role;
grant all on table public.gaming_bot_notifications to service_role
-- version: 20260829140000  name: add_chess_rating_points
-- supabase/migrations/20260829140000_add_chess_rating_points.sql
-- Sistema de puntaje por partida + rating Elo de ajedrez para Tierly.
--
-- Cambio de modelo: los puntos dejan de salir SOLO de la tabla placement
-- (10/6/3/1). El edge function de chess ahora calcula puntos explícitos por
-- dificultad (bot easy=10, medium=20, hard=25), PvP (25 + racha hasta +10),
-- empate (3 o 5) y derrota (1), y los escribe en points_awarded al insertar
-- el participante. El trigger ya no los pisa: solo rellena con la fórmula
-- legacy cuando points_awarded está en 0 (flujos de eventos offline).

alter table public.gaming_chess_games
  add column if not exists match_id uuid references public.gaming_matches(id) on delete set null;
-- El match guarda cómo quedó cada jugador (puntos + rating antes/después) para
-- que "state" pueda reconstruir el resumen de una partida ya terminada.
alter table public.gaming_match_participants
  add column if not exists rating_before int,
  add column if not exists rating_after int;
create table public.gaming_chess_ratings (
  player_id uuid primary key references public.gaming_players(id) on delete cascade,
  rating int not null default 1200 check (rating > 0),
  best_rating int not null default 1200,
  games_played int not null default 0 check (games_played >= 0),
  wins int not null default 0,
  draws int not null default 0,
  losses int not null default 0,
  updated_at timestamptz not null default now()
);
create index gaming_chess_ratings_best_idx on public.gaming_chess_ratings(best_rating desc);
-- Igual que gaming_chess_games: cero superficie REST/anónima, solo service_role.
alter table public.gaming_chess_ratings enable row level security;
revoke all on table public.gaming_chess_ratings from anon, authenticated;
grant all on table public.gaming_chess_ratings to service_role;
-- El trigger legacy solo rellena puntos que nadie seteó. Si el edge ya escribió
-- points_awarded explícito (chess), lo respeta tal cual.
create or replace function public.recalculate_gaming_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'UPDATE' and new.status = 'confirmed' and old.status is distinct from 'confirmed') then
    update public.gaming_match_participants
    set points_awarded = case
      when points_awarded = 0 then public.gaming_points_for_placement(placement)
      else points_awarded
    end
    where match_id = new.id;

    insert into public.gaming_scores (player_id, total_points, updated_at)
    select mp.player_id, sum(mp.points_awarded), now()
    from public.gaming_match_participants mp
    join public.gaming_matches m on m.id = mp.match_id
    where m.status = 'confirmed'
      and mp.player_id in (select player_id from public.gaming_match_participants where match_id = new.id)
    group by mp.player_id
    on conflict (player_id) do update set total_points = excluded.total_points, updated_at = excluded.updated_at;
  end if;
  return new;
end;
$$
-- version: 20260829150000  name: add_racer_runs
-- Private persistence for the Tierly Racer Edge Function.
-- Browser clients never receive direct table access; the function writes with service_role.

create table public.gaming_racer_runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.gaming_players(id) on delete cascade,
  track_id text not null,
  simulation_version text not null,
  seed bigint not null check (seed >= 0),
  ticket_hash text not null unique,
  status text not null check (status in ('issued', 'submitted', 'validated', 'rejected', 'expired')),
  expires_at timestamptz not null,
  input_limits jsonb not null,
  submitted_at timestamptz,
  validated_at timestamptz,
  expired_at timestamptz,
  result jsonb,
  rejection_reason text,
  match_id uuid unique references public.gaming_matches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger gaming_racer_runs_touch before update on public.gaming_racer_runs
for each row execute function public.touch_updated_at();
create index gaming_racer_runs_player_status_expiry_idx on public.gaming_racer_runs(player_id, status, expires_at);
create index gaming_racer_runs_player_track_version_idx on public.gaming_racer_runs(player_id, track_id, simulation_version);
create table public.gaming_racer_best_times (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.gaming_players(id) on delete cascade,
  track_id text not null,
  simulation_version text not null,
  best_elapsed_ticks int not null check (best_elapsed_ticks > 0),
  run_id uuid references public.gaming_racer_runs(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (player_id, track_id, simulation_version)
);
create trigger gaming_racer_best_times_touch before update on public.gaming_racer_best_times
for each row execute function public.touch_updated_at();
create index gaming_racer_best_times_player_track_version_idx on public.gaming_racer_best_times(player_id, track_id, simulation_version);
create table public.gaming_racer_reward_policy (
  id uuid primary key default gen_random_uuid(),
  track_id text not null,
  simulation_version text not null,
  finish_points int not null default 10 check (finish_points > 0),
  bot_win_bonus_points int not null default 20 check (bot_win_bonus_points > 0),
  personal_best_bonus_points int not null default 15 check (personal_best_bonus_points > 0),
  max_active_tickets int not null default 3 check (max_active_tickets > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (track_id, simulation_version)
);
create trigger gaming_racer_reward_policy_touch before update on public.gaming_racer_reward_policy
for each row execute function public.touch_updated_at();
insert into public.gaming_racer_reward_policy (
  track_id,
  simulation_version,
  finish_points,
  bot_win_bonus_points,
  personal_best_bonus_points,
  max_active_tickets
) values ('coastal-loop-v1', 'racer-v1', 10, 20, 15, 3);
alter table public.gaming_racer_runs enable row level security;
alter table public.gaming_racer_best_times enable row level security;
alter table public.gaming_racer_reward_policy enable row level security;
revoke all on table public.gaming_racer_runs from anon, authenticated;
revoke all on table public.gaming_racer_best_times from anon, authenticated;
revoke all on table public.gaming_racer_reward_policy from anon, authenticated;
grant all on table public.gaming_racer_runs to service_role;
grant all on table public.gaming_racer_best_times to service_role;
grant all on table public.gaming_racer_reward_policy to service_role
-- version: 20260830183000  name: add_racer_atomic_rpcs
-- Atomic RPCs for Tierly Racer ticket issuance, submit ownership, and credit.
-- The Edge Function validates identity and re-simulates replays; these
-- SECURITY DEFINER functions own the private state transitions and score path.

create or replace function public.issue_gaming_racer_run(
  p_player_id uuid,
  p_track_id text,
  p_simulation_version text,
  p_seed bigint,
  p_ticket_hash text,
  p_expires_at timestamptz,
  p_input_limits jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy public.gaming_racer_reward_policy%rowtype;
  v_active_count int;
  v_run_id uuid;
  v_now timestamptz := now();
begin
  perform pg_advisory_xact_lock(hashtextextended(p_player_id::text, 0));

  select *
  into v_policy
  from public.gaming_racer_reward_policy
  where track_id = p_track_id
    and simulation_version = p_simulation_version
  for update;

  if v_policy.id is null then
    return jsonb_build_object('status', 'policy_missing');
  end if;

  update public.gaming_racer_runs
  set status = 'expired',
      expired_at = v_now
  where player_id = p_player_id
    and status = 'issued'
    and expires_at <= v_now;

  select count(*) into v_active_count
  from public.gaming_racer_runs
  where player_id = p_player_id
    and status = 'issued'
    and expires_at > v_now;

  if v_active_count >= v_policy.max_active_tickets then
    return jsonb_build_object('status', 'too_many_active_tickets');
  end if;

  insert into public.gaming_racer_runs (
    player_id,
    track_id,
    simulation_version,
    seed,
    ticket_hash,
    status,
    expires_at,
    input_limits
  ) values (
    p_player_id,
    p_track_id,
    p_simulation_version,
    p_seed,
    p_ticket_hash,
    'issued',
    p_expires_at,
    p_input_limits
  )
  returning id into v_run_id;

  return jsonb_build_object(
    'status', 'issued',
    'run_id', v_run_id,
    'seed', p_seed,
    'expires_at', p_expires_at,
    'input_limits', p_input_limits
  );
end;
$$;
create or replace function public.claim_gaming_racer_run(
  p_run_id uuid,
  p_player_id uuid,
  p_ticket_hash text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.gaming_racer_runs%rowtype;
begin
  select *
  into v_run
  from public.gaming_racer_runs
  where id = p_run_id
    and player_id = p_player_id
  for update;

  if v_run.id is null then
    return jsonb_build_object('status', 'ticket_invalid');
  end if;

  if v_run.status = 'validated' then
    return v_run.result;
  end if;

  if v_run.ticket_hash <> p_ticket_hash then
    update public.gaming_racer_runs
    set status = 'rejected',
        rejection_reason = 'ticket_reused'
    where id = v_run.id
      and status in ('issued', 'submitted');
    return jsonb_build_object('status', 'rejected', 'rejection_code', 'ticket_reused');
  end if;

  if v_run.status <> 'issued' then
    return jsonb_build_object('status', 'conflict', 'rejection_code', 'ticket_reused');
  end if;

  if v_run.expires_at <= p_now then
    update public.gaming_racer_runs
    set status = 'expired',
        expired_at = p_now,
        rejection_reason = 'ticket_expired'
    where id = v_run.id;
    return jsonb_build_object('status', 'rejected', 'rejection_code', 'ticket_expired');
  end if;

  update public.gaming_racer_runs
  set status = 'submitted',
      submitted_at = p_now
  where id = v_run.id
    and status = 'issued';

  return jsonb_build_object(
    'status', 'submitted',
    'run_id', v_run.id,
    'player_id', v_run.player_id,
    'track_id', v_run.track_id,
    'simulation_version', v_run.simulation_version,
    'seed', v_run.seed
  );
end;
$$;
create or replace function public.reject_gaming_racer_run(
  p_run_id uuid,
  p_player_id uuid,
  p_rejection_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.gaming_racer_runs%rowtype;
  v_status text := case when p_rejection_reason = 'ticket_expired' then 'expired' else 'rejected' end;
begin
  select *
  into v_run
  from public.gaming_racer_runs
  where id = p_run_id
    and player_id = p_player_id
  for update;

  if v_run.id is null then
    return jsonb_build_object('status', 'ticket_invalid');
  end if;

  if v_run.status = 'validated' then
    return v_run.result;
  end if;

  if v_run.status in ('issued', 'submitted') then
    update public.gaming_racer_runs
    set status = v_status,
        rejection_reason = p_rejection_reason,
        expired_at = case when v_status = 'expired' then now() else expired_at end
    where id = v_run.id;
  end if;

  return jsonb_build_object(
    'status', 'rejected',
    'completed', false,
    'elapsed_ticks', 0,
    'finish_position', null,
    'points_awarded', 0,
    'personal_best', false,
    'rejection_code', p_rejection_reason
  );
end;
$$;
create or replace function public.finalize_gaming_racer_run(
  p_run_id uuid,
  p_player_id uuid,
  p_completed boolean,
  p_elapsed_ticks int,
  p_finish_position int,
  p_confirmed_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.gaming_racer_runs%rowtype;
  v_policy public.gaming_racer_reward_policy%rowtype;
  v_best public.gaming_racer_best_times%rowtype;
  v_tournament_id uuid;
  v_match_id uuid;
  v_personal_best boolean;
  v_points_awarded int;
  v_result jsonb;
begin
  select *
  into v_run
  from public.gaming_racer_runs
  where id = p_run_id
    and player_id = p_player_id
  for update;

  if v_run.id is null then
    return jsonb_build_object('status', 'ticket_invalid');
  end if;

  if v_run.status = 'validated' then
    return v_run.result;
  end if;

  if v_run.status <> 'submitted' then
    return jsonb_build_object('status', 'conflict');
  end if;

  if not p_completed or p_elapsed_ticks <= 0 or p_finish_position is null or p_finish_position < 1 then
    update public.gaming_racer_runs
    set status = 'rejected',
        rejection_reason = 'run_incomplete'
    where id = v_run.id;
    return jsonb_build_object(
      'status', 'rejected',
      'completed', false,
      'elapsed_ticks', 0,
      'finish_position', null,
      'points_awarded', 0,
      'personal_best', false,
      'rejection_code', 'run_incomplete'
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_player_id::text || ':' || v_run.track_id || ':' || v_run.simulation_version, 0));

  select *
  into v_policy
  from public.gaming_racer_reward_policy
  where track_id = v_run.track_id
    and simulation_version = v_run.simulation_version
  for update;

  if v_policy.id is null then
    return jsonb_build_object('status', 'policy_missing');
  end if;

  select *
  into v_best
  from public.gaming_racer_best_times
  where player_id = p_player_id
    and track_id = v_run.track_id
    and simulation_version = v_run.simulation_version
  for update;

  v_personal_best := v_best.id is null or p_elapsed_ticks < v_best.best_elapsed_ticks;
  v_points_awarded := v_policy.finish_points
    + case when p_finish_position = 1 then v_policy.bot_win_bonus_points else 0 end
    + case when v_personal_best then v_policy.personal_best_bonus_points else 0 end;

  v_tournament_id := public.ensure_gaming_season_tournament('Racer');

  insert into public.gaming_matches (tournament_id, status)
  values (v_tournament_id, 'pending')
  returning id into v_match_id;

  insert into public.gaming_match_participants (
    match_id,
    player_id,
    placement,
    points_awarded
  ) values (
    v_match_id,
    p_player_id,
    p_finish_position,
    v_points_awarded
  );

  if v_personal_best then
    if v_best.id is null then
      insert into public.gaming_racer_best_times (
        player_id,
        track_id,
        simulation_version,
        best_elapsed_ticks,
        run_id
      ) values (
        p_player_id,
        v_run.track_id,
        v_run.simulation_version,
        p_elapsed_ticks,
        v_run.id
      );
    else
      update public.gaming_racer_best_times
      set best_elapsed_ticks = p_elapsed_ticks,
          run_id = v_run.id
      where id = v_best.id
        and p_elapsed_ticks < v_best.best_elapsed_ticks;
    end if;
  end if;

  v_result := jsonb_build_object(
    'status', 'validated',
    'completed', true,
    'elapsed_ticks', p_elapsed_ticks,
    'finish_position', p_finish_position,
    'points_awarded', v_points_awarded,
    'personal_best', v_personal_best
  );

  update public.gaming_racer_runs
  set status = 'validated',
      validated_at = now(),
      result = v_result,
      match_id = v_match_id
  where id = v_run.id
    and match_id is null;

  update public.gaming_matches
  set status = 'confirmed',
      confirmed_by = p_confirmed_by,
      confirmed_at = now()
  where id = v_match_id
    and status = 'pending';

  return v_result;
end;
$$;
revoke all on function public.issue_gaming_racer_run(uuid, text, text, bigint, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.claim_gaming_racer_run(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.reject_gaming_racer_run(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.finalize_gaming_racer_run(uuid, uuid, boolean, int, int, uuid) from public, anon, authenticated;
grant execute on function public.issue_gaming_racer_run(uuid, text, text, bigint, text, timestamptz, jsonb) to service_role;
grant execute on function public.claim_gaming_racer_run(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.reject_gaming_racer_run(uuid, uuid, text) to service_role;
grant execute on function public.finalize_gaming_racer_run(uuid, uuid, boolean, int, int, uuid) to service_role
-- version: 20260830193000  name: serialize_racer_tournament
create or replace function public.finalize_gaming_racer_run(
  p_run_id uuid,
  p_player_id uuid,
  p_completed boolean,
  p_elapsed_ticks int,
  p_finish_position int,
  p_confirmed_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.gaming_racer_runs%rowtype;
  v_policy public.gaming_racer_reward_policy%rowtype;
  v_best public.gaming_racer_best_times%rowtype;
  v_tournament_id uuid;
  v_match_id uuid;
  v_personal_best boolean;
  v_points_awarded int;
  v_result jsonb;
begin
  select *
  into v_run
  from public.gaming_racer_runs
  where id = p_run_id
    and player_id = p_player_id
  for update;

  if v_run.id is null then
    return jsonb_build_object('status', 'ticket_invalid');
  end if;

  if v_run.status = 'validated' then
    return v_run.result;
  end if;

  if v_run.status <> 'submitted' then
    return jsonb_build_object('status', 'conflict');
  end if;

  if not p_completed or p_elapsed_ticks <= 0 or p_finish_position is null or p_finish_position < 1 then
    update public.gaming_racer_runs
    set status = 'rejected',
        rejection_reason = 'run_incomplete'
    where id = v_run.id;
    return jsonb_build_object(
      'status', 'rejected',
      'completed', false,
      'elapsed_ticks', 0,
      'finish_position', null,
      'points_awarded', 0,
      'personal_best', false,
      'rejection_code', 'run_incomplete'
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_player_id::text || ':' || v_run.track_id || ':' || v_run.simulation_version, 0));

  select *
  into v_policy
  from public.gaming_racer_reward_policy
  where track_id = v_run.track_id
    and simulation_version = v_run.simulation_version
  for update;

  if v_policy.id is null then
    return jsonb_build_object('status', 'policy_missing');
  end if;

  select *
  into v_best
  from public.gaming_racer_best_times
  where player_id = p_player_id
    and track_id = v_run.track_id
    and simulation_version = v_run.simulation_version
  for update;

  v_personal_best := v_best.id is null or p_elapsed_ticks < v_best.best_elapsed_ticks;
  v_points_awarded := v_policy.finish_points
    + case when p_finish_position = 1 then v_policy.bot_win_bonus_points else 0 end
    + case when v_personal_best then v_policy.personal_best_bonus_points else 0 end;

  perform pg_advisory_xact_lock(hashtextextended('gaming_tournament:Racer:' || public.gaming_season_start()::text, 0));
  v_tournament_id := public.ensure_gaming_season_tournament('Racer');

  insert into public.gaming_matches (tournament_id, status)
  values (v_tournament_id, 'pending')
  returning id into v_match_id;

  insert into public.gaming_match_participants (
    match_id,
    player_id,
    placement,
    points_awarded
  ) values (
    v_match_id,
    p_player_id,
    p_finish_position,
    v_points_awarded
  );

  if v_personal_best then
    if v_best.id is null then
      insert into public.gaming_racer_best_times (
        player_id,
        track_id,
        simulation_version,
        best_elapsed_ticks,
        run_id
      ) values (
        p_player_id,
        v_run.track_id,
        v_run.simulation_version,
        p_elapsed_ticks,
        v_run.id
      );
    else
      update public.gaming_racer_best_times
      set best_elapsed_ticks = p_elapsed_ticks,
          run_id = v_run.id
      where id = v_best.id
        and p_elapsed_ticks < v_best.best_elapsed_ticks;
    end if;
  end if;

  v_result := jsonb_build_object(
    'status', 'validated',
    'completed', true,
    'elapsed_ticks', p_elapsed_ticks,
    'finish_position', p_finish_position,
    'points_awarded', v_points_awarded,
    'personal_best', v_personal_best
  );

  update public.gaming_racer_runs
  set status = 'validated',
      validated_at = now(),
      result = v_result,
      match_id = v_match_id
  where id = v_run.id
    and match_id is null;

  update public.gaming_matches
  set status = 'confirmed',
      confirmed_by = p_confirmed_by,
      confirmed_at = now()
  where id = v_match_id
    and status = 'pending';

  return v_result;
end;
$$;
revoke all on function public.finalize_gaming_racer_run(uuid, uuid, boolean, int, int, uuid) from public, anon, authenticated;
grant execute on function public.finalize_gaming_racer_run(uuid, uuid, boolean, int, int, uuid) to service_role
-- version: 20260922090000  name: add_repo_content_history
-- Historial editorial persistente para el descubrimiento de repositorios.
alter table public.repo_picks
  add column if not exists social_posts jsonb,
  add column if not exists social_sources jsonb not null default '[]'::jsonb,
  add column if not exists social_model text,
  add column if not exists generated_at timestamptz;
create index if not exists repo_picks_generated_at_idx
  on public.repo_picks(organization_id, generated_at desc)
-- version: 20260925090000  name: tierly_admin_and_smash_setup
-- Mantiene la cuenta operadora de Tierly como administradora y expone solo
-- una comprobación mínima para que el panel no dependa de datos internos.
insert into private.admin_allowlist (email, organization_id, role)
select 'kohcuendepau@gmail.com', id, 'admin'::public.member_role
from public.organizations
where slug = 'tellus'
on conflict (email) do update set organization_id = excluded.organization_id, role = excluded.role;
insert into public.organization_members (organization_id, user_id, role)
select o.id, u.id, 'admin'::public.member_role
from public.organizations o
join auth.users u on lower(u.email) = 'kohcuendepau@gmail.com'
where o.slug = 'tellus'
on conflict (organization_id, user_id) do update set role = excluded.role;
create or replace function public.tierly_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    join auth.users u on u.id = m.user_id
    where m.user_id = (select auth.uid())
      and m.role = 'admin'
      and o.slug = 'tellus'
      and lower(u.email) = 'kohcuendepau@gmail.com'
  );
$$;
revoke all on function public.tierly_is_admin() from public;
grant execute on function public.tierly_is_admin() to authenticated;
create or replace function public.tierly_create_smash_tournament(
  p_name text,
  p_event_date date,
  p_location text,
  p_players jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_event uuid;
  v_tournament uuid;
  v_match uuid;
  v_player jsonb;
  v_player_id uuid;
  v_index int := 0;
  v_first uuid;
begin
  if not public.tierly_is_admin() then raise exception 'Administrador requerido'; end if;
  if jsonb_array_length(p_players) < 2 then raise exception 'Se requieren al menos dos jugadores'; end if;
  select id into v_org from public.organizations where slug = 'tellus';
  insert into public.gaming_events (organization_id, name, event_date, location)
    values (v_org, p_name, p_event_date, coalesce(p_location, '')) returning id into v_event;
  insert into public.gaming_tournaments (event_id, game, format)
    values (v_event, 'Super Smash Bros.', 'elimination') returning id into v_tournament;
  for v_player in select value from jsonb_array_elements(p_players) loop
    v_index := v_index + 1;
    if v_index % 2 = 1 then
      insert into public.gaming_matches (tournament_id, round, status) values (v_tournament, 1, 'pending') returning id into v_match;
    end if;
    insert into public.gaming_players (discord_id, display_name) values ('walkin-' || gen_random_uuid()::text, v_player->>'display_name') returning id into v_player_id;
    insert into public.gaming_match_participants (match_id, player_id, placement) values (v_match, v_player_id, case when v_index % 2 = 1 then 1 else 2 end);
  end loop;
  return v_tournament;
end;
$$;
revoke all on function public.tierly_create_smash_tournament(text, date, text, jsonb) from public;
grant execute on function public.tierly_create_smash_tournament(text, date, text, jsonb) to authenticated
-- version: 20260925094000  name: tierly_match_operations
create or replace function public.tierly_admin_matches()
returns table (match_id uuid, tournament_id uuid, event_name text, round int, match_status text, player_id uuid, player_name text, placement int)
language sql security definer set search_path = ''
as $$
  select m.id, t.id, e.name, m.round, m.status, p.id, p.display_name, mp.placement
  from public.gaming_matches m
  join public.gaming_tournaments t on t.id = m.tournament_id
  join public.gaming_events e on e.id = t.event_id
  join public.gaming_match_participants mp on mp.match_id = m.id
  join public.gaming_players p on p.id = mp.player_id
  where public.tierly_is_admin()
  order by e.event_date desc, m.round, m.created_at, mp.placement;
$$;
revoke all on function public.tierly_admin_matches() from public;
grant execute on function public.tierly_admin_matches() to authenticated;
create or replace function public.tierly_confirm_match(p_match_id uuid, p_winner_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_tournament uuid;
begin
  if not public.tierly_is_admin() then raise exception 'Administrador requerido'; end if;
  select tournament_id into v_tournament from public.gaming_matches where id = p_match_id and status <> 'confirmed' for update;
  if v_tournament is null then raise exception 'Partida no disponible'; end if;
  if not exists (select 1 from public.gaming_match_participants where match_id = p_match_id and player_id = p_winner_id) then raise exception 'Ganador inválido'; end if;
  update public.gaming_match_participants set placement = case when player_id = p_winner_id then 1 else 2 end where match_id = p_match_id;
  update public.gaming_matches set status = 'confirmed', confirmed_by = (select auth.uid()), confirmed_at = now() where id = p_match_id;
  return true;
end;
$$;
revoke all on function public.tierly_confirm_match(uuid, uuid) from public;
grant execute on function public.tierly_confirm_match(uuid, uuid) to authenticated
-- version: 20260925100000  name: tierly_advance_bracket
create or replace function public.tierly_confirm_match(p_match_id uuid, p_winner_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_tournament uuid; v_round int; v_total int; v_confirmed int; v_winner_count int; v_next uuid; v_winner uuid; v_index int := 0;
begin
  if not public.tierly_is_admin() then raise exception 'Administrador requerido'; end if;
  select tournament_id into v_tournament from public.gaming_matches where id = p_match_id and status <> 'confirmed' for update;
  if v_tournament is null then raise exception 'Partida no disponible'; end if;
  if not exists (select 1 from public.gaming_match_participants where match_id = p_match_id and player_id = p_winner_id) then raise exception 'Ganador inválido'; end if;
  select round into v_round from public.gaming_matches where id = p_match_id;
  update public.gaming_match_participants set placement = case when player_id = p_winner_id then 1 else 2 end where match_id = p_match_id;
  update public.gaming_matches set status = 'confirmed', confirmed_by = (select auth.uid()), confirmed_at = now() where id = p_match_id;
  select count(*), count(*) filter (where status = 'confirmed') into v_total, v_confirmed from public.gaming_matches where tournament_id = v_tournament and round = v_round;
  if v_total = v_confirmed then
    select count(*) into v_winner_count from public.gaming_match_participants mp join public.gaming_matches m on m.id = mp.match_id where m.tournament_id = v_tournament and m.round = v_round and m.status = 'confirmed' and mp.placement = 1;
    if v_winner_count = 1 then
      update public.gaming_tournaments set status = 'completed' where id = v_tournament;
    elsif not exists (select 1 from public.gaming_matches where tournament_id = v_tournament and round = v_round + 1) then
      insert into public.gaming_matches (tournament_id, round, status) values (v_tournament, v_round + 1, 'pending') returning id into v_next;
      for v_winner in select mp.player_id from public.gaming_match_participants mp join public.gaming_matches m on m.id = mp.match_id where m.tournament_id = v_tournament and m.round = v_round and m.status = 'confirmed' and mp.placement = 1 order by m.created_at loop
        v_index := v_index + 1;
        insert into public.gaming_match_participants (match_id, player_id, placement) values (v_next, v_winner, v_index);
      end loop;
    end if;
  end if;
  return true;
end;
$$;
revoke all on function public.tierly_confirm_match(uuid, uuid) from public;
grant execute on function public.tierly_confirm_match(uuid, uuid) to authenticated
-- version: 20260925102000  name: tierly_rewards_operations
create or replace function public.tierly_award_reward(p_tournament_id uuid, p_player_id uuid, p_description text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.tierly_is_admin() then raise exception 'Administrador requerido'; end if;
  if p_description is null or length(trim(p_description)) = 0 then raise exception 'Descripción requerida'; end if;
  insert into public.gaming_rewards (player_id, tournament_id, description, created_by)
  values (p_player_id, p_tournament_id, trim(p_description), (select auth.uid())) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.tierly_award_reward(uuid, uuid, text) from public;
grant execute on function public.tierly_award_reward(uuid, uuid, text) to authenticated
-- version: 20260925113000  name: tierly_linked_brackets
create or replace function public.tierly_admin_players()
returns table (player_id uuid, display_name text, username text, discord_id text)
language sql security definer set search_path = ''
as $$
  select id, coalesce(display_name, username, 'Jugador'), username, discord_id
  from public.gaming_players
  where public.tierly_is_admin()
  order by lower(coalesce(display_name, username, ''));
$$;
revoke all on function public.tierly_admin_players() from public;
grant execute on function public.tierly_admin_players() to authenticated;
create or replace function public.tierly_create_smash_tournament(
  p_name text, p_event_date date, p_location text, p_players jsonb
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_org uuid; v_event uuid; v_tournament uuid; v_match uuid; v_player jsonb; v_player_id uuid; v_index int := 0;
begin
  if not public.tierly_is_admin() then raise exception 'Administrador requerido'; end if;
  if jsonb_array_length(p_players) < 2 then raise exception 'Se requieren al menos dos jugadores'; end if;
  select id into v_org from public.organizations where slug = 'tellus';
  insert into public.gaming_events (organization_id, name, event_date, location) values (v_org, p_name, p_event_date, coalesce(p_location, '')) returning id into v_event;
  insert into public.gaming_tournaments (event_id, game, format) values (v_event, 'Super Smash Bros.', 'elimination') returning id into v_tournament;
  for v_player in select value from jsonb_array_elements(p_players) loop
    v_index := v_index + 1;
    if v_index % 2 = 1 then insert into public.gaming_matches (tournament_id, round, status) values (v_tournament, 1, 'pending') returning id into v_match; end if;
    if nullif(v_player->>'player_id', '') is not null then
      v_player_id := (v_player->>'player_id')::uuid;
      if not exists (select 1 from public.gaming_players where id = v_player_id) then raise exception 'Jugador no válido'; end if;
    else
      insert into public.gaming_players (discord_id, display_name) values ('walkin-' || gen_random_uuid()::text, v_player->>'display_name') returning id into v_player_id;
    end if;
    insert into public.gaming_match_participants (match_id, player_id, placement) values (v_match, v_player_id, case when v_index % 2 = 1 then 1 else 2 end);
  end loop;
  return v_tournament;
end;
$$;
revoke all on function public.tierly_create_smash_tournament(text, date, text, jsonb) from public;
grant execute on function public.tierly_create_smash_tournament(text, date, text, jsonb) to authenticated
-- version: 20260925120000  name: tierly_registered_players_only
create or replace function public.tierly_admin_players()
returns table (player_id uuid, display_name text, username text, discord_id text)
language sql security definer set search_path = ''
as $$
  select id, coalesce(display_name, username, 'Jugador'), username, discord_id
  from public.gaming_players
  where public.tierly_is_admin() and discord_id not like 'walkin-%'
  order by lower(coalesce(display_name, username, ''));
$$;
revoke all on function public.tierly_admin_players() from public;
grant execute on function public.tierly_admin_players() to authenticated;
create or replace function public.tierly_create_smash_tournament(
  p_name text, p_event_date date, p_location text, p_players jsonb
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_org uuid; v_event uuid; v_tournament uuid; v_match uuid; v_player jsonb; v_player_id uuid; v_index int := 0;
begin
  if not public.tierly_is_admin() then raise exception 'Administrador requerido'; end if;
  if jsonb_array_length(p_players) < 2 then raise exception 'Se requieren al menos dos jugadores registrados'; end if;
  select id into v_org from public.organizations where slug = 'tellus';
  insert into public.gaming_events (organization_id, name, event_date, location) values (v_org, p_name, p_event_date, coalesce(p_location, '')) returning id into v_event;
  insert into public.gaming_tournaments (event_id, game, format) values (v_event, 'Super Smash Bros.', 'elimination') returning id into v_tournament;
  for v_player in select value from jsonb_array_elements(p_players) loop
    v_index := v_index + 1;
    if v_index % 2 = 1 then insert into public.gaming_matches (tournament_id, round, status) values (v_tournament, 1, 'pending') returning id into v_match; end if;
    v_player_id := (v_player->>'player_id')::uuid;
    if not exists (select 1 from public.gaming_players where id = v_player_id and discord_id not like 'walkin-%') then raise exception 'Solo se permiten jugadores registrados'; end if;
    insert into public.gaming_match_participants (match_id, player_id, placement) values (v_match, v_player_id, case when v_index % 2 = 1 then 1 else 2 end);
  end loop;
  return v_tournament;
end;
$$;
revoke all on function public.tierly_create_smash_tournament(text, date, text, jsonb) from public;
grant execute on function public.tierly_create_smash_tournament(text, date, text, jsonb) to authenticated
-- version: 20260925123000  name: tierly_admin_management
alter table public.gaming_events add column if not exists luma_url text;
drop view if exists public.event_bracket_public_view;
create view public.event_bracket_public_view as
select e.id as event_id, e.name as event_name, e.event_date, e.location, e.luma_url,
       t.id as tournament_id, t.game, t.format, t.status as tournament_status,
       gm.id as match_id, gm.round, gm.status as match_status,
       mp.placement, p.id as player_id, p.display_name, p.avatar_url
from public.gaming_events e
join public.gaming_tournaments t on t.event_id = e.id
join public.gaming_matches gm on gm.tournament_id = t.id
join public.gaming_match_participants mp on mp.match_id = gm.id
join public.gaming_players p on p.id = mp.player_id;
grant select on public.event_bracket_public_view to anon, authenticated;
create or replace function public.tierly_edit_player(p_player_id uuid, p_display_name text, p_username text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.tierly_is_admin() then raise exception 'Administrador requerido'; end if;
  update public.gaming_players set display_name = nullif(trim(p_display_name), ''), username = nullif(trim(p_username), '') where id = p_player_id and discord_id not like 'walkin-%';
  return found;
end;
$$;
revoke all on function public.tierly_edit_player(uuid, text, text) from public;
grant execute on function public.tierly_edit_player(uuid, text, text) to authenticated;
create or replace function public.tierly_delete_player(p_player_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.tierly_is_admin() then raise exception 'Administrador requerido'; end if;
  if exists (select 1 from public.gaming_match_participants where player_id = p_player_id) then raise exception 'No se puede eliminar un jugador con historial'; end if;
  delete from public.gaming_players where id = p_player_id and discord_id not like 'walkin-%';
  return found;
end;
$$;
revoke all on function public.tierly_delete_player(uuid) from public;
grant execute on function public.tierly_delete_player(uuid) to authenticated;
create or replace function public.tierly_update_event(p_event_id uuid, p_name text, p_event_date date, p_location text, p_luma_url text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.tierly_is_admin() then raise exception 'Administrador requerido'; end if;
  update public.gaming_events set name = trim(p_name), event_date = p_event_date, location = nullif(trim(p_location), ''), luma_url = nullif(trim(p_luma_url), '') where id = p_event_id;
  return found;
end;
$$;
revoke all on function public.tierly_update_event(uuid, text, date, text, text) from public;
grant execute on function public.tierly_update_event(uuid, text, date, text, text) to authenticated;
create or replace function public.tierly_create_smash_tournament(
  p_name text, p_event_date date, p_location text, p_luma_url text, p_players jsonb
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_org uuid; v_event uuid; v_tournament uuid; v_match uuid; v_player jsonb; v_index int := 0;
begin
  if not public.tierly_is_admin() then raise exception 'Administrador requerido'; end if;
  if jsonb_array_length(p_players) < 2 then raise exception 'Se requieren al menos dos jugadores registrados'; end if;
  select id into v_org from public.organizations where slug = 'tellus';
  insert into public.gaming_events (organization_id, name, event_date, location, luma_url) values (v_org, p_name, p_event_date, coalesce(p_location, ''), nullif(trim(p_luma_url), '')) returning id into v_event;
  insert into public.gaming_tournaments (event_id, game, format) values (v_event, 'Super Smash Bros.', 'elimination') returning id into v_tournament;
  for v_player in select value from jsonb_array_elements(p_players) loop
    v_index := v_index + 1;
    if v_index % 2 = 1 then insert into public.gaming_matches (tournament_id, round, status) values (v_tournament, 1, 'pending') returning id into v_match; end if;
    if not exists (select 1 from public.gaming_players where id = (v_player->>'player_id')::uuid and discord_id not like 'walkin-%') then raise exception 'Solo se permiten jugadores registrados'; end if;
    insert into public.gaming_match_participants (match_id, player_id, placement) values (v_match, (v_player->>'player_id')::uuid, case when v_index % 2 = 1 then 1 else 2 end);
  end loop;
  return v_tournament;
end;
$$;
revoke all on function public.tierly_create_smash_tournament(text, date, text, text, jsonb) from public;
grant execute on function public.tierly_create_smash_tournament(text, date, text, text, jsonb) to authenticated
-- version: 20260925124500  name: tierly_admin_events
create or replace function public.tierly_admin_events()
returns table (event_id uuid, event_name text, event_date date, location text, luma_url text)
language sql security definer set search_path = '' as $$
  select id, name, event_date, location, luma_url from public.gaming_events
  where public.tierly_is_admin() order by event_date desc, created_at desc;
$$;
revoke all on function public.tierly_admin_events() from public;
grant execute on function public.tierly_admin_events() to authenticated
-- version: 20260925130000  name: tierly_configurable_tournaments
create or replace function public.tierly_create_smash_tournament(
  p_name text, p_event_date date, p_location text, p_luma_url text,
  p_game text, p_format text, p_players jsonb
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_org uuid; v_event uuid; v_tournament uuid; v_match uuid; v_player jsonb; v_index int := 0;
begin
  if not public.tierly_is_admin() then raise exception 'Administrador requerido'; end if;
  if jsonb_array_length(p_players) < 2 then raise exception 'Se requieren al menos dos jugadores registrados'; end if;
  if nullif(trim(p_game), '') is null then raise exception 'El juego es requerido'; end if;
  if p_format not in ('elimination', 'heats') then raise exception 'Formato inválido'; end if;
  select id into v_org from public.organizations where slug = 'tellus';
  insert into public.gaming_events (organization_id, name, event_date, location, luma_url) values (v_org, p_name, p_event_date, coalesce(p_location, ''), nullif(trim(p_luma_url), '')) returning id into v_event;
  insert into public.gaming_tournaments (event_id, game, format) values (v_event, trim(p_game), p_format) returning id into v_tournament;
  for v_player in select value from jsonb_array_elements(p_players) loop
    v_index := v_index + 1;
    if v_index % 2 = 1 then insert into public.gaming_matches (tournament_id, round, status) values (v_tournament, 1, 'pending') returning id into v_match; end if;
    if not exists (select 1 from public.gaming_players where id = (v_player->>'player_id')::uuid and discord_id not like 'walkin-%') then raise exception 'Solo se permiten jugadores registrados'; end if;
    insert into public.gaming_match_participants (match_id, player_id, placement) values (v_match, (v_player->>'player_id')::uuid, case when v_index % 2 = 1 then 1 else 2 end);
  end loop;
  return v_tournament;
end;
$$;
revoke all on function public.tierly_create_smash_tournament(text, date, text, text, text, text, jsonb) from public;
grant execute on function public.tierly_create_smash_tournament(text, date, text, text, text, text, jsonb) to authenticated
-- version: 20260925133000  name: tierly_public_verified_only
drop view if exists public.leaderboard_public_view;
create view public.leaderboard_public_view as
select p.id as player_id, p.username, p.display_name, p.avatar_url, p.discord_member,
       coalesce(s.total_points, 0) as total_points
from public.gaming_players p
left join public.gaming_scores s on s.player_id = p.id
where p.discord_member is true
order by coalesce(s.total_points, 0) desc;
grant select on public.leaderboard_public_view to anon, authenticated;
drop view if exists public.event_bracket_public_view;
create view public.event_bracket_public_view as
select e.id as event_id, e.name as event_name, e.event_date, e.location, e.luma_url,
       t.id as tournament_id, t.game, t.format, t.status as tournament_status,
       gm.id as match_id, gm.round, gm.status as match_status,
       mp.placement, p.id as player_id, p.display_name, p.avatar_url
from public.gaming_events e
join public.gaming_tournaments t on t.event_id = e.id
join public.gaming_matches gm on gm.tournament_id = t.id
join public.gaming_match_participants mp on mp.match_id = gm.id
join public.gaming_players p on p.id = mp.player_id
where p.discord_member is true;
grant select on public.event_bracket_public_view to anon, authenticated
-- version: 20260925140000  name: tierly_tournament_registration
alter table public.gaming_players add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;
create table if not exists public.gaming_tournament_registrations (
  tournament_id uuid not null references public.gaming_tournaments(id) on delete cascade,
  player_id uuid not null references public.gaming_players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tournament_id, player_id)
);
alter table public.gaming_tournament_registrations enable row level security;
create policy gaming_registration_public_select on public.gaming_tournament_registrations for select to anon, authenticated using (true);
grant select on public.gaming_tournament_registrations to anon, authenticated;
create or replace function public.tierly_register_for_tournament(p_tournament_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_player uuid;
begin
  select id into v_player from public.gaming_players where auth_user_id = (select auth.uid()) and discord_member is true;
  if v_player is null then raise exception 'Se requiere una cuenta Tierly verificada'; end if;
  if not exists (select 1 from public.gaming_tournaments where id = p_tournament_id and status = 'draft') then raise exception 'El torneo no acepta inscripciones'; end if;
  insert into public.gaming_tournament_registrations (tournament_id, player_id) values (p_tournament_id, v_player) on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.tierly_register_for_tournament(uuid) from public;
grant execute on function public.tierly_register_for_tournament(uuid) to authenticated;
create or replace function public.tierly_unregister_from_tournament(p_tournament_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  delete from public.gaming_tournament_registrations r using public.gaming_players p where r.tournament_id = p_tournament_id and r.player_id = p.id and p.auth_user_id = (select auth.uid());
  return found;
end;
$$;
revoke all on function public.tierly_unregister_from_tournament(uuid) from public;
grant execute on function public.tierly_unregister_from_tournament(uuid) to authenticated
-- version: 20260925141000  name: tierly_registration_public_view
drop view if exists public.event_bracket_public_view;
create view public.event_bracket_public_view as
select e.id as event_id, e.name as event_name, e.event_date, e.location, e.luma_url,
       t.id as tournament_id, t.game, t.format, t.status as tournament_status,
       (select count(*) from public.gaming_tournament_registrations r where r.tournament_id = t.id) as registration_count,
       gm.id as match_id, gm.round, gm.status as match_status,
       mp.placement, p.id as player_id, p.display_name, p.avatar_url
from public.gaming_events e
join public.gaming_tournaments t on t.event_id = e.id
join public.gaming_matches gm on gm.tournament_id = t.id
join public.gaming_match_participants mp on mp.match_id = gm.id
join public.gaming_players p on p.id = mp.player_id
where p.discord_member is true;
grant select on public.event_bracket_public_view to anon, authenticated
-- version: 20260925143000  name: tierly_event_banners_and_catalog
alter table public.gaming_events add column if not exists banner_url text;
create or replace function public.tierly_create_smash_tournament(
  p_name text, p_event_date date, p_location text, p_luma_url text, p_banner_url text,
  p_game text, p_format text, p_players jsonb
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_org uuid; v_event uuid; v_tournament uuid; v_match uuid; v_player jsonb; v_index int := 0;
begin
  if not public.tierly_is_admin() then raise exception 'Administrador requerido'; end if;
  if jsonb_array_length(p_players) < 2 then raise exception 'Se requieren al menos dos jugadores registrados'; end if;
  if nullif(trim(p_game), '') is null then raise exception 'El juego es requerido'; end if;
  if p_format not in ('elimination', 'heats') then raise exception 'Formato inválido'; end if;
  select id into v_org from public.organizations where slug = 'tellus';
  insert into public.gaming_events (organization_id, name, event_date, location, luma_url, banner_url) values (v_org, p_name, p_event_date, coalesce(p_location, ''), nullif(trim(p_luma_url), ''), nullif(trim(p_banner_url), '')) returning id into v_event;
  insert into public.gaming_tournaments (event_id, game, format) values (v_event, trim(p_game), p_format) returning id into v_tournament;
  for v_player in select value from jsonb_array_elements(p_players) loop
    v_index := v_index + 1;
    if v_index % 2 = 1 then insert into public.gaming_matches (tournament_id, round, status) values (v_tournament, 1, 'pending') returning id into v_match; end if;
    if not exists (select 1 from public.gaming_players where id = (v_player->>'player_id')::uuid and discord_member is true) then raise exception 'Solo se permiten jugadores registrados'; end if;
    insert into public.gaming_match_participants (match_id, player_id, placement) values (v_match, (v_player->>'player_id')::uuid, case when v_index % 2 = 1 then 1 else 2 end);
  end loop;
  return v_tournament;
end;
$$;
revoke all on function public.tierly_create_smash_tournament(text, date, text, text, text, text, text, jsonb) from public;
grant execute on function public.tierly_create_smash_tournament(text, date, text, text, text, text, text, jsonb) to authenticated;
drop view if exists public.event_bracket_public_view;
create view public.event_bracket_public_view as
select e.id as event_id, e.name as event_name, e.event_date, e.location, e.luma_url, e.banner_url,
       t.id as tournament_id, t.game, t.format, t.status as tournament_status,
       (select count(*) from public.gaming_tournament_registrations r where r.tournament_id = t.id) as registration_count,
       gm.id as match_id, gm.round, gm.status as match_status,
       mp.placement, p.id as player_id, p.display_name, p.avatar_url
from public.gaming_events e
join public.gaming_tournaments t on t.event_id = e.id
join public.gaming_matches gm on gm.tournament_id = t.id
join public.gaming_match_participants mp on mp.match_id = gm.id
join public.gaming_players p on p.id = mp.player_id
where p.discord_member is true;
grant select on public.event_bracket_public_view to anon, authenticated
-- version: 20260925150000  name: tierly_event_without_players
create or replace function public.tierly_create_smash_tournament(
  p_name text, p_event_date date, p_location text, p_luma_url text, p_banner_url text,
  p_game text, p_format text, p_players jsonb
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_org uuid; v_event uuid; v_tournament uuid; v_match uuid; v_player jsonb; v_index int := 0;
begin
  if not public.tierly_is_admin() then raise exception 'Administrador requerido'; end if;
  if nullif(trim(p_game), '') is null then raise exception 'El juego es requerido'; end if;
  if p_format not in ('elimination', 'heats') then raise exception 'Formato inválido'; end if;
  select id into v_org from public.organizations where slug = 'tellus';
  insert into public.gaming_events (organization_id, name, event_date, location, luma_url, banner_url) values (v_org, p_name, p_event_date, coalesce(p_location, ''), nullif(trim(p_luma_url), ''), nullif(trim(p_banner_url), '')) returning id into v_event;
  insert into public.gaming_tournaments (event_id, game, format) values (v_event, trim(p_game), p_format) returning id into v_tournament;
  if jsonb_array_length(coalesce(p_players, '[]'::jsonb)) > 0 then
    for v_player in select value from jsonb_array_elements(p_players) loop
      v_index := v_index + 1;
      if v_index % 2 = 1 then insert into public.gaming_matches (tournament_id, round, status) values (v_tournament, 1, 'pending') returning id into v_match; end if;
      if not exists (select 1 from public.gaming_players where id = (v_player->>'player_id')::uuid and discord_member is true) then raise exception 'Solo se permiten jugadores registrados'; end if;
      insert into public.gaming_match_participants (match_id, player_id, placement) values (v_match, (v_player->>'player_id')::uuid, case when v_index % 2 = 1 then 1 else 2 end);
    end loop;
  end if;
  return v_tournament;
end;
$$;
revoke all on function public.tierly_create_smash_tournament(text, date, text, text, text, text, text, jsonb) from public;
grant execute on function public.tierly_create_smash_tournament(text, date, text, text, text, text, text, jsonb) to authenticated;
create or replace view public.gaming_events_catalog_public_view as
select e.id as event_id, e.name as event_name, e.event_date, e.location, e.luma_url, e.banner_url,
       t.id as tournament_id, t.game, t.format, t.status as tournament_status,
       (select count(*) from public.gaming_tournament_registrations r where r.tournament_id = t.id) as registration_count
from public.gaming_events e join public.gaming_tournaments t on t.event_id = e.id
order by e.event_date desc;
grant select on public.gaming_events_catalog_public_view to anon, authenticated
-- version: 20260925152000  name: tierly_admin_access_hardening
insert into private.admin_allowlist (email, organization_id, role)
select 'kohcuendepau@gmail.com', id, 'admin'::public.member_role
from public.organizations where slug = 'tellus'
on conflict (email) do update set organization_id = excluded.organization_id, role = excluded.role;
insert into public.organization_members (organization_id, user_id, role)
select o.id, u.id, 'admin'::public.member_role
from public.organizations o join auth.users u on lower(u.email) = 'kohcuendepau@gmail.com'
where o.slug = 'tellus'
on conflict (organization_id, user_id) do update set role = 'admin'::public.member_role;
create or replace function public.tierly_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    join auth.users u on u.id = m.user_id
    left join private.admin_allowlist a on lower(a.email) = lower(u.email)
    where m.user_id = (select auth.uid())
      and m.role = 'admin'
      and o.slug = 'tellus'
      and (lower(u.email) = 'kohcuendepau@gmail.com' or lower(u.raw_user_meta_data->>'user_name') = 'kl0ren' or lower(u.raw_user_meta_data->>'preferred_username') = 'kl0ren')
      and (a.role = 'admin' or lower(u.email) = 'kohcuendepau@gmail.com')
  );
$$;
revoke all on function public.tierly_is_admin() from public;
grant execute on function public.tierly_is_admin() to authenticated
-- version: 20260925154000  name: tierly_seed_bracket_from_registrations
create or replace function public.tierly_seed_bracket(p_tournament_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_player uuid; v_index int := 0; v_match uuid; v_count int := 0;
begin
  if not public.tierly_is_admin() then raise exception 'Administrador requerido'; end if;
  if exists (select 1 from public.gaming_matches where tournament_id = p_tournament_id) then raise exception 'El bracket ya fue creado'; end if;
  for v_player in select r.player_id from public.gaming_tournament_registrations r join public.gaming_players p on p.id = r.player_id where r.tournament_id = p_tournament_id and p.discord_member is true order by r.created_at, r.player_id loop
    v_index := v_index + 1;
    if v_index % 2 = 1 then insert into public.gaming_matches (tournament_id, round, status) values (p_tournament_id, 1, 'pending') returning id into v_match; v_count := v_count + 1; end if;
    insert into public.gaming_match_participants (match_id, player_id, placement) values (v_match, v_player, case when v_index % 2 = 1 then 1 else 2 end);
  end loop;
  if v_index < 2 then raise exception 'Se requieren al menos dos inscritos'; end if;
  return v_count;
end;
$$;
revoke all on function public.tierly_seed_bracket(uuid) from public;
grant execute on function public.tierly_seed_bracket(uuid) to authenticated
-- version: 20260925155000  name: tierly_admin_events_tournament_id
drop function if exists public.tierly_admin_events();
create function public.tierly_admin_events()
returns table (event_id uuid, tournament_id uuid, event_name text, event_date date, location text, luma_url text)
language sql security definer set search_path = '' as $$
  select e.id, t.id, e.name, e.event_date, e.location, e.luma_url
  from public.gaming_events e join public.gaming_tournaments t on t.event_id = e.id
  where public.tierly_is_admin() order by e.event_date desc, e.created_at desc;
$$;
revoke all on function public.tierly_admin_events() from public;
grant execute on function public.tierly_admin_events() to authenticated
-- version: 20260925160000  name: tierly_event_manager
create or replace function public.tierly_delete_event(p_event_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.tierly_is_admin() then raise exception 'Administrador requerido'; end if;
  delete from public.gaming_events where id = p_event_id;
  return found;
end;
$$;
revoke all on function public.tierly_delete_event(uuid) from public;
grant execute on function public.tierly_delete_event(uuid) to authenticated;
create or replace function public.tierly_set_tournament_status(p_tournament_id uuid, p_status text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.tierly_is_admin() then raise exception 'Administrador requerido'; end if;
  if p_status not in ('draft', 'live', 'completed') then raise exception 'Estado inválido'; end if;
  update public.gaming_tournaments set status = p_status where id = p_tournament_id;
  return found;
end;
$$;
revoke all on function public.tierly_set_tournament_status(uuid, text) from public;
grant execute on function public.tierly_set_tournament_status(uuid, text) to authenticated
-- version: 20260925161000  name: tierly_event_manager_status
drop function if exists public.tierly_admin_events();
create function public.tierly_admin_events()
returns table (event_id uuid, tournament_id uuid, event_name text, event_date date, location text, luma_url text, tournament_status text)
language sql security definer set search_path = '' as $$
  select e.id, t.id, e.name, e.event_date, e.location, e.luma_url, t.status
  from public.gaming_events e join public.gaming_tournaments t on t.event_id = e.id
  where public.tierly_is_admin() order by e.event_date desc, e.created_at desc;
$$;
revoke all on function public.tierly_admin_events() from public;
grant execute on function public.tierly_admin_events() to authenticated
-- version: 20260925162000  name: tierly_force_delete_event
create or replace function public.tierly_delete_event(p_event_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_tournament uuid;
begin
  if not public.tierly_is_admin() then raise exception 'Administrador requerido'; end if;
  select id into v_tournament from public.gaming_tournaments where event_id = p_event_id limit 1;
  if v_tournament is null then
    delete from public.gaming_events where id = p_event_id;
    return found;
  end if;
  delete from public.gaming_rewards where tournament_id = v_tournament;
  delete from public.gaming_match_participants where match_id in (select id from public.gaming_matches where tournament_id = v_tournament);
  delete from public.gaming_matches where tournament_id = v_tournament;
  delete from public.gaming_tournament_registrations where tournament_id = v_tournament;
  delete from public.gaming_tournaments where id = v_tournament;
  delete from public.gaming_events where id = p_event_id;
  return found;
end;
$$;
revoke all on function public.tierly_delete_event(uuid) from public;
grant execute on function public.tierly_delete_event(uuid) to authenticated
-- version: 20260925163000  name: tierly_edit_event_banner
create or replace function public.tierly_update_event(p_event_id uuid, p_name text, p_event_date date, p_location text, p_luma_url text, p_banner_url text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.tierly_is_admin() then raise exception 'Administrador requerido'; end if;
  update public.gaming_events
  set name = trim(p_name), event_date = p_event_date, location = nullif(trim(p_location), ''),
      luma_url = nullif(trim(p_luma_url), ''), banner_url = nullif(trim(p_banner_url), '')
  where id = p_event_id;
  return found;
end;
$$;
revoke all on function public.tierly_update_event(uuid, text, date, text, text, text) from public;
grant execute on function public.tierly_update_event(uuid, text, date, text, text, text) to authenticated;
drop function if exists public.tierly_admin_events();
create function public.tierly_admin_events()
returns table (event_id uuid, tournament_id uuid, event_name text, event_date date, location text, luma_url text, banner_url text, tournament_status text)
language sql security definer set search_path = '' as $$
  select e.id, t.id, e.name, e.event_date, e.location, e.luma_url, e.banner_url, t.status
  from public.gaming_events e join public.gaming_tournaments t on t.event_id = e.id
  where public.tierly_is_admin() order by e.event_date desc, e.created_at desc;
$$;
revoke all on function public.tierly_admin_events() from public;
grant execute on function public.tierly_admin_events() to authenticated
-- version: 20260925164000  name: tierly_registration_live_status
create or replace function public.tierly_register_for_tournament(p_tournament_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_player uuid; v_status text;
begin
  select id into v_player from public.gaming_players where auth_user_id = (select auth.uid()) and discord_member is true;
  if v_player is null then raise exception 'Primero verifica tu cuenta de Discord en Tierly'; end if;
  select status into v_status from public.gaming_tournaments where id = p_tournament_id;
  if v_status not in ('draft', 'live') then raise exception 'Las inscripciones están cerradas'; end if;
  insert into public.gaming_tournament_registrations (tournament_id, player_id) values (p_tournament_id, v_player) on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.tierly_register_for_tournament(uuid) from public;
grant execute on function public.tierly_register_for_tournament(uuid) to authenticated
-- version: 20260925165000  name: tierly_registration_visibility
drop function if exists public.tierly_admin_events();
create function public.tierly_admin_events()
returns table (event_id uuid, tournament_id uuid, event_name text, event_date date, location text, luma_url text, banner_url text, tournament_status text, registration_count bigint)
language sql security definer set search_path = '' as $$
  select e.id, t.id, e.name, e.event_date, e.location, e.luma_url, e.banner_url, t.status,
         (select count(*) from public.gaming_tournament_registrations r where r.tournament_id = t.id)
  from public.gaming_events e join public.gaming_tournaments t on t.event_id = e.id
  where public.tierly_is_admin() order by e.event_date desc, e.created_at desc;
$$;
revoke all on function public.tierly_admin_events() from public;
grant execute on function public.tierly_admin_events() to authenticated;
drop view if exists public.gaming_events_catalog_public_view;
create view public.gaming_events_catalog_public_view as
select e.id as event_id, e.name as event_name, e.event_date, e.location, e.luma_url, e.banner_url,
       t.id as tournament_id, t.game, t.format, t.status as tournament_status,
       (select count(*) from public.gaming_tournament_registrations r where r.tournament_id = t.id) as registration_count,
       coalesce((select jsonb_agg(jsonb_build_object('player_id', p.id, 'display_name', p.display_name) order by r.created_at)
                 from public.gaming_tournament_registrations r join public.gaming_players p on p.id = r.player_id
                 where r.tournament_id = t.id and p.discord_member is true), '[]'::jsonb) as registered_players
from public.gaming_events e join public.gaming_tournaments t on t.event_id = e.id
order by e.event_date desc;
grant select on public.gaming_events_catalog_public_view to anon, authenticated
-- version: 20260925170000  name: tierly_random_bracket_pairing
create or replace function public.tierly_seed_bracket(p_tournament_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_player uuid; v_index int := 0; v_match uuid; v_count int := 0;
begin
  if not public.tierly_is_admin() then raise exception 'Administrador requerido'; end if;
  if exists (select 1 from public.gaming_matches where tournament_id = p_tournament_id) then raise exception 'El bracket ya fue creado'; end if;
  for v_player in select r.player_id from public.gaming_tournament_registrations r join public.gaming_players p on p.id = r.player_id where r.tournament_id = p_tournament_id and p.discord_member is true order by random() loop
    v_index := v_index + 1;
    if v_index % 2 = 1 then insert into public.gaming_matches (tournament_id, round, status) values (p_tournament_id, 1, 'pending') returning id into v_match; v_count := v_count + 1; end if;
    insert into public.gaming_match_participants (match_id, player_id, placement) values (v_match, v_player, case when v_index % 2 = 1 then 1 else 2 end);
  end loop;
  if v_index < 2 then raise exception 'Se requieren al menos dos inscritos'; end if;
  return v_count;
end;
$$;
revoke all on function public.tierly_seed_bracket(uuid) from public;
grant execute on function public.tierly_seed_bracket(uuid) to authenticated
