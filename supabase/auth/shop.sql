-- ============================================================
-- AUTH: BCoins (moneda del juego), tienda, inventario y cofres de botín.
-- Ejecutar en el SQL Editor del proyecto AUTH (después de schema.sql y social.sql). Es seguro repetirlo.
-- ============================================================

alter table public.profiles add column if not exists bcoins    int  not null default 0 check (bcoins >= 0);
alter table public.profiles add column if not exists streak    int  not null default 0;
alter table public.profiles add column if not exists last_daily date;
alter table public.profiles add column if not exists equipped  jsonb not null default '{}';

-- Seguridad: el cliente solo puede cambiar estas columnas de su perfil (nunca bcoins, streak, equipped...)
revoke update on public.profiles from authenticated;
grant update (avatar_color, bio, last_seen, current_game) on public.profiles to authenticated;

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
create table if not exists public.inventory (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null references public.shop_items(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
create table if not exists public.coin_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount int not null, reason text not null, created_at timestamptz not null default now()
);
create index if not exists coin_log_user_idx on public.coin_log (user_id, created_at desc);

alter table public.shop_items enable row level security;
alter table public.inventory  enable row level security;
alter table public.coin_log   enable row level security;
drop policy if exists "read shop" on public.shop_items;
create policy "read shop" on public.shop_items for select to authenticated using (active);
drop policy if exists "read own inventory" on public.inventory;
create policy "read own inventory" on public.inventory for select to authenticated using (user_id = auth.uid());
drop policy if exists "read own log" on public.coin_log;
create policy "read own log" on public.coin_log for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.shop_items, public.inventory, public.coin_log from authenticated;
grant select on public.shop_items, public.inventory, public.coin_log to authenticated;

-- ---------- Catálogo inicial ----------
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

-- ---------- Funciones (todo el dinero pasa por aquí) ----------
create or replace function public.my_wallet() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('bcoins', bcoins, 'streak', streak, 'equipped', equipped,
         'can_claim', last_daily is distinct from (now() at time zone 'utc')::date,
         'inventory', coalesce((select jsonb_agg(item_id) from inventory where user_id = p.id), '[]'::jsonb))
  from profiles p where id = auth.uid();
$$;

-- Recompensa diaria: 50 BCoins + 10 por cada día seguido (hasta 7 días de racha)
create or replace function public.claim_daily() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles; today date := (now() at time zone 'utc')::date; st int; amt int;
begin
  select * into p from profiles where id = auth.uid() for update;
  if not found then raise exception 'no profile' using errcode = '28000'; end if;
  if p.last_daily = today then raise exception 'already claimed' using errcode = '22023'; end if;
  st := case when p.last_daily = today - 1 then p.streak + 1 else 1 end;
  amt := 50 + 10 * least(st - 1, 7);
  update profiles set bcoins = bcoins + amt, streak = st, last_daily = today where id = p.id;
  insert into coin_log (user_id, amount, reason) values (p.id, amt, 'daily');
  return jsonb_build_object('amount', amt, 'streak', st);
end $$;

-- Ganar monedas jugando (límite diario por motivo; el cliente lo pide, así que hay topes bajos)
create or replace function public.earn_coins(p_amount int, p_reason text) returns int
language plpgsql security definer set search_path = public as $$
declare cap int; got int; amt int := least(greatest(p_amount, 0), 25);
begin
  if p_reason not in ('play', 'obby', 'build') then raise exception 'bad reason' using errcode = '22023'; end if;
  cap := case p_reason when 'play' then 120 when 'obby' then 200 else 60 end;
  select coalesce(sum(amount), 0) into got from coin_log where user_id = auth.uid() and reason = p_reason and created_at > now() - interval '24 hours';
  amt := least(amt, cap - got);
  if amt <= 0 then return 0; end if;
  update profiles set bcoins = bcoins + amt where id = auth.uid();
  insert into coin_log (user_id, amount, reason) values (auth.uid(), amt, p_reason);
  return amt;
end $$;

create or replace function public.buy_item(p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare it shop_items; p profiles;
begin
  select * into it from shop_items where id = p_item and active;
  if not found then raise exception 'no such item' using errcode = 'P0002'; end if;
  if it.kind = 'crate' then raise exception 'use open_crate' using errcode = '22023'; end if;
  select * into p from profiles where id = auth.uid() for update;
  if exists (select 1 from inventory where user_id = p.id and item_id = it.id) then raise exception 'already owned' using errcode = '22023'; end if;
  if p.bcoins < it.price then raise exception 'not enough bcoins' using errcode = '22023'; end if;
  update profiles set bcoins = bcoins - it.price where id = p.id;
  insert into inventory (user_id, item_id) values (p.id, it.id);
  insert into coin_log (user_id, amount, reason) values (p.id, -it.price, 'buy:' || it.id);
  return jsonb_build_object('bcoins', p.bcoins - it.price, 'item', it.id);
end $$;

-- Cofre de botín: objeto al azar según pesos; si ya lo tienes devuelve parte del precio
create or replace function public.open_crate(p_crate text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c shop_items; p profiles; pool jsonb; w jsonb; total numeric := 0; r numeric; acc numeric := 0; i int; pick text; refund int := 0; dup boolean;
begin
  select * into c from shop_items where id = p_crate and kind = 'crate' and active;
  if not found then raise exception 'no such crate' using errcode = 'P0002'; end if;
  select * into p from profiles where id = auth.uid() for update;
  if p.bcoins < c.price then raise exception 'not enough bcoins' using errcode = '22023'; end if;
  pool := c.data -> 'pool'; w := c.data -> 'weights';
  for i in 0 .. jsonb_array_length(pool) - 1 loop total := total + (w ->> i)::numeric; end loop;
  r := random() * total;
  for i in 0 .. jsonb_array_length(pool) - 1 loop
    acc := acc + (w ->> i)::numeric;
    if r <= acc then pick := pool ->> i; exit; end if;
  end loop;
  pick := coalesce(pick, pool ->> 0);
  dup := exists (select 1 from inventory where user_id = p.id and item_id = pick);
  update profiles set bcoins = bcoins - c.price where id = p.id;
  insert into coin_log (user_id, amount, reason) values (p.id, -c.price, 'crate:' || c.id);
  if dup then
    refund := floor(c.price * coalesce((c.data ->> 'refund')::numeric, 0.4));
    update profiles set bcoins = bcoins + refund where id = p.id;
    insert into coin_log (user_id, amount, reason) values (p.id, refund, 'refund:' || pick);
  else
    insert into inventory (user_id, item_id) values (p.id, pick);
  end if;
  return jsonb_build_object('item', pick, 'duplicate', dup, 'refund', refund, 'bcoins', p.bcoins - c.price + refund);
end $$;

create or replace function public.equip_item(p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare it shop_items;
begin
  select * into it from shop_items where id = p_item;
  if not found or not exists (select 1 from inventory where user_id = auth.uid() and item_id = p_item) then raise exception 'not owned' using errcode = '42501'; end if;
  update profiles set equipped = jsonb_set(equipped, array[it.kind], to_jsonb(it.id)) where id = auth.uid();
  return (select equipped from profiles where id = auth.uid());
end $$;
create or replace function public.unequip_slot(p_kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update profiles set equipped = equipped - p_kind where id = auth.uid();
  return (select equipped from profiles where id = auth.uid());
end $$;
grant execute on function public.my_wallet(), public.claim_daily(), public.earn_coins(int, text), public.buy_item(text),
  public.open_crate(text), public.equip_item(text), public.unequip_slot(text) to authenticated;

-- El perfil público enseña el sombrero y el título equipados
create or replace function public.get_profile(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); t profiles; fr boolean; rel text := 'none'; rid bigint;
begin
  select * into t from profiles where lower(username) = lower(btrim(p_username));
  if not found then return null; end if;
  fr := exists (select 1 from friendships where user_id = me and friend_id = t.id);
  if t.id = me then rel := 'self';
  elsif fr then rel := 'friends';
  else
    select id into rid from friend_requests where from_id = me and to_id = t.id;
    if found then rel := 'pending_out';
    else select id into rid from friend_requests where from_id = t.id and to_id = me; if found then rel := 'pending_in'; end if;
    end if;
  end if;
  return jsonb_build_object('id', t.id, 'username', t.username, 'avatar_color', t.avatar_color, 'bio', t.bio, 'created_at', t.created_at,
    'relation', rel, 'request_id', rid, 'equipped', t.equipped,
    'friend_count', (select count(*) from friendships where user_id = t.id),
    'is_online', case when fr or t.id = me then t.last_seen > now() - interval '75 seconds' end,
    'current_game', case when fr or t.id = me then t.current_game end);
end $$;
grant execute on function public.get_profile(text) to authenticated;
