-- ============================================================
-- GAME v3: la lista de juegos pasa al proyecto STORE. GAME solo guarda una copia mínima de las reglas (game_rules)
-- para validar construir / chatear sin depender de STORE en cada acción. Ejecutar en el SQL Editor de GAME. Es seguro repetirlo.
-- ============================================================
create table if not exists public.game_rules (
  game_id    uuid primary key,
  owner_id   uuid not null,
  mode       text not null default 'build',
  config     jsonb not null default '{}',          -- solo allow_build / allow_chat
  updated_at timestamptz not null default now()
);
alter table public.game_rules enable row level security;
drop policy if exists "read rules" on public.game_rules;
create policy "read rules" on public.game_rules for select to anon, authenticated using (true);
revoke insert, update, delete on public.game_rules from anon, authenticated;

-- Los bloques, posiciones y chat ya no cuelgan de la tabla games (que vive en STORE)
alter table public.blocks       drop constraint if exists blocks_game_id_fkey;
alter table public.player_state drop constraint if exists player_state_game_id_fkey;
alter table public.interactions drop constraint if exists interactions_game_id_fkey;

-- Reglas de los juegos iniciales (mismos ids que en STORE). Si ya tenías games aquí se copian sus reglas.
insert into public.game_rules (game_id, owner_id, mode, config)
select id, owner_id, mode, jsonb_strip_nulls(jsonb_build_object('allow_build', config -> 'allow_build', 'allow_chat', config -> 'allow_chat'))
from public.games on conflict (game_id) do nothing;
insert into public.game_rules (game_id, owner_id, mode, config) values
 ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'build', '{}'),
 ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'social', '{"allow_build":false}'),
 ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'obby', '{"allow_build":false}')
on conflict (game_id) do nothing;

-- El cliente la llama tras guardar el juego en STORE (solo cuentas creadoras; solo el dueño puede cambiar las reglas de un id)
create or replace function public.upsert_game_rules(p_secret uuid, p_game uuid, p_mode text, p_config jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret); cur public.game_rules;
begin
  if not s.can_create then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into cur from game_rules where game_id = p_game;
  if found and cur.owner_id <> s.player_id then raise exception 'not your game' using errcode = '42501'; end if;
  insert into game_rules (game_id, owner_id, mode, config)
  values (p_game, s.player_id, p_mode, jsonb_strip_nulls(jsonb_build_object('allow_build', p_config -> 'allow_build', 'allow_chat', p_config -> 'allow_chat')))
  on conflict (game_id) do update set mode = excluded.mode, config = excluded.config, updated_at = now();
end $$;

-- Al borrar un juego en STORE: limpia sus reglas, bloques y jugadores
create or replace function public.delete_game_data(p_secret uuid, p_game uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret);
begin
  if not s.can_create then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from game_rules where game_id = p_game and owner_id = s.player_id) then return; end if;
  delete from blocks where game_id = p_game; delete from player_state where game_id = p_game;
  delete from interactions where game_id = p_game; delete from game_rules where game_id = p_game;
end $$;

create or replace function public._rule(p_game uuid, p_key text, p_default boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (config ->> p_key)::boolean from game_rules where game_id = p_game), p_default);
$$;
revoke all on function public._rule(uuid, text, boolean) from public, anon, authenticated;

create or replace function public.place_block(p_secret uuid, p_game uuid, p_x int, p_y int, p_z int, p_kind int)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret); g public.game_rules;
begin
  if p_y < 0 or p_y > 255 or abs(p_x) > 5000 or abs(p_z) > 5000 or p_kind not between 0 and 15 then return; end if;
  select * into g from game_rules where game_id = p_game;
  if not found then return; end if;                                  -- juego desconocido: no se escribe
  if g.mode in ('social', 'obby', 'arena') and g.owner_id <> s.player_id and not coalesce((g.config ->> 'allow_build')::boolean, false) then return; end if;
  if g.mode = 'build' and not coalesce((g.config ->> 'allow_build')::boolean, true) and g.owner_id <> s.player_id then return; end if;
  insert into blocks (game_id, x, y, z, kind, placed_by) values (p_game, p_x, p_y, p_z, p_kind, s.player_id)
  on conflict (game_id, x, y, z) do update set kind = excluded.kind, placed_by = excluded.placed_by;
  insert into interactions (game_id, player_id, username, kind, x, y, z) values (p_game, s.player_id, s.username, 'place', p_x, p_y, p_z);
end $$;

create or replace function public.break_block(p_secret uuid, p_game uuid, p_x int, p_y int, p_z int)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret); g public.game_rules;
begin
  select * into g from game_rules where game_id = p_game;
  if not found then return; end if;
  if g.mode in ('social', 'obby', 'arena') and g.owner_id <> s.player_id and not coalesce((g.config ->> 'allow_build')::boolean, false) then return; end if;
  if g.mode = 'build' and not coalesce((g.config ->> 'allow_build')::boolean, true) and g.owner_id <> s.player_id then return; end if;
  delete from blocks where game_id = p_game and x = p_x and y = p_y and z = p_z;
  insert into interactions (game_id, player_id, username, kind, x, y, z) values (p_game, s.player_id, s.username, 'break', p_x, p_y, p_z);
end $$;

-- Funciones antiguas que escribían en la tabla games de este proyecto: ya no se usan
drop function if exists public.create_game(uuid, text, text, int, text);
drop function if exists public.create_game(uuid, text, text, int);
drop function if exists public.update_game(uuid, uuid, text, text, int, int, text, jsonb, text);
drop function if exists public.delete_game(uuid, uuid);

grant execute on function public.upsert_game_rules(uuid, uuid, text, jsonb), public.delete_game_data(uuid, uuid),
  public.place_block(uuid, uuid, int, int, int, int), public.break_block(uuid, uuid, int, int, int) to anon, authenticated;
