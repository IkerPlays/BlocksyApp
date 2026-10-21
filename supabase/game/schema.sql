-- ============================================================
-- Proyecto Supabase #2: GAME (movimiento x,y,z, bloques, interacciones)
-- Ejecutar en el SQL Editor del proyecto de Game.
--
-- IMPORTANTE: los usuarios se autentican contra el proyecto AUTH, no contra
-- este. Para que RLS los reconozca, este proyecto debe aceptar los JWT del
-- proyecto AUTH (ver supabase/README.md). El id del jugador es auth.jwt()->>'sub'.
-- ============================================================

create or replace function public.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt()->>'sub', '')::uuid
$$;

create table if not exists public.games (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 3 and 40),
  description text not null default '',
  owner_id    uuid not null default public.uid(),
  max_players int  not null default 20,
  created_at  timestamptz not null default now()
);

-- Mundo de bloques (cada bloque ocupa la celda [x,x+1) x [y,y+1) x [z,z+1))
create table if not exists public.blocks (
  game_id   uuid not null references public.games(id) on delete cascade,
  x int not null, y int not null, z int not null,
  kind      smallint not null default 1,   -- índice en la paleta de colores
  placed_by uuid default public.uid(),
  primary key (game_id, x, y, z)
);

-- Estado en vivo de cada jugador (una fila por jugador; se hace upsert ~10 Hz)
create table if not exists public.player_state (
  player_id  uuid primary key default public.uid(),
  game_id    uuid not null references public.games(id) on delete cascade,
  username   text not null,
  color      text not null default '#4da6ff',
  x real not null default 0, y real not null default 0, z real not null default 0,
  ry real not null default 0,              -- rotación (yaw) en radianes
  anim       text not null default 'idle', -- idle | walk | jump
  platform   text not null default 'web',  -- web | 3ds
  updated_at timestamptz not null default now()
);
create index if not exists player_state_game_idx on public.player_state (game_id, updated_at desc);

-- Registro de interacciones (poner/romper bloque, chat, emotes, ...)
create table if not exists public.interactions (
  id         bigint generated always as identity primary key,
  game_id    uuid not null references public.games(id) on delete cascade,
  player_id  uuid not null default public.uid(),
  kind       text not null,                -- place | break | chat | emote | ...
  x int, y int, z int,
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists interactions_game_idx on public.interactions (game_id, id desc);

-- Mantiene updated_at al día
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists player_state_touch on public.player_state;
create trigger player_state_touch before insert or update on public.player_state
  for each row execute function public.touch_updated_at();

-- Limpieza de jugadores inactivos (llamar con pg_cron o manualmente)
create or replace function public.prune_stale_players() returns void language sql as $$
  delete from public.player_state where updated_at < now() - interval '30 seconds';
$$;

-- ---------- RLS ----------
alter table public.games        enable row level security;
alter table public.blocks       enable row level security;
alter table public.player_state enable row level security;
alter table public.interactions enable row level security;

create policy "games: read"   on public.games for select to authenticated using (true);
create policy "games: create" on public.games for insert to authenticated with check (owner_id = public.uid());
create policy "games: owner updates" on public.games for update to authenticated using (owner_id = public.uid());
create policy "games: owner deletes" on public.games for delete to authenticated using (owner_id = public.uid());

create policy "blocks: read"   on public.blocks for select to authenticated using (true);
create policy "blocks: place"  on public.blocks for insert to authenticated with check (placed_by = public.uid());
create policy "blocks: break"  on public.blocks for delete to authenticated using (true);
create policy "blocks: change" on public.blocks for update to authenticated using (true) with check (placed_by = public.uid());

create policy "players: read"   on public.player_state for select to authenticated using (true);
create policy "players: insert" on public.player_state for insert to authenticated with check (player_id = public.uid());
create policy "players: update" on public.player_state for update to authenticated using (player_id = public.uid()) with check (player_id = public.uid());
create policy "players: delete" on public.player_state for delete to authenticated using (player_id = public.uid());

create policy "interactions: read"   on public.interactions for select to authenticated using (true);
create policy "interactions: insert" on public.interactions for insert to authenticated with check (player_id = public.uid());

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.player_state, public.blocks, public.interactions;
alter table public.player_state replica identity full;  -- para recibir bien los DELETE
alter table public.blocks       replica identity full;

-- ---------- Juego inicial ----------
insert into public.games (id, name, description, owner_id)
values ('00000000-0000-0000-0000-000000000001', 'Spawn Plaza', 'Mundo abierto para construir. ¡Empieza aquí!',
        '00000000-0000-0000-0000-000000000000')
on conflict do nothing;
