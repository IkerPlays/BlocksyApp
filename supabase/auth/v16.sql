-- ============================================================
-- AUTH v16: misiones semanales y temporadas con recompensas. Ejecutar en el SQL Editor de AUTH (después de extras.sql y store-link.sql). Es seguro repetirlo.
--  * Las misiones diarias siguen igual; cada acción también suma a su misión semanal (se reinicia cada lunes, UTC).
--  * Las temporadas duran 28 días (la primera empieza el 2026-10-19). Las misiones reclamadas dan puntos de temporada; cada 100 puntos = 1 nivel (10 niveles).
--  * Cada nivel da BCoins; el nivel 5 da una estela limitada y el 10 un título limitado de esa temporada. Cuando acaba la temporada ya no se pueden conseguir.
-- ============================================================

create table if not exists public.weekly_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  week date not null, key text not null, n int not null default 0, claimed boolean not null default false,
  primary key (user_id, week, key)
);
alter table public.weekly_progress enable row level security;
drop policy if exists "own weekly" on public.weekly_progress;
create policy "own weekly" on public.weekly_progress for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.weekly_progress from authenticated;
grant select on public.weekly_progress to authenticated;

create table if not exists public.season_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  season int not null, xp int not null default 0, tier_claimed int not null default 0,
  primary key (user_id, season)
);
alter table public.season_progress enable row level security;
drop policy if exists "own season" on public.season_progress;
create policy "own season" on public.season_progress for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.season_progress from authenticated;
grant select on public.season_progress to authenticated;

create or replace function public._week() returns date language sql stable as $$ select date_trunc('week', now() at time zone 'utc')::date $$;
create or replace function public._season_no() returns int language sql stable as $$
  select greatest(1, ((now() at time zone 'utc')::date - date '2026-10-19') / 28 + 1) $$;

-- Misión semanal: clave -> (objetivo, recompensa); y qué misión diaria la alimenta
create or replace function public._weekly(p_key text, out goal int, out reward int) language sql immutable as $$
  select case p_key when 'w_place_300' then 300 when 'w_play_120' then 120 when 'w_obby_5' then 5 when 'w_chat_40' then 40 when 'w_friend_3' then 3 end,
         case p_key when 'w_place_300' then 150 when 'w_play_120' then 200 when 'w_obby_5' then 250 when 'w_chat_40' then 100 when 'w_friend_3' then 120 end;
$$;
create or replace function public._weekly_of(p_key text) returns text language sql immutable as $$
  select case p_key when 'place_50' then 'w_place_300' when 'play_10' then 'w_play_120' when 'obby_win' then 'w_obby_5' when 'chat_5' then 'w_chat_40' when 'friend_1' then 'w_friend_3' end $$;

create or replace function public._season_xp(p_user uuid, p_n int) returns void language sql security definer set search_path = public as $$
  insert into season_progress (user_id, season, xp) values (p_user, public._season_no(), p_n)
  on conflict (user_id, season) do update set xp = season_progress.xp + p_n
$$;
revoke all on function public._season_xp(uuid, int) from public, anon, authenticated;

create or replace function public.mission_add(p_key text, p_add int) returns int
language plpgsql security definer set search_path = public as $$
declare g int; r int; v int; wk text; wg int;
begin
  select goal, reward into g, r from public._mission(p_key);
  if g is null then return 0; end if;
  insert into mission_progress (user_id, key, n) values (auth.uid(), p_key, 0) on conflict do nothing;
  update mission_progress set n = least(g, n + least(greatest(p_add, 0), 20)) where user_id = auth.uid() and day = (now() at time zone 'utc')::date and key = p_key returning n into v;
  wk := public._weekly_of(p_key);
  if wk is not null then
    select goal into wg from public._weekly(wk);
    insert into weekly_progress (user_id, week, key) values (auth.uid(), public._week(), wk) on conflict do nothing;
    update weekly_progress set n = least(wg, n + least(greatest(p_add, 0), 20)) where user_id = auth.uid() and week = public._week() and key = wk and not claimed;
  end if;
  return v;
end $$;

