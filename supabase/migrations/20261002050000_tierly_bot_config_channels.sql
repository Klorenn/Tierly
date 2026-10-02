-- supabase/migrations/20261002050000_tierly_bot_config_channels.sql
-- Columnas para que admins configuren canales de bienvenida/anuncios via slash command
-- Sin necesidad de tocar .env ni redeployar el bot

alter table public.communities
  add column if not exists welcome_channel_id text,
  add column if not exists announce_channel_id text;

comment on column public.communities.welcome_channel_id is 'Canal de bienvenida configurado via /tierly set welcome-channel. Fallback: bienvenida-tierly';
comment on column public.communities.announce_channel_id is 'Canal de anuncios configurado via /tierly set announce-channel. Fallback: anuncios-tierly';