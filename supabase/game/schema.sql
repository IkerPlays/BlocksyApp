-- ============================================================
-- Proyecto Supabase #2: GAME (posiciones x,y,z, bloques, chat, interacciones)
-- Ejecutar en el SQL Editor del proyecto GAME.
--
-- Modelo de seguridad (no necesita compartir JWT con el proyecto AUTH):
--  * Lectura: pública (anon) -> Realtime y la 3DS pueden leer.
--  * Escritura: SOLO mediante funciones RPC que exigen un "secret de sesión".
--  * El secret lo crea la Edge Function `game-session` tras validar el token de AUTH.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.games (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 3 and 40),
  description text not null default '' check (char_length(description) <= 200),
  owner_id    uuid not null,
  owner_name  text not null default '',
  hue         int  not null default 200,
  max_players int  not null default 20,
  created_at  timestamptz not null default now()
);

create table if not exists public.blocks (
  game_id   uuid not null references public.games(id) on delete cascade,
  x int not null, y int not null, z int not null,
  kind      smallint not null default 1,
  placed_by uuid,
  primary key (game_id, x, y, z)
);

create table if not exists public.player_state (
  player_id  uuid primary key,
  game_id    uuid not null references public.games(id) on delete cascade,
  username   text not null,
  color      text not null default '#4da6ff',
  x real not null default 0, y real not null default 0, z real not null default 0,
  ry real not null default 0,
  anim       text not null default 'idle',
  platform   text not null default 'web',
  updated_at timestamptz not null default now()
);
create index if not exists player_state_game_idx on public.player_state (game_id, updated_at desc);

create table if not exists public.interactions (
  id         bigint generated always as identity primary key,
  game_id    uuid not null references public.games(id) on delete cascade,
  player_id  uuid not null,
  username   text not null default '',
  kind       text not null,                 -- place | break | chat | join | leave
  x int, y int, z int,
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists interactions_game_idx on public.interactions (game_id, id desc);

-- Sesiones emitidas por la Edge Function (solo accesible con service_role)
create table if not exists public.sessions (
  secret     uuid primary key default gen_random_uuid(),
  player_id  uuid not null,
  username   text not null,
  color      text not null default '#4da6ff',
  expires_at timestamptz not null default now() + interval '12 hours'
);
create index if not exists sessions_player_idx on public.sessions (player_id);

-- ---------- RLS: lectura pública, sin escritura directa ----------
alter table public.games        enable row level security;
alter table public.blocks       enable row level security;
alter table public.player_state enable row level security;
alter table public.interactions enable row level security;
alter table public.sessions     enable row level security;   -- sin políticas = nadie salvo service_role

drop policy if exists "read games" on public.games;
create policy "read games" on public.games        for select to anon, authenticated using (true);
drop policy if exists "read blocks" on public.blocks;
create policy "read blocks" on public.blocks       for select to anon, authenticated using (true);
drop policy if exists "read players" on public.player_state;
create policy "read players" on public.player_state for select to anon, authenticated using (true);
drop policy if exists "read actions" on public.interactions;
create policy "read actions" on public.interactions for select to anon, authenticated using (true);

revoke insert, update, delete on public.games, public.blocks, public.player_state, public.interactions from anon, authenticated;
revoke all on public.sessions from anon, authenticated;

-- ---------- Funciones ----------
create or replace function public._me(p_secret uuid) returns public.sessions
language plpgsql security definer set search_path = public as $$
declare s public.sessions;
begin
  select * into s from sessions where secret = p_secret and expires_at > now();
  if not found then raise exception 'invalid session' using errcode = '28000'; end if;
  return s;
end $$;
revoke all on function public._me(uuid) from public, anon, authenticated;

create or replace function public.move(
  p_secret uuid, p_game uuid, p_x real, p_y real, p_z real, p_ry real,
  p_anim text default 'idle', p_platform text default 'web')
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret);
begin
  if abs(p_x) > 100000 or abs(p_y) > 100000 or abs(p_z) > 100000 then return; end if;
  insert into player_state (player_id, game_id, username, color, x, y, z, ry, anim, platform, updated_at)
  values (s.player_id, p_game, s.username, s.color, p_x, p_y, p_z, p_ry,
          left(p_anim, 12), case when p_platform = '3ds' then '3ds' else 'web' end, now())
  on conflict (player_id) do update set
    game_id = excluded.game_id, username = excluded.username, color = excluded.color,
    x = excluded.x, y = excluded.y, z = excluded.z, ry = excluded.ry,
    anim = excluded.anim, platform = excluded.platform, updated_at = now();
  if random() < 0.02 then
    delete from player_state where updated_at < now() - interval '30 seconds';
  end if;
end $$;

create or replace function public.place_block(p_secret uuid, p_game uuid, p_x int, p_y int, p_z int, p_kind int)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret);
begin
  if p_y < 0 or p_y > 255 or abs(p_x) > 5000 or abs(p_z) > 5000 or p_kind not between 0 and 15 then return; end if;
  insert into blocks (game_id, x, y, z, kind, placed_by) values (p_game, p_x, p_y, p_z, p_kind, s.player_id)
  on conflict (game_id, x, y, z) do update set kind = excluded.kind, placed_by = excluded.placed_by;
  insert into interactions (game_id, player_id, username, kind, x, y, z) values (p_game, s.player_id, s.username, 'place', p_x, p_y, p_z);
