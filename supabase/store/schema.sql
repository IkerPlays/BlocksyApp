-- ============================================================
-- Proyecto Supabase #3: STORE (catálogo de la tienda, objetos y lista de juegos)
-- Ejecutar en el SQL Editor del proyecto STORE. Es seguro repetirlo.
--
--  * La lista de juegos (nombre, descripción, dueño, modo, ajustes, script) vive aquí. Las posiciones, bloques y chat siguen en GAME.
--  * El catálogo de la tienda vive aquí. Las monedas (BCoins), el inventario y lo equipado siguen en AUTH, ligados a cada cuenta.
--  * Comprar: el cliente pide aquí un "presupuesto" firmado (shop_quote) y lo canjea en AUTH (shop_redeem). AUTH comprueba la firma,
--    así que nadie puede inventarse el precio. La firma usa un secreto compartido (ver el paso 2 más abajo).
--  * Escribir juegos: solo con un secret de sesión (la Edge Function game-session, desplegada también en este proyecto).
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Sesiones (igual que en GAME: las emite la Edge Function tras validar el token de AUTH) ----------
create table if not exists public.sessions (
  secret     uuid primary key default gen_random_uuid(),
  player_id  uuid not null,
  username   text not null,
  color      text not null default '#4da6ff',
  can_create boolean not null default false,
  expires_at timestamptz not null default now() + interval '12 hours'
);
create index if not exists sessions_player_idx on public.sessions (player_id);
alter table public.sessions enable row level security;          -- sin políticas: solo service_role
revoke all on public.sessions from anon, authenticated;

create or replace function public._me(p_secret uuid) returns public.sessions
language plpgsql security definer set search_path = public as $$
declare s public.sessions;
begin
  select * into s from sessions where secret = p_secret and expires_at > now();
  if not found then raise exception 'invalid session' using errcode = '28000'; end if;
  return s;
end $$;
revoke all on function public._me(uuid) from public, anon, authenticated;

