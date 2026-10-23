-- GAME v5: varias piezas de bloque en una llamada (lo usa el Studio para cajas, estructuras y deshacer).
-- Ejecutar DESPUÉS de v3.sql / v4.sql. Es seguro repetirlo.
-- p_blocks = [[x, y, z, tipo], ...]; tipo -1 = borrar. Máximo 600 por llamada. Mismas reglas que place_block / break_block.
create or replace function public.place_blocks(p_secret uuid, p_game uuid, p_blocks jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret); g public.game_rules; b jsonb; n int := 0; vx int; vy int; vz int; vk int;
begin
  select * into g from game_rules where game_id = p_game;
  if not found then return; end if;
  if g.mode in ('social', 'obby', 'arena') and g.owner_id <> s.player_id and not coalesce((g.config ->> 'allow_build')::boolean, false) then return; end if;
  if g.mode = 'build' and not coalesce((g.config ->> 'allow_build')::boolean, true) and g.owner_id <> s.player_id then return; end if;
  if jsonb_typeof(p_blocks) <> 'array' then return; end if;
  for b in select * from jsonb_array_elements(p_blocks) loop
    n := n + 1; exit when n > 600;
    vx := (b ->> 0)::int; vy := (b ->> 1)::int; vz := (b ->> 2)::int; vk := (b ->> 3)::int;
    continue when vy < 0 or vy > 255 or abs(vx) > 5000 or abs(vz) > 5000 or vk not between -1 and 15;
    if vk < 0 then
      delete from blocks where game_id = p_game and blocks.x = vx and blocks.y = vy and blocks.z = vz;
    else
      insert into blocks (game_id, x, y, z, kind, placed_by) values (p_game, vx, vy, vz, vk, s.player_id)
      on conflict (game_id, x, y, z) do update set kind = excluded.kind, placed_by = excluded.placed_by;
    end if;
  end loop;
end $$;
grant execute on function public.place_blocks(uuid, uuid, jsonb) to anon, authenticated;

-- ---------- Mejores tiempos compartidos (obby / carreras) ----------
create table if not exists public.best_times (
  game_id    uuid not null,
  player_id  uuid not null,
  username   text not null,
  ms         int  not null check (ms between 1000 and 3600000),
  updated_at timestamptz not null default now(),
  primary key (game_id, player_id)
);
alter table public.best_times enable row level security;
drop policy if exists "read best_times" on public.best_times;
create policy "read best_times" on public.best_times for select to anon, authenticated using (true);
revoke insert, update, delete on public.best_times from anon, authenticated;
create index if not exists best_times_rank_idx on public.best_times (game_id, ms);

-- Guarda tu mejor tiempo y devuelve tu puesto (1 = el mejor)
create or replace function public.submit_time(p_secret uuid, p_game uuid, p_ms int)
returns int language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret); rank int;
begin
  if p_ms < 1000 or p_ms > 3600000 then return 0; end if;
  if not exists (select 1 from game_rules where game_id = p_game) then return 0; end if;
  insert into best_times (game_id, player_id, username, ms) values (p_game, s.player_id, s.username, p_ms)
  on conflict (game_id, player_id) do update set ms = least(best_times.ms, excluded.ms), username = excluded.username, updated_at = now();
  select count(*) + 1 into rank from best_times where game_id = p_game and ms < (select ms from best_times where game_id = p_game and player_id = s.player_id);
  return rank;
end $$;
grant execute on function public.submit_time(uuid, uuid, int) to anon, authenticated;