create or replace function public.mission_claim(p_key text) returns int
language plpgsql security definer set search_path = public as $$
declare g int; r int; m mission_progress;
begin
  select goal, reward into g, r from public._mission(p_key);
  select * into m from mission_progress where user_id = auth.uid() and day = (now() at time zone 'utc')::date and key = p_key for update;
  if not found or m.n < g or m.claimed then raise exception 'not ready' using errcode = '22023'; end if;
  update mission_progress set claimed = true where user_id = m.user_id and day = m.day and key = m.key;
  update profiles set bcoins = bcoins + r where id = auth.uid();
  insert into coin_log (user_id, amount, reason) values (auth.uid(), r, 'mission:' || p_key);
  perform public._season_xp(auth.uid(), 10);
  return r;
end $$;

create or replace function public.my_weekly() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ends', public._week() + 7, 'list', coalesce(jsonb_agg(jsonb_build_object('key', k, 'goal', (public._weekly(k)).goal, 'reward', (public._weekly(k)).reward,
    'n', coalesce((select n from weekly_progress where user_id = auth.uid() and week = public._week() and key = k), 0),
    'claimed', coalesce((select claimed from weekly_progress where user_id = auth.uid() and week = public._week() and key = k), false))), '[]'::jsonb))
  from unnest(array['w_place_300', 'w_play_120', 'w_obby_5', 'w_chat_40', 'w_friend_3']) as k;
$$;
create or replace function public.weekly_claim(p_key text) returns int
language plpgsql security definer set search_path = public as $$
declare g int; r int; m weekly_progress;
begin
  select goal, reward into g, r from public._weekly(p_key);
  select * into m from weekly_progress where user_id = auth.uid() and week = public._week() and key = p_key for update;
  if g is null or not found or m.n < g or m.claimed then raise exception 'not ready' using errcode = '22023'; end if;
  update weekly_progress set claimed = true where user_id = m.user_id and week = m.week and key = m.key;
  update profiles set bcoins = bcoins + r where id = auth.uid();
  insert into coin_log (user_id, amount, reason) values (auth.uid(), r, 'weekly:' || p_key);
  perform public._season_xp(auth.uid(), 60);
  return r;
end $$;

-- Temporada actual: puntos, nivel y recompensas de cada nivel
create or replace function public.season_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s int := public._season_no(); xp int := 0; tc int := 0;
begin
  select sp.xp, sp.tier_claimed into xp, tc from season_progress sp where user_id = auth.uid() and season = s;
  return jsonb_build_object('season', s, 'ends', date '2026-10-19' + s * 28, 'xp', coalesce(xp, 0), 'claimed', coalesce(tc, 0),
    'tiers', (select jsonb_agg(jsonb_build_object('tier', t, 'xp', t * 100, 'coins', 40 * t,
        'item', case t when 5 then 'season' || s || '_trail' when 10 then 'season' || s || '_title' end) order by t) from generate_series(1, 10) t));
end $$;
create or replace function public.season_claim() returns jsonb
language plpgsql security definer set search_path = public as $$
declare s int := public._season_no(); sp season_progress; t int; item text; kind text;
begin
  select * into sp from season_progress where user_id = auth.uid() and season = s for update;
  if not found then raise exception 'not ready' using errcode = '22023'; end if;
  t := sp.tier_claimed + 1;
  if t > 10 or sp.xp < t * 100 then raise exception 'not ready' using errcode = '22023'; end if;
  update season_progress set tier_claimed = t where user_id = sp.user_id and season = s;
  update profiles set bcoins = bcoins + 40 * t where id = auth.uid();
  insert into coin_log (user_id, amount, reason) values (auth.uid(), 40 * t, 'season:' || s || ':' || t);
  if t = 5 then item := 'season' || s || '_trail'; kind := 'trail'; elsif t = 10 then item := 'season' || s || '_title'; kind := 'title'; end if;
  if item is not null then insert into inventory (user_id, item_id, kind) values (auth.uid(), item, kind) on conflict do nothing; end if;
  return jsonb_build_object('tier', t, 'coins', 40 * t, 'item', item);
end $$;

grant execute on function public.mission_add(text, int), public.mission_claim(text), public.my_weekly(), public.weekly_claim(text),
  public.season_info(), public.season_claim() to authenticated;