-- ---------- Juegos ----------
create table if not exists public.games (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 3 and 40),
  description text not null default '' check (char_length(description) <= 200),
  owner_id    uuid not null,
  owner_name  text not null default '',
  hue         int  not null default 200,
  max_players int  not null default 20,
  mode        text not null default 'build' check (mode in ('build', 'social', 'obby', 'arena')),
  config      jsonb not null default '{}',
  script      text not null default '' check (char_length(script) <= 20000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.games enable row level security;
drop policy if exists "read games" on public.games;
create policy "read games" on public.games for select to anon, authenticated using (true);
revoke insert, update, delete on public.games from anon, authenticated;

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

create or replace function public.delete_game(p_secret uuid, p_game uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret);
begin
  if not s.can_create then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from games where id = p_game and owner_id = s.player_id;
end $$;
grant execute on function public.create_game(uuid, text, text, int, text), public.update_game(uuid, uuid, text, text, int, int, text, jsonb, text),
  public.delete_game(uuid, uuid) to anon, authenticated;

-- Juegos iniciales (mismos ids que ya tenía GAME, así los bloques existentes siguen siendo suyos)
insert into public.games (id, name, description, owner_id, owner_name, hue, mode, config) values
 ('00000000-0000-0000-0000-000000000001', 'Spawn Plaza', 'Mundo abierto para construir. ¡Empieza aquí!', '00000000-0000-0000-0000-000000000000', 'Blocksy', 205, 'build', '{}'),
 ('00000000-0000-0000-0000-000000000002', 'Plaza Social', 'Charla, emotes y música. Aquí no se construye.', '00000000-0000-0000-0000-000000000000', 'Blocksy', 285, 'social',
  '{"allow_build":false,"world":"plaza","sky":"sunset","welcome":"Bienvenido a la plaza. Usa G para los emotes."}'),
 ('00000000-0000-0000-0000-000000000003', 'Carrera de Obstáculos', 'Salta de bloque en bloque hasta la meta.', '00000000-0000-0000-0000-000000000000', 'Blocksy', 15, 'obby',
  '{"allow_build":false,"world":"obby","sky":"day","jump":9.4,"welcome":"Llega a la bandera dorada."}')
on conflict (id) do nothing;

-- ---------- Tienda ----------
create table if not exists public.shop_items (
  id          text primary key,
  kind        text not null,                       -- hat | title | crate
  name        text not null,
  description text not null default '',
  price       int  not null check (price >= 0),
  rarity      text not null default 'common',      -- common | rare | epic
  data        jsonb not null default '{}',
  active      boolean not null default true,
  sort        int not null default 0
);
alter table public.shop_items enable row level security;
drop policy if exists "read shop" on public.shop_items;
create policy "read shop" on public.shop_items for select to anon, authenticated using (active);
revoke insert, update, delete on public.shop_items from anon, authenticated;

insert into public.shop_items (id, kind, name, description, price, rarity, data, sort) values
 ('hat_cap',     'hat',   'Gorra',            'Una gorra de béisbol.',            100, 'common', '{"color":"#e74c3c"}', 10),
 ('hat_antenna', 'hat',   'Antena',           'Para captar buenas señales.',      150, 'common', '{"color":"#7ed6ff"}', 11),
 ('hat_party',   'hat',   'Gorro de fiesta',  'Siempre hay algo que celebrar.',   200, 'common', '{"color":"#ff6b9d"}', 12),
 ('hat_halo',    'hat',   'Aureola',          'Brilla un poco.',                  300, 'rare',   '{"color":"#f5c542"}', 13),
 ('hat_top',     'hat',   'Chistera',         'Elegancia en bloques.',            350, 'rare',   '{"color":"#2b2f36"}', 14),
 ('hat_crown',   'hat',   'Corona',           'Solo para la realeza.',            500, 'epic',   '{"color":"#f1c40f"}', 15),
 ('title_builder','title','Constructor',      'Título para tu perfil.',            80, 'common', '{"text":"Constructor"}', 30),
 ('title_runner', 'title','Velocista',        'Título para tu perfil.',           120, 'common', '{"text":"Velocista"}', 31),
 ('title_legend', 'title','Leyenda',          'Título para tu perfil.',           400, 'epic',   '{"text":"Leyenda"}', 32),
 ('crate_basic', 'crate', 'Cofre de botín',   'Un objeto al azar. Si ya lo tienes, recuperas parte de las BCoins.', 150, 'rare',
   '{"pool":["hat_cap","hat_antenna","hat_party","hat_halo","hat_top","hat_crown","title_builder","title_runner","title_legend"],"weights":[20,18,16,10,8,3,12,10,3],"refund":0.4}', 50)
on conflict (id) do update set name = excluded.name, description = excluded.description, price = excluded.price, rarity = excluded.rarity, data = excluded.data, sort = excluded.sort;

-- ---------- Presupuestos firmados para comprar ----------
-- PASO 2 (una sola vez): elige un secreto largo y guárdalo AQUÍ y en AUTH (auth/store-link.sql), con el MISMO valor:
--   insert into public.app_secrets (name, value) values ('shop_signing', 'pon-aqui-un-secreto-largo-y-aleatorio')
--   on conflict (name) do update set value = excluded.value;
create table if not exists public.app_secrets (name text primary key, value text not null);
alter table public.app_secrets enable row level security;       -- sin políticas: nadie desde la API
revoke all on public.app_secrets from anon, authenticated;

create or replace function public._sign(p_msg text) returns text
language sql stable security definer set search_path = public, extensions as $$
  select encode(hmac(p_msg, (select value from public.app_secrets where name = 'shop_signing'), 'sha256'), 'hex');
$$;
revoke all on function public._sign(text) from public, anon, authenticated;

-- Devuelve qué se compra (o, en un cofre, qué toca al azar) y su precio, con firma válida 3 minutos
create or replace function public.shop_quote(p_secret uuid, p_item text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.sessions := public._me(p_secret); it shop_items; pool jsonb; w jsonb; total numeric := 0; r numeric; acc numeric := 0; i int;
        pick text; k text; op text; item text; refund int := 0; exp bigint := extract(epoch from now())::bigint + 180; nonce uuid := gen_random_uuid();
begin
  if not exists (select 1 from app_secrets where name = 'shop_signing') then raise exception 'shop signing secret missing' using errcode = 'P0001'; end if;
  select * into it from shop_items where id = p_item and active;
  if not found then raise exception 'no such item' using errcode = 'P0002'; end if;
  if it.kind = 'crate' then
    op := 'crate'; pool := it.data -> 'pool'; w := it.data -> 'weights';
    for i in 0 .. jsonb_array_length(pool) - 1 loop total := total + (w ->> i)::numeric; end loop;
    r := random() * total;
    for i in 0 .. jsonb_array_length(pool) - 1 loop
      acc := acc + (w ->> i)::numeric;
      if r <= acc then pick := pool ->> i; exit; end if;
    end loop;
    item := coalesce(pick, pool ->> 0);
    select kind into k from shop_items where id = item;
    refund := floor(it.price * coalesce((it.data ->> 'refund')::numeric, 0.4));
  else
    op := 'buy'; item := it.id; k := it.kind;
  end if;
  return jsonb_build_object('op', op, 'item', item, 'kind', k, 'price', it.price, 'refund', refund, 'exp', exp, 'nonce', nonce,
    'sig', public._sign(concat_ws('|', s.player_id, op, item, k, it.price, refund, exp, nonce)));
end $$;
grant execute on function public.shop_quote(uuid, text) to anon, authenticated;
