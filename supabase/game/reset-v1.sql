-- Ejecuta ESTO PRIMERO (y después schema.sql) si ya habías ejecutado la primera versión del esquema de GAME.
-- Borra las tablas antiguas (solo datos de prueba) para recrearlas con la estructura nueva.
drop table if exists public.interactions, public.player_state, public.blocks, public.sessions, public.games cascade;
drop function if exists public.prune_stale_players();
drop function if exists public.touch_updated_at() cascade;
drop function if exists public.uid() cascade;
