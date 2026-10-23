-- AUTH v12: tiempo jugado, insignias, ultima conexion y juegos favoritos. Ejecutar despues de social.sql y shop.sql. Seguro de repetir.
alter table public.profiles add column if not exists play_seconds bigint not null default 0;
revoke update (play_seconds) on public.profiles from anon, authenticated;

-- El cliente suma el tiempo que lleva jugando (maximo 2 minutos por llamada)
create or replace function public.add_playtime(p_seconds int) returns void
language sql security definer set search_path = public as $$
  update public.profiles set play_seconds = play_seconds + least(greatest(p_seconds, 0), 120) where id = auth.uid();
$$;
grant execute on function public.add_playtime(int) to authenticated;

-- Datos extra del perfil. La ultima conexion solo la ven el propio usuario y sus amigos.
create or replace function public.profile_extra(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.profiles; fr boolean; nf int; ni int; b jsonb := '[]';
begin
  select * into t from profiles where lower(username) = lower(btrim(p_username));
  if not found then return null; end if;
  fr := t.id = me or exists (select 1 from friendships where user_id = me and friend_id = t.id);
  select count(*) into nf from friendships where user_id = t.id;
  select count(*) into ni from inventory where user_id = t.id;
  if t.created_at < '2027-01-01' then b := b || '"pioneer"'; end if;
  if t.play_seconds >= 3600 then b := b || '"regular"'; end if;
  if t.play_seconds >= 36000 then b := b || '"veteran"'; end if;
  if nf >= 5 then b := b || '"social"'; end if;
  if ni >= 5 then b := b || '"collector"'; end if;
  if t.bcoins >= 1000 then b := b || '"rich"'; end if;
  return jsonb_build_object('play_seconds', t.play_seconds, 'badges', b, 'last_seen', case when fr then t.last_seen end);
end $$;
grant execute on function public.profile_extra(text) to authenticated;

-- Favoritos
create table if not exists public.favorites (user_id uuid not null references public.profiles(id) on delete cascade, game_id uuid not null, created_at timestamptz not null default now(), primary key (user_id, game_id));
alter table public.favorites enable row level security;
drop policy if exists "own favorites" on public.favorites;
create policy "own favorites" on public.favorites for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.favorites from anon, authenticated;
create or replace function public.toggle_favorite(p_game uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from favorites where user_id = auth.uid() and game_id = p_game) then delete from favorites where user_id = auth.uid() and game_id = p_game; return false; end if;
  if (select count(*) from favorites where user_id = auth.uid()) >= 60 then raise exception 'too many favorites' using errcode = '22023'; end if;
  insert into favorites (user_id, game_id) values (auth.uid(), p_game); return true;
end $$;
create or replace function public.my_favorites() returns setof uuid language sql stable security definer set search_path = public as $$
  select game_id from favorites where user_id = auth.uid() order by created_at desc;
$$;
grant execute on function public.toggle_favorite(uuid), public.my_favorites() to authenticated;
