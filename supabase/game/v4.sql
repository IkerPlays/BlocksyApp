-- ============================================================
-- GAME v4: sombreros visibles para todos, monstruos (NPC con "anfitrión") y eventos de partida.
-- Ejecutar en el SQL Editor de GAME (después de v3.sql). Es seguro repetirlo.
-- ============================================================

-- ---------- Sombrero equipado (solo cosmético: lo envía el cliente) ----------
alter table public.player_state add column if not exists hat text not null default '';
drop function if exists public.move(uuid, uuid, real, real, real, real, text, text);
create or replace function public.move(
  p_secret uuid, p_game uuid, p_x real, p_y real, p_z real, p_ry real,
  p_anim text default 'idle', p_platform text default 'web', p_hat text default '')
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret);
begin
  if abs(p_x) > 100000 or abs(p_y) > 100000 or abs(p_z) > 100000 then return; end if;
  insert into player_state (player_id, game_id, username, color, x, y, z, ry, anim, platform, hat, updated_at)
  values (s.player_id, p_game, s.username, s.color, p_x, p_y, p_z, p_ry,
          left(p_anim, 12), case when p_platform = '3ds' then '3ds' else 'web' end, left(coalesce(p_hat, ''), 24), now())
  on conflict (player_id) do update set
    game_id = excluded.game_id, username = excluded.username, color = excluded.color,
    x = excluded.x, y = excluded.y, z = excluded.z, ry = excluded.ry,
    anim = excluded.anim, platform = excluded.platform, hat = excluded.hat, updated_at = now();
  if random() < 0.02 then
    delete from player_state where updated_at < now() - interval '30 seconds';
  end if;
end $$;
grant execute on function public.move(uuid, uuid, real, real, real, real, text, text, text) to anon, authenticated;

-- ---------- NPC (monstruos): lo mueve el "anfitrión" de la partida y todos lo ven ----------
-- El anfitrión es quien lo actualizó hace menos de 3 s; si nadie lo hace, el primero que llame pasa a serlo.
create table if not exists public.npcs (
  game_id    uuid not null,
  id         text not null,
  x real not null default 0, y real not null default 0, z real not null default 0, ry real not null default 0,
  anim       text not null default 'idle',
  host_id    uuid,
  updated_at timestamptz not null default now(),
  primary key (game_id, id)
);
alter table public.npcs enable row level security;
drop policy if exists "read npcs" on public.npcs;
create policy "read npcs" on public.npcs for select to anon, authenticated using (true);
revoke insert, update, delete on public.npcs from anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'npcs') then
    alter publication supabase_realtime add table public.npcs;
  end if;
end $$;
alter table public.npcs replica identity full;

-- Devuelve true si este jugador es (o pasa a ser) el anfitrión y su posición se guardó
create or replace function public.npc_tick(p_secret uuid, p_game uuid, p_id text, p_x real, p_y real, p_z real, p_ry real, p_anim text default 'idle')
returns boolean language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret); cur public.npcs;
begin
  if abs(p_x) > 5000 or abs(p_z) > 5000 or abs(p_y) > 500 then return false; end if;
  select * into cur from npcs where game_id = p_game and id = p_id for update;
  if found and cur.host_id <> s.player_id and cur.updated_at > now() - interval '3 seconds' then return false; end if;
  insert into npcs (game_id, id, x, y, z, ry, anim, host_id, updated_at) values (p_game, left(p_id, 24), p_x, p_y, p_z, p_ry, left(p_anim, 12), s.player_id, now())
  on conflict (game_id, id) do update set x = excluded.x, y = excluded.y, z = excluded.z, ry = excluded.ry, anim = excluded.anim, host_id = excluded.host_id, updated_at = now();
  return true;
end $$;
create or replace function public.npc_release(p_secret uuid, p_game uuid, p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret);
begin delete from npcs where game_id = p_game and id = p_id and host_id = s.player_id; end $$;

-- ---------- Eventos de partida (recoger objetos, ser atrapado, ganar...) ----------
-- Se guardan como interacciones; los clientes los leen igual que el chat.
create or replace function public.game_event(p_secret uuid, p_game uuid, p_kind text, p_payload jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret);
begin
  if p_kind not in ('orb', 'caught', 'win', 'round', 'light') then return; end if;
  insert into interactions (game_id, player_id, username, kind, payload) values (p_game, s.player_id, s.username, p_kind, coalesce(p_payload, '{}'));
  if random() < 0.05 then delete from interactions where kind in ('orb', 'caught', 'win', 'round', 'light') and created_at < now() - interval '1 day'; end if;
end $$;
grant execute on function public.npc_tick(uuid, uuid, text, real, real, real, real, text), public.npc_release(uuid, uuid, text),
  public.game_event(uuid, uuid, text, jsonb) to anon, authenticated;

-- Reglas del juego inicial nuevo (el juego en sí se crea en STORE: store/forest.sql)
insert into public.game_rules (game_id, owner_id, mode, config) values
 ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'arena', '{"allow_build":false}')
on conflict (game_id) do nothing;
