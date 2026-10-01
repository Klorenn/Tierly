-- Reconciliacion de `tierly_event_series` con lo que quedo aplicado a mano.
--
-- Contexto (2026-10-01): la version que se aplico al proyecto remoto como
-- 20260930130015 creo la tabla con `(name not null, recurrence_rule, timezone,
-- active)` y la funcion `tierly_create_event_series(text, uuid, text, text, text)`.
-- El archivo del repo con ese mismo numero declara otra forma: `first_event_id`
-- unico, `timezone` con default, sin `name` ni `active`, y una funcion de 10
-- argumentos que crea el evento y la serie en una sola llamada.
--
-- Como la tabla ya existe, el `create table if not exists` de aquel archivo es
-- un no-op: la forma remota sobrevive. Eso dejaba dos bombas:
--
--   1. La funcion nueva inserta sin `name`, contra una columna `not null` sin
--      default. Falla en runtime, no en el push.
--   2. La firma vieja de 5 argumentos sigue viva: `create or replace` con una
--      lista de argumentos distinta crea una SOBRECARGA, no reemplaza.
--
-- Esta migracion lleva ambos lados a la misma forma y es idempotente, asi que
-- corre igual sobre la base remota (donde encuentra la forma vieja) que sobre un
-- `db reset` desde cero (donde ya encuentra la forma nueva).

-- 1. Forma de la tabla.
alter table public.tierly_event_series drop column if exists name;
alter table public.tierly_event_series drop column if exists active;
alter table public.tierly_event_series alter column timezone set default 'America/Santiago';

do $reconcile$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tierly_event_series'::regclass
      and contype = 'u'
      and conkey = array[(
        select attnum from pg_attribute
        where attrelid = 'public.tierly_event_series'::regclass
          and attname = 'first_event_id'
      )]
  ) then
    alter table public.tierly_event_series
      add constraint tierly_event_series_first_event_id_key unique (first_event_id);
  end if;
end;
$reconcile$;

-- 2. La sobrecarga vieja de 5 argumentos. Se elimina para que no quede una
--    segunda ruta de creacion de series con reglas de validacion distintas.
drop function if exists public.tierly_create_event_series(text, uuid, text, text, text);

-- 3. La funcion canonica de 10 argumentos, que nunca llego a aplicarse en remoto.
create or replace function public.tierly_create_event_series(
  p_guild_id text,
  p_name text,
  p_event_date date,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text,
  p_recurrence_rule text,
  p_location text,
  p_luma_url text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_event uuid;
  v_series uuid;
  v_timezone text := coalesce(nullif(trim(p_timezone), ''), 'America/Santiago');
begin
  if not public.is_community_admin(p_guild_id) then
    raise exception 'Administrador de comunidad requerido';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'El nombre del evento es requerido';
  end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at < p_starts_at then
    raise exception 'El horario del evento no es válido';
  end if;
  if p_recurrence_rule not in ('weekly', 'monthly') then
    raise exception 'La regla de recurrencia no es válida';
  end if;

  select id into v_org from public.organizations where slug = 'tellus';
  insert into public.gaming_events (
    organization_id, guild_id, name, event_date, starts_at, ends_at, timezone,
    location, luma_url, description, status
  ) values (
    v_org, p_guild_id, trim(p_name), p_event_date, p_starts_at, p_ends_at, v_timezone,
    nullif(trim(p_location), ''), nullif(trim(p_luma_url), ''), nullif(trim(p_description), ''), 'scheduled'
  ) returning id into v_event;

  insert into public.tierly_event_series (guild_id, first_event_id, timezone, recurrence_rule)
    values (p_guild_id, v_event, v_timezone, p_recurrence_rule)
    returning id into v_series;

  return v_series;
end;
$$;

revoke all on function public.tierly_create_event_series(text, text, date, timestamptz, timestamptz, text, text, text, text, text) from public, anon;
grant execute on function public.tierly_create_event_series(text, text, date, timestamptz, timestamptz, text, text, text, text, text) to authenticated;
