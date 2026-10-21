-- ============================================================
-- GAME v2: tipos de juego, ajustes y script del editor avanzado.
-- Ejecutar en el SQL Editor del proyecto GAME (después de schema.sql y creators.sql). Es seguro repetirlo.
-- ============================================================

alter table public.games add column if not exists mode   text  not null default 'build';   -- build | social | obby | arena
alter table public.games add column if not exists config jsonb not null default '{}';
alter table public.games add column if not exists script text  not null default '';
alter table public.games add column if not exists updated_at timestamptz not null default now();
alter table public.games drop constraint if exists games_mode_check;
alter table public.games add constraint games_mode_check check (mode in ('build', 'social', 'obby', 'arena'));
alter table public.games drop constraint if exists games_script_len;
alter table public.games add constraint games_script_len check (char_length(script) <= 20000);

-- Editar un juego (solo su dueño con permiso de creación)
create or replace function public.update_game(
  p_secret uuid, p_game uuid, p_name text, p_desc text, p_hue int, p_max int, p_mode text, p_config jsonb, p_script text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret);
begin
  if not s.can_create then raise exception 'not allowed' using errcode = '42501'; end if;
  update games set name = btrim(p_name), description = left(coalesce(p_desc, ''), 200),
         hue = ((p_hue % 360) + 360) % 360, max_players = least(greatest(p_max, 1), 50),
         mode = p_mode, config = coalesce(p_config, '{}'), script = coalesce(p_script, ''), updated_at = now()
   where id = p_game and owner_id = s.player_id;
  if not found then raise exception 'not your game' using errcode = '42501'; end if;
end $$;

-- create_game devuelve el id y admite modo (se quita la versión antigua para evitar ambigüedad)
drop function if exists public.create_game(uuid, text, text, int);
create or replace function public.create_game(p_secret uuid, p_name text, p_desc text default '', p_hue int default 200, p_mode text default 'build')
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret); gid uuid;
begin
  if not s.can_create then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into games (name, description, owner_id, owner_name, hue, mode)
  values (btrim(p_name), left(coalesce(p_desc, ''), 200), s.player_id, s.username, ((p_hue % 360) + 360) % 360, p_mode)
  returning id into gid;
  return gid;
end $$;

-- Las reglas del juego se aplican en el servidor: sin construir / sin chat según config
create or replace function public._rule(p_game uuid, p_key text, p_default boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (config ->> p_key)::boolean from games where id = p_game), p_default);
$$;
revoke all on function public._rule(uuid, text, boolean) from public, anon, authenticated;

create or replace function public.place_block(p_secret uuid, p_game uuid, p_x int, p_y int, p_z int, p_kind int)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret); g games;
begin
  if p_y < 0 or p_y > 255 or abs(p_x) > 5000 or abs(p_z) > 5000 or p_kind not between 0 and 15 then return; end if;
  select * into g from games where id = p_game;
  if not found then return; end if;
  if g.mode in ('social', 'obby', 'arena') and g.owner_id <> s.player_id and not coalesce((g.config ->> 'allow_build')::boolean, false) then return; end if;
  if g.mode = 'build' and not coalesce((g.config ->> 'allow_build')::boolean, true) and g.owner_id <> s.player_id then return; end if;
  insert into blocks (game_id, x, y, z, kind, placed_by) values (p_game, p_x, p_y, p_z, p_kind, s.player_id)
  on conflict (game_id, x, y, z) do update set kind = excluded.kind, placed_by = excluded.placed_by;
  insert into interactions (game_id, player_id, username, kind, x, y, z) values (p_game, s.player_id, s.username, 'place', p_x, p_y, p_z);
end $$;

create or replace function public.break_block(p_secret uuid, p_game uuid, p_x int, p_y int, p_z int)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret); g games;
begin
  select * into g from games where id = p_game;
  if not found then return; end if;
  if g.mode in ('social', 'obby', 'arena') and g.owner_id <> s.player_id and not coalesce((g.config ->> 'allow_build')::boolean, false) then return; end if;
  if g.mode = 'build' and not coalesce((g.config ->> 'allow_build')::boolean, true) and g.owner_id <> s.player_id then return; end if;
  delete from blocks where game_id = p_game and x = p_x and y = p_y and z = p_z;
  insert into interactions (game_id, player_id, username, kind, x, y, z) values (p_game, s.player_id, s.username, 'break', p_x, p_y, p_z);
end $$;

create or replace function public.say(p_secret uuid, p_game uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret);
begin
  p_text := left(btrim(p_text), 200);
  if p_text = '' then return; end if;
  if not public._rule(p_game, 'allow_chat', true) then return; end if;
  insert into interactions (game_id, player_id, username, kind, payload)
  values (p_game, s.player_id, s.username, 'chat', jsonb_build_object('text', p_text));
  if random() < 0.05 then delete from interactions where kind = 'chat' and created_at < now() - interval '1 day'; end if;
end $$;

grant execute on function
  public.update_game(uuid, uuid, text, text, int, int, text, jsonb, text),
  public.create_game(uuid, text, text, int, text),
  public.place_block(uuid, uuid, int, int, int, int),
  public.break_block(uuid, uuid, int, int, int),
  public.say(uuid, uuid, text)
to anon, authenticated;

-- Realtime fiable para jugadores y chat
alter table public.interactions replica identity full;
alter table public.player_state replica identity full;

-- Juegos de ejemplo de cada tipo (el dueño es Blocksy; se pueden clonar copiando su configuración)
insert into public.games (id, name, description, owner_id, owner_name, hue, mode, config)
values
 ('00000000-0000-0000-0000-000000000002', 'Plaza Social', 'Charla, emotes y música. Aquí no se construye.', '00000000-0000-0000-0000-000000000000', 'Blocksy', 285, 'social',
  '{"allow_build":false,"world":"plaza","sky":"sunset","welcome":"Bienvenido a la plaza. Usa G para los emotes."}'),
 ('00000000-0000-0000-0000-000000000003', 'Carrera de Obstáculos', 'Salta de bloque en bloque hasta la meta.', '00000000-0000-0000-0000-000000000000', 'Blocksy', 15, 'obby',
  '{"allow_build":false,"world":"obby","sky":"day","jump":9.4,"welcome":"Llega a la bandera dorada."}')
on conflict (id) do nothing;