end $$;

create or replace function public.break_block(p_secret uuid, p_game uuid, p_x int, p_y int, p_z int)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret);
begin
  delete from blocks where game_id = p_game and x = p_x and y = p_y and z = p_z;
  insert into interactions (game_id, player_id, username, kind, x, y, z) values (p_game, s.player_id, s.username, 'break', p_x, p_y, p_z);
end $$;

create or replace function public.say(p_secret uuid, p_game uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret);
begin
  p_text := left(btrim(p_text), 200);
  if p_text = '' then return; end if;
  insert into interactions (game_id, player_id, username, kind, payload)
  values (p_game, s.player_id, s.username, 'chat', jsonb_build_object('text', p_text));
end $$;

create or replace function public.leave(p_secret uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret);
begin delete from player_state where player_id = s.player_id; end $$;

create or replace function public.create_game(p_secret uuid, p_name text, p_desc text default '', p_hue int default 200)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret); gid uuid;
begin
  insert into games (name, description, owner_id, owner_name, hue)
  values (btrim(p_name), left(coalesce(p_desc, ''), 200), s.player_id, s.username, ((p_hue % 360) + 360) % 360)
  returning id into gid;
  return gid;
end $$;

create or replace function public.delete_game(p_secret uuid, p_game uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret);
begin delete from games where id = p_game and owner_id = s.player_id; end $$;

grant execute on function
  public.move(uuid, uuid, real, real, real, real, text, text),
  public.place_block(uuid, uuid, int, int, int, int),
  public.break_block(uuid, uuid, int, int, int),
  public.say(uuid, uuid, text),
  public.leave(uuid),
  public.create_game(uuid, text, text, int),
  public.delete_game(uuid, uuid)
to anon, authenticated;

-- ---------- Realtime ----------
do $$
declare t text;
begin
  foreach t in array array['player_state', 'blocks', 'interactions'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
alter table public.player_state replica identity full;
alter table public.blocks       replica identity full;

-- ---------- Juego inicial ----------
insert into public.games (id, name, description, owner_id, owner_name, hue)
values ('00000000-0000-0000-0000-000000000001', 'Spawn Plaza', 'Mundo abierto para construir. ¡Empieza aquí!',
        '00000000-0000-0000-0000-000000000000', 'Blocksy', 205)
on conflict do nothing;

-- ---------- Iniciar sesión en otro dispositivo (la 3DS muestra un QR; el móvil lo autoriza) ----------
create table if not exists public.link_codes (
  code       text primary key,
  poll_token uuid not null default gen_random_uuid(),
  secret     uuid,                                   -- sesión creada al aprobar
  expires_at timestamptz not null default now() + interval '10 minutes'
);
alter table public.link_codes enable row level security;   -- sin políticas: solo vía funciones

-- La 3DS pide un código (anónimo) y recibe también un token privado para consultar el estado
create or replace function public.link_start() returns jsonb
language plpgsql security definer set search_path = public as $$
declare c text; i int; p uuid;
        alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  delete from link_codes where expires_at < now();
  delete from sessions where expires_at < now();
  if (select count(*) from link_codes) > 500 then raise exception 'too many pending codes'; end if;
  loop
    c := '';
    for i in 1..6 loop c := c || substr(alphabet, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1); end loop;
    begin
      insert into link_codes (code) values (c) returning poll_token into p;
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  return jsonb_build_object('code', c, 'poll', p);
end $$;

-- La 3DS consulta si ya se aprobó (necesita el token privado)
create or replace function public.link_poll(p_code text, p_poll uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r link_codes; s sessions;
begin
  select * into r from link_codes where code = upper(btrim(p_code)) and poll_token = p_poll;
  if not found or r.expires_at < now() then return jsonb_build_object('status', 'expired'); end if;
  if r.secret is null then return jsonb_build_object('status', 'pending'); end if;
  select * into s from sessions where secret = r.secret;
  delete from link_codes where code = r.code;
  return jsonb_build_object('status', 'ok', 'secret', s.secret, 'player_id', s.player_id, 'username', s.username, 'color', s.color);
end $$;

-- El móvil/tablet (con sesión iniciada) aprueba el código: se crea una sesión de 30 días para la 3DS
create or replace function public.link_approve(p_secret uuid, p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare s sessions := public._me(p_secret); n sessions; k text := upper(btrim(p_code));
begin
  perform 1 from link_codes where code = k and secret is null and expires_at > now() for update;
  if not found then raise exception 'invalid code' using errcode = '22023'; end if;
  insert into sessions (player_id, username, color, expires_at)
  values (s.player_id, s.username, s.color, now() + interval '30 days') returning * into n;
  update link_codes set secret = n.secret where code = k;
end $$;

-- Comprueba que una sesión guardada sigue siendo válida
create or replace function public.whoami(p_secret uuid) returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('player_id', player_id, 'username', username, 'color', color)
  from sessions where secret = p_secret and expires_at > now();
$$;

grant execute on function public.link_start(), public.link_poll(text, uuid),
  public.link_approve(uuid, text), public.whoami(uuid) to anon, authenticated;
