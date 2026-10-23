-- ============================================================
-- AUTH: enlaza con el proyecto STORE (catálogo y juegos). Ejecutar en el SQL Editor de AUTH después de shop.sql. Es seguro repetirlo.
-- Las monedas, el inventario y lo equipado siguen aquí; el catálogo y los precios los decide STORE y llegan firmados (shop_redeem).
-- ============================================================
create extension if not exists pgcrypto;

-- PASO 2 (una sola vez): el MISMO secreto que pusiste en STORE
--   insert into public.app_secrets (name, value) values ('shop_signing', 'pon-aqui-un-secreto-largo-y-aleatorio')
--   on conflict (name) do update set value = excluded.value;
create table if not exists public.app_secrets (name text primary key, value text not null);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

-- El inventario ya no depende del catálogo local: guarda el tipo del objeto
alter table public.inventory add column if not exists kind text;
alter table public.inventory drop constraint if exists inventory_item_id_fkey;
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'shop_items') then
    update public.inventory i set kind = s.kind from public.shop_items s where s.id = i.item_id and i.kind is null;
  end if;
end $$;

create table if not exists public.used_quotes (nonce uuid primary key, user_id uuid not null, created_at timestamptz not null default now());
alter table public.used_quotes enable row level security;
revoke all on public.used_quotes from anon, authenticated;

create or replace function public.shop_redeem(p_op text, p_item text, p_kind text, p_price int, p_refund int, p_exp bigint, p_nonce uuid, p_sig text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare p profiles; secret text; expect text; dup boolean := false; refund int := 0;
begin
  select value into secret from app_secrets where name = 'shop_signing';
  if secret is null then raise exception 'shop signing secret missing' using errcode = 'P0001'; end if;
  if p_op not in ('buy', 'crate') or p_price < 0 or p_refund < 0 or p_refund > p_price then raise exception 'bad quote' using errcode = '22023'; end if;
  expect := encode(hmac(concat_ws('|', auth.uid(), p_op, p_item, p_kind, p_price, p_refund, p_exp, p_nonce), secret, 'sha256'), 'hex');
  if expect is distinct from p_sig then raise exception 'bad signature' using errcode = '42501'; end if;
  if extract(epoch from now()) > p_exp then raise exception 'quote expired' using errcode = '22023'; end if;
  begin insert into used_quotes (nonce, user_id) values (p_nonce, auth.uid()); exception when unique_violation then raise exception 'quote already used' using errcode = '22023'; end;
  select * into p from profiles where id = auth.uid() for update;
  dup := exists (select 1 from inventory where user_id = p.id and item_id = p_item);
  if p_op = 'buy' and dup then raise exception 'already owned' using errcode = '22023'; end if;
  if p.bcoins < p_price then raise exception 'not enough bcoins' using errcode = '22023'; end if;
  update profiles set bcoins = bcoins - p_price where id = p.id;
  insert into coin_log (user_id, amount, reason) values (p.id, -p_price, p_op || ':' || p_item);
  if dup then
    refund := p_refund;
    update profiles set bcoins = bcoins + refund where id = p.id;
    insert into coin_log (user_id, amount, reason) values (p.id, refund, 'refund:' || p_item);
  else
    insert into inventory (user_id, item_id, kind) values (p.id, p_item, p_kind);
  end if;
  delete from used_quotes where created_at < now() - interval '1 day';
  return jsonb_build_object('item', p_item, 'duplicate', dup, 'refund', refund, 'bcoins', p.bcoins - p_price + refund);
end $$;
grant execute on function public.shop_redeem(text, text, text, int, int, bigint, uuid, text) to authenticated;

-- Equipar usa el tipo guardado en el inventario
create or replace function public.equip_item(p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  select kind into k from inventory where user_id = auth.uid() and item_id = p_item;
  if not found or k is null then raise exception 'not owned' using errcode = '42501'; end if;
  update profiles set equipped = jsonb_set(equipped, array[k], to_jsonb(p_item)) where id = auth.uid();
  return (select equipped from profiles where id = auth.uid());
end $$;
grant execute on function public.equip_item(text) to authenticated;
