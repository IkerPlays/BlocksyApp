-- AUTH 1.4: instalador unico (v15 + v16 + v17 + v18 + v19). Pegalo entero en el SQL Editor del proyecto AUTH de Blocksy y pulsa Run.
-- Cada parte es segura de repetir. NO lo ejecutes en otro proyecto: modifica profiles y crea tablas de clanes, quedadas y moderacion.

-- ========== v15 ==========
-- AUTH v15: ranking de BCoins. Seguro de repetir.
-- Solo expone el nombre, el color y el saldo de los 50 jugadores con más BCoins.
create or replace function public.bcoin_leaderboard(p_limit int default 25)
returns table (username text, avatar_color text, bcoins int)
language sql stable security definer set search_path = public as $$
  select p.username, p.avatar_color, p.bcoins from profiles p
  where p.bcoins > 0 order by p.bcoins desc, p.username limit least(greatest(p_limit, 1), 50);
$$;
grant execute on function public.bcoin_leaderboard(int) to authenticated;

-- ========== v16 ==========
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

-- ========== v17 ==========
-- ============================================================
-- AUTH v17: clanes con chat y juegos compartidos, quedadas con fecha, y mensajes con imagen o voz. Ejecutar en el SQL Editor de AUTH
-- (después de social.sql). Es seguro repetirlo.
-- ============================================================

-- ---------- Mensajes privados con imagen o voz ----------
-- Los archivos van a un bucket privado (dm-media). El mensaje guarda "[img]ruta" o "[voice]segundos|ruta".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dm-media', 'dm-media', false, 3145728, array['image/jpeg', 'audio/webm', 'audio/ogg', 'audio/mp4'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types, public = false;

drop policy if exists "dm-media upload own folder" on storage.objects;
create policy "dm-media upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'dm-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "dm-media read own or received" on storage.objects;
create policy "dm-media read own or received" on storage.objects for select to authenticated
  using (bucket_id = 'dm-media' and ((storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.messages m where m.to_id = auth.uid() and m.body like '%' || storage.objects.name)));
drop policy if exists "dm-media delete own" on storage.objects;
create policy "dm-media delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'dm-media' and (storage.foldername(name))[1] = auth.uid()::text);

alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check check (char_length(body) between 1 and 500);
create or replace function public.send_media(p_to uuid, p_kind text, p_path text, p_secs int default 0) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('img', 'voice') then raise exception 'bad kind' using errcode = '22023'; end if;
  if split_part(p_path, '/', 1) <> auth.uid()::text or p_path !~ '^[0-9a-f-]{36}/[0-9a-zA-Z_.-]{1,60}$' then raise exception 'bad path' using errcode = '22023'; end if;
  if not exists (select 1 from friendships where user_id = auth.uid() and friend_id = p_to) then raise exception 'not friends' using errcode = '42501'; end if;
  insert into messages (from_id, to_id, body)
  values (auth.uid(), p_to, case p_kind when 'img' then '[img]' || p_path else '[voice]' || least(greatest(coalesce(p_secs, 0), 0), 120) || '|' || p_path end);
end $$;
grant execute on function public.send_media(uuid, text, text, int) to authenticated;

-- ---------- Clanes ----------
create table if not exists public.clans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 3 and 20),
  tag text not null check (tag ~ '^[A-Za-z0-9]{2,5}$'),
  description text not null default '' check (char_length(description) <= 200),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.clan_members (
  clan_id uuid not null references public.clans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (clan_id, user_id)
);
create unique index if not exists clan_one_per_user on public.clan_members (user_id);
create table if not exists public.clan_messages (
  id bigint generated always as identity primary key,
  clan_id uuid not null references public.clans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists clan_messages_idx on public.clan_messages (clan_id, id desc);
create table if not exists public.clan_games (
  clan_id uuid not null references public.clans(id) on delete cascade,
  game_id uuid not null, game_name text not null check (char_length(game_name) <= 60),
  added_by uuid not null references auth.users(id) on delete cascade, added_at timestamptz not null default now(),
  primary key (clan_id, game_id)
);

create or replace function public._my_clan() returns uuid language sql stable security definer set search_path = public as $$
  select clan_id from clan_members where user_id = auth.uid() $$;
revoke all on function public._my_clan() from public, anon;
grant execute on function public._my_clan() to authenticated;

alter table public.clans enable row level security; alter table public.clan_members enable row level security;
alter table public.clan_messages enable row level security; alter table public.clan_games enable row level security;
drop policy if exists "clans readable" on public.clans; create policy "clans readable" on public.clans for select to authenticated using (true);
drop policy if exists "members of my clan" on public.clan_members; create policy "members of my clan" on public.clan_members for select to authenticated using (clan_id = public._my_clan());
drop policy if exists "messages of my clan" on public.clan_messages; create policy "messages of my clan" on public.clan_messages for select to authenticated using (clan_id = public._my_clan());
drop policy if exists "games of my clan" on public.clan_games; create policy "games of my clan" on public.clan_games for select to authenticated using (clan_id = public._my_clan());
revoke insert, update, delete on public.clans, public.clan_members, public.clan_messages, public.clan_games from authenticated;
grant select on public.clans, public.clan_members, public.clan_messages, public.clan_games to authenticated;

create or replace function public.create_clan(p_name text, p_tag text, p_desc text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if public._my_clan() is not null then raise exception 'already in a clan' using errcode = '22023'; end if;
  insert into clans (name, tag, description, owner_id) values (btrim(p_name), btrim(p_tag), left(coalesce(p_desc, ''), 200), auth.uid()) returning id into cid;
  insert into clan_members (clan_id, user_id, role) values (cid, auth.uid(), 'owner');
  return cid;
exception when unique_violation then raise exception 'name taken' using errcode = '23505';
end $$;
create or replace function public.join_clan(p_clan uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public._my_clan() is not null then raise exception 'already in a clan' using errcode = '22023'; end if;
  if (select count(*) from clan_members where clan_id = p_clan) >= 30 then raise exception 'clan full' using errcode = '22023'; end if;
  if not exists (select 1 from clans where id = p_clan) then raise exception 'no such clan' using errcode = 'P0002'; end if;
  insert into clan_members (clan_id, user_id) values (p_clan, auth.uid());
end $$;
-- Salir; si sale el dueño, el clan pasa al miembro más antiguo o se borra si queda vacío
create or replace function public.leave_clan() returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid := public._my_clan(); nxt uuid;
begin
  if cid is null then return; end if;
  delete from clan_members where user_id = auth.uid();
  select user_id into nxt from clan_members where clan_id = cid order by joined_at limit 1;
  if nxt is null then delete from clans where id = cid;
  elsif (select owner_id from clans where id = cid) = auth.uid() then update clans set owner_id = nxt where id = cid; update clan_members set role = 'owner' where clan_id = cid and user_id = nxt; end if;
end $$;
create or replace function public.kick_member(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid := public._my_clan();
begin
  if cid is null or (select owner_id from clans where id = cid) <> auth.uid() or p_user = auth.uid() then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from clan_members where clan_id = cid and user_id = p_user;
end $$;
create or replace function public.clan_send(p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid := public._my_clan(); b text := left(btrim(coalesce(p_body, '')), 300);
begin
  if cid is null or b = '' then return; end if;
  if (select count(*) from clan_messages where user_id = auth.uid() and created_at > now() - interval '10 seconds') >= 6 then raise exception 'slow down' using errcode = '22023'; end if;
  insert into clan_messages (clan_id, user_id, body) values (cid, auth.uid(), b);
  delete from clan_messages where clan_id = cid and id < (select coalesce(max(id), 0) - 300 from clan_messages where clan_id = cid);
end $$;
create or replace function public.clan_add_game(p_game uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid := public._my_clan();
begin
  if cid is null then raise exception 'no clan' using errcode = '42501'; end if;
  if (select count(*) from clan_games where clan_id = cid) >= 12 then raise exception 'too many games' using errcode = '22023'; end if;
  insert into clan_games (clan_id, game_id, game_name, added_by) values (cid, p_game, left(btrim(p_name), 60), auth.uid())
  on conflict (clan_id, game_id) do update set game_name = excluded.game_name;
end $$;
create or replace function public.clan_remove_game(p_game uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid := public._my_clan();
begin
  if cid is null then return; end if;
  delete from clan_games where clan_id = cid and game_id = p_game and (added_by = auth.uid() or (select owner_id from clans where id = cid) = auth.uid());
end $$;
-- Mi clan con miembros (nombre y color) y juegos
create or replace function public.my_clan() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'tag', c.tag, 'description', c.description, 'owner_id', c.owner_id,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'avatar_color', p.avatar_color, 'role', m.role, 'is_online', coalesce(pp.is_online, false)) order by m.joined_at), '[]'::jsonb)
      from clan_members m join profiles p on p.id = m.user_id left join profiles_public pp on pp.id = p.id where m.clan_id = c.id),
    'games', (select coalesce(jsonb_agg(jsonb_build_object('game_id', g.game_id, 'name', g.game_name) order by g.added_at), '[]'::jsonb) from clan_games g where g.clan_id = c.id))
  from clans c where c.id = public._my_clan();
$$;
create or replace function public.list_clans(p_search text default '') returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select jsonb_build_object('id', c.id, 'name', c.name, 'tag', c.tag, 'description', c.description, 'members', (select count(*) from clan_members m where m.clan_id = c.id)) x
    from clans c where p_search = '' or c.name ilike '%' || replace(replace(p_search, '%', ''), '_', '') || '%' order by c.created_at desc limit 30) s;
$$;
grant execute on function public.create_clan(text, text, text), public.join_clan(uuid), public.leave_clan(), public.kick_member(uuid), public.clan_send(text),
  public.clan_add_game(uuid, text), public.clan_remove_game(uuid), public.my_clan(), public.list_clans(text) to authenticated;

-- ---------- Quedadas (eventos con fecha) ----------
create table if not exists public.meetups (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 40),
  game_id uuid, game_name text not null default '' check (char_length(game_name) <= 60),
  starts_at timestamptz not null,
  clan_id uuid references public.clans(id) on delete cascade,        -- si tiene clan, solo lo ve ese clan
  created_at timestamptz not null default now()
);
create table if not exists public.meetup_rsvps (
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (meetup_id, user_id)
);
alter table public.meetups enable row level security; alter table public.meetup_rsvps enable row level security;
revoke insert, update, delete on public.meetups, public.meetup_rsvps from authenticated;
drop policy if exists "see meetups" on public.meetups;
create policy "see meetups" on public.meetups for select to authenticated using (clan_id is null or clan_id = public._my_clan());
drop policy if exists "own rsvps" on public.meetup_rsvps;
create policy "own rsvps" on public.meetup_rsvps for select to authenticated using (user_id = auth.uid());
grant select on public.meetups, public.meetup_rsvps to authenticated;

create or replace function public.create_meetup(p_title text, p_game uuid, p_game_name text, p_starts timestamptz, p_clan_only boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  if p_starts < now() + interval '5 minutes' or p_starts > now() + interval '60 days' then raise exception 'bad date' using errcode = '22023'; end if;
  if (select count(*) from meetups where host_id = auth.uid() and starts_at > now()) >= 5 then raise exception 'too many meetups' using errcode = '22023'; end if;
  if p_clan_only and public._my_clan() is null then raise exception 'no clan' using errcode = '42501'; end if;
  insert into meetups (host_id, title, game_id, game_name, starts_at, clan_id)
  values (auth.uid(), btrim(p_title), p_game, left(coalesce(p_game_name, ''), 60), p_starts, case when p_clan_only then public._my_clan() end) returning id into mid;
  insert into meetup_rsvps (meetup_id, user_id) values (mid, auth.uid());
  return mid;
end $$;
create or replace function public.rsvp_meetup(p_id uuid, p_going boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from meetups where id = p_id and (clan_id is null or clan_id = public._my_clan())) then raise exception 'no such meetup' using errcode = 'P0002'; end if;
  if p_going then insert into meetup_rsvps (meetup_id, user_id) values (p_id, auth.uid()) on conflict do nothing;
  else delete from meetup_rsvps where meetup_id = p_id and user_id = auth.uid(); end if;
end $$;
create or replace function public.cancel_meetup(p_id uuid) returns void
language sql security definer set search_path = public as $$ delete from meetups where id = p_id and host_id = auth.uid() $$;
-- Próximas quedadas (las de las últimas 2 horas siguen visibles) con asistentes y si voy
create or replace function public.list_meetups() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title, 'game_id', m.game_id, 'game_name', m.game_name, 'starts_at', m.starts_at, 'clan', m.clan_id is not null,
    'host', p.username, 'mine', m.host_id = auth.uid(),
    'going', (select count(*) from meetup_rsvps r where r.meetup_id = m.id),
    'me', exists (select 1 from meetup_rsvps r where r.meetup_id = m.id and r.user_id = auth.uid())) order by m.starts_at), '[]'::jsonb)
  from meetups m join profiles p on p.id = m.host_id
  where m.starts_at > now() - interval '2 hours' and (m.clan_id is null or m.clan_id = public._my_clan());
$$;
grant execute on function public.create_meetup(text, uuid, text, timestamptz, boolean), public.rsvp_meetup(uuid, boolean), public.cancel_meetup(uuid), public.list_meetups() to authenticated;

-- Tiempo real para el chat del clan
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clan_messages') then
    alter publication supabase_realtime add table public.clan_messages;
  end if;
end $$;

-- ========== v18 ==========
-- ============================================================
-- AUTH v18: moderación en el servidor y contador de visitas. Ejecutar en el SQL Editor de AUTH (después de extras.sql, social.sql y v17.sql).
-- Es seguro repetirlo.
--
-- PASO 2 (una vez): hazte administrador con tu nombre de usuario (y a quien quieras moderador):
--   insert into public.staff (user_id, role) select id, 'admin' from public.profiles where lower(username) = lower('TuNombre') on conflict (user_id) do update set role = excluded.role;
-- Después aparece "Moderación" en el menú. Los baneos se aplican en el servidor: mensajes, chat de clan, solicitudes de amistad, quedadas, clanes y,
-- con la Edge Function game-session actualizada, también las sesiones de juego.
-- ============================================================

create table if not exists public.staff (user_id uuid primary key references auth.users(id) on delete cascade, role text not null default 'mod' check (role in ('admin', 'mod')));
alter table public.staff enable row level security;
revoke all on public.staff from anon, authenticated;
create or replace function public.is_staff() returns text language sql stable security definer set search_path = public as $$ select role from staff where user_id = auth.uid() $$;
grant execute on function public.is_staff() to authenticated;

-- Las denuncias ahora tienen estado y tipo
alter table public.reports add column if not exists status text not null default 'open';
alter table public.reports add column if not exists kind text not null default 'user';
alter table public.reports add column if not exists ref text;
alter table public.reports add column if not exists handled_by uuid;
alter table public.reports add column if not exists handled_at timestamptz;
alter table public.reports add column if not exists note text;
create index if not exists reports_status_idx on public.reports (status, id desc);

create table if not exists public.bans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  until timestamptz, reason text not null default '', by_id uuid, created_at timestamptz not null default now()
);
alter table public.bans enable row level security; revoke all on public.bans from anon, authenticated;
create table if not exists public.blocked_content (
  kind text not null, ref text not null, reason text not null default '', by_id uuid, created_at timestamptz not null default now(), primary key (kind, ref)
);
alter table public.blocked_content enable row level security; revoke all on public.blocked_content from anon, authenticated;
create table if not exists public.mod_log (
  id bigint generated always as identity primary key, by_id uuid not null, action text not null, target text not null default '', detail text not null default '', created_at timestamptz not null default now()
);
alter table public.mod_log enable row level security; revoke all on public.mod_log from anon, authenticated;

create or replace function public._banned(p uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from bans where user_id = p and (until is null or until > now())) $$;
revoke all on function public._banned(uuid) from public, anon, authenticated;

-- Quien está baneado no puede escribir en ningún sitio (se comprueba en la propia tabla, así que no se puede saltar)
create or replace function public._ban_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public._banned((to_jsonb(NEW) ->> TG_ARGV[0])::uuid) then raise exception 'banned' using errcode = '42501'; end if;
  return NEW;
end $$;
do $$ declare r record; begin
  for r in select * from (values ('messages', 'from_id'), ('clan_messages', 'user_id'), ('friend_requests', 'from_id'), ('meetups', 'host_id'), ('clans', 'owner_id')) v(tbl, col) loop
    if to_regclass('public.' || r.tbl) is not null then
      execute format('drop trigger if exists ban_guard on public.%I', r.tbl);
      execute format('create trigger ban_guard before insert on public.%I for each row execute function public._ban_guard(%L)', r.tbl, r.col);
    end if;
  end loop;
end $$;

create or replace function public.my_ban() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('until', until, 'reason', reason) from bans where user_id = auth.uid() and (until is null or until > now()) $$;
grant execute on function public.my_ban() to authenticated;

-- Denunciar un mensaje privado recibido (se guarda su texto tal cual para poder revisarlo aunque se borre)
create or replace function public.report_message(p_id bigint, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare m messages;
begin
  select * into m from messages where id = p_id and to_id = auth.uid();
  if not found then raise exception 'no such message' using errcode = 'P0002'; end if;
  if p_reason not in ('spam', 'abuse', 'cheating', 'inappropriate', 'other') then raise exception 'bad reason' using errcode = '22023'; end if;
  if (select count(*) from reports where reporter_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then raise exception 'too many reports' using errcode = '22023'; end if;
  insert into reports (reporter_id, target_id, target_name, reason, details, kind, ref) values (auth.uid(), m.from_id, public._uname(m.from_id), p_reason, m.body, 'message', p_id::text);
end $$;
grant execute on function public.report_message(bigint, text) to authenticated;

-- ---------- Panel del equipo ----------
create or replace function public._need_staff() returns text language plpgsql stable security definer set search_path = public as $$
declare r text := public.is_staff();
begin if r is null then raise exception 'not allowed' using errcode = '42501'; end if; return r; end $$;
revoke all on function public._need_staff() from public, anon, authenticated;

create or replace function public.mod_reports(p_status text default 'open', p_limit int default 60) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._need_staff();
  return (select coalesce(jsonb_agg(x order by rid desc), '[]'::jsonb) from (
    select r.id as rid, jsonb_build_object('id', r.id, 'status', r.status, 'kind', r.kind, 'ref', r.ref, 'reason', r.reason, 'details', r.details, 'note', r.note, 'created_at', r.created_at,
      'target_id', r.target_id, 'target', r.target_name, 'reporter', public._uname(r.reporter_id), 'banned', public._banned(r.target_id),
      'reports_on_target', (select count(*) from reports q where q.target_id = r.target_id)) as x
    from reports r where p_status = 'all' or r.status = p_status order by r.id desc limit least(greatest(p_limit, 1), 200)) s);
end $$;
create or replace function public.mod_resolve(p_id bigint, p_status text, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._need_staff();
  if p_status not in ('open', 'resolved', 'dismissed') then raise exception 'bad status' using errcode = '22023'; end if;
  update reports set status = p_status, handled_by = auth.uid(), handled_at = now(), note = left(coalesce(p_note, ''), 300) where id = p_id;
  insert into mod_log (by_id, action, target, detail) values (auth.uid(), 'report_' || p_status, p_id::text, left(coalesce(p_note, ''), 200));
end $$;
create or replace function public.mod_ban(p_username text, p_days int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare t profiles;
begin
  perform public._need_staff();
  select * into t from profiles where lower(username) = lower(btrim(p_username));
  if not found then raise exception 'user not found' using errcode = 'P0002'; end if;
  if exists (select 1 from staff where user_id = t.id) then raise exception 'cannot ban staff' using errcode = '42501'; end if;
  insert into bans (user_id, until, reason, by_id) values (t.id, case when p_days is null or p_days <= 0 then null else now() + make_interval(days => least(p_days, 3650)) end, left(coalesce(p_reason, ''), 200), auth.uid())
  on conflict (user_id) do update set until = excluded.until, reason = excluded.reason, by_id = excluded.by_id, created_at = now();
  insert into mod_log (by_id, action, target, detail) values (auth.uid(), 'ban', t.username, coalesce(p_days::text, 'permanent') || ' · ' || left(coalesce(p_reason, ''), 150));
end $$;
create or replace function public.mod_unban(p_username text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._need_staff();
  delete from bans where user_id = (select id from profiles where lower(username) = lower(btrim(p_username)));
  insert into mod_log (by_id, action, target) values (auth.uid(), 'unban', btrim(p_username));
end $$;
create or replace function public.mod_warn(p_username text, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  perform public._need_staff();
  select id into t from profiles where lower(username) = lower(btrim(p_username));
  if t is null then raise exception 'user not found' using errcode = 'P0002'; end if;
  insert into notifications (user_id, kind, from_id, from_name, payload) values (t, 'warning', auth.uid(), 'Blocksy', jsonb_build_object('text', left(coalesce(p_text, ''), 200)));
  insert into mod_log (by_id, action, target, detail) values (auth.uid(), 'warn', btrim(p_username), left(coalesce(p_text, ''), 150));
end $$;
create or replace function public.mod_user(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t profiles;
begin
  perform public._need_staff();
  select * into t from profiles where lower(username) = lower(btrim(p_username));
  if not found then return null; end if;
  return jsonb_build_object('id', t.id, 'username', t.username, 'created_at', t.created_at, 'staff', (select role from staff where user_id = t.id),
    'ban', (select jsonb_build_object('until', until, 'reason', reason) from bans where user_id = t.id and (until is null or until > now())),
    'reports_open', (select count(*) from reports where target_id = t.id and status = 'open'), 'reports_total', (select count(*) from reports where target_id = t.id));
end $$;
create or replace function public.mod_delete_message(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._need_staff();
  delete from messages where id = p_id;
  insert into mod_log (by_id, action, target) values (auth.uid(), 'delete_message', p_id::text);
end $$;
create or replace function public.mod_block_content(p_kind text, p_ref text, p_reason text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._need_staff();
  if p_kind <> 'game' then raise exception 'bad kind' using errcode = '22023'; end if;
  insert into blocked_content (kind, ref, reason, by_id) values (p_kind, btrim(p_ref), left(coalesce(p_reason, ''), 200), auth.uid())
  on conflict (kind, ref) do update set reason = excluded.reason, by_id = excluded.by_id, created_at = now();
  insert into mod_log (by_id, action, target, detail) values (auth.uid(), 'block_' || p_kind, btrim(p_ref), left(coalesce(p_reason, ''), 150));
end $$;
create or replace function public.mod_unblock_content(p_kind text, p_ref text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._need_staff();
  delete from blocked_content where kind = p_kind and ref = btrim(p_ref);
  insert into mod_log (by_id, action, target) values (auth.uid(), 'unblock_' || p_kind, btrim(p_ref));
end $$;
create or replace function public.mod_log_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._need_staff();
  return (select coalesce(jsonb_agg(jsonb_build_object('at', l.created_at, 'by', public._uname(l.by_id), 'action', l.action, 'target', l.target, 'detail', l.detail) order by l.id desc), '[]'::jsonb) from (select * from mod_log order by id desc limit 60) l);
end $$;
create or replace function public.mod_blocked_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._need_staff();
  return (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'ref', ref, 'reason', reason, 'at', created_at) order by created_at desc), '[]'::jsonb) from blocked_content);
end $$;
-- Lista pública de contenido bloqueado: los clientes lo esconden (juegos)
create or replace function public.blocked_content() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(ref), '[]'::jsonb) from blocked_content where kind = 'game' $$;
grant execute on function public.blocked_content() to anon, authenticated;
grant execute on function public.mod_reports(text, int), public.mod_resolve(bigint, text, text), public.mod_ban(text, int, text), public.mod_unban(text), public.mod_warn(text, text),
  public.mod_user(text), public.mod_delete_message(bigint), public.mod_block_content(text, text, text), public.mod_unblock_content(text, text), public.mod_log_list(), public.mod_blocked_list() to authenticated;

-- El equipo puede abrir las imágenes y notas de voz de mensajes denunciados
drop policy if exists "dm-media staff read reported" on storage.objects;
create policy "dm-media staff read reported" on storage.objects for select to authenticated
  using (bucket_id = 'dm-media' and exists (select 1 from public.staff where user_id = auth.uid())
    and exists (select 1 from public.reports r where r.kind = 'message' and r.details like '%' || storage.objects.name));

-- ---------- Contador de visitas ----------
-- Una visita = entrar a un juego. La misma persona cuenta una vez cada 10 minutos (no se infla recargando la página).
create table if not exists public.game_stats (game_id uuid primary key, visits bigint not null default 0);
create table if not exists public.game_visitors (game_id uuid not null, user_id uuid not null references auth.users(id) on delete cascade, last_at timestamptz not null default now(), primary key (game_id, user_id));
alter table public.game_stats enable row level security; alter table public.game_visitors enable row level security;
revoke all on public.game_stats, public.game_visitors from anon, authenticated;
create or replace function public.game_visit(p_game uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare prev timestamptz; total bigint;
begin
  if auth.uid() is null or public._banned(auth.uid()) then return 0; end if;
  select last_at into prev from game_visitors where game_id = p_game and user_id = auth.uid();
  insert into game_visitors (game_id, user_id) values (p_game, auth.uid()) on conflict (game_id, user_id) do update set last_at = now();
  if prev is null or prev < now() - interval '10 minutes' then
    insert into game_stats (game_id, visits) values (p_game, 1) on conflict (game_id) do update set visits = game_stats.visits + 1 returning visits into total;
  else select visits into total from game_stats where game_id = p_game; end if;
  return coalesce(total, 0);
end $$;
create or replace function public.game_visit_counts() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(game_id, visits), '{}'::jsonb) from game_stats $$;
grant execute on function public.game_visit(uuid) to authenticated;
grant execute on function public.game_visit_counts() to anon, authenticated;

-- ========== v19 ==========
-- ============================================================
-- AUTH v19: denunciar mensajes del chat de clan y que el equipo pueda borrarlos. Ejecutar en el SQL Editor de AUTH (después de v17.sql y v18.sql).
-- Es seguro repetirlo.
-- ============================================================
create or replace function public.report_clan_message(p_id bigint, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare m clan_messages;
begin
  select * into m from clan_messages where id = p_id and clan_id = public._my_clan();
  if not found then raise exception 'no such message' using errcode = 'P0002'; end if;
  if m.user_id = auth.uid() then raise exception 'own message' using errcode = '22023'; end if;
  if p_reason not in ('spam', 'abuse', 'cheating', 'inappropriate', 'other') then raise exception 'bad reason' using errcode = '22023'; end if;
  if (select count(*) from reports where reporter_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then raise exception 'too many reports' using errcode = '22023'; end if;
  insert into reports (reporter_id, target_id, target_name, reason, details, kind, ref) values (auth.uid(), m.user_id, public._uname(m.user_id), p_reason, m.body, 'clanmsg', p_id::text);
end $$;
create or replace function public.mod_delete_clan_message(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._need_staff();
  delete from clan_messages where id = p_id;
  insert into mod_log (by_id, action, target) values (auth.uid(), 'delete_clan_message', p_id::text);
end $$;
grant execute on function public.report_clan_message(bigint, text), public.mod_delete_clan_message(bigint) to authenticated;

-- Lista de cuentas suspendidas ahora mismo (para el panel de Moderación)
create or replace function public.mod_bans() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._need_staff();
  return (select coalesce(jsonb_agg(jsonb_build_object('username', public._uname(b.user_id), 'until', b.until, 'reason', b.reason, 'since', b.created_at) order by b.created_at desc), '[]'::jsonb)
    from bans b where b.until is null or b.until > now());
end $$;
grant execute on function public.mod_bans() to authenticated;

-- Denunciar una quedada (título o juego ofensivos) y que el equipo pueda cancelarla
create or replace function public.report_meetup(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare m meetups;
begin
  select * into m from meetups where id = p_id and (clan_id is null or clan_id = public._my_clan());
  if not found then raise exception 'no such meetup' using errcode = 'P0002'; end if;
  if m.host_id = auth.uid() then raise exception 'own meetup' using errcode = '22023'; end if;
  if p_reason not in ('spam', 'abuse', 'cheating', 'inappropriate', 'other') then raise exception 'bad reason' using errcode = '22023'; end if;
  if (select count(*) from reports where reporter_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then raise exception 'too many reports' using errcode = '22023'; end if;
  insert into reports (reporter_id, target_id, target_name, reason, details, kind, ref) values (auth.uid(), m.host_id, public._uname(m.host_id), p_reason, m.title, 'meetup', p_id::text);
end $$;
create or replace function public.mod_cancel_meetup(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._need_staff();
  delete from meetups where id = p_id;
  insert into mod_log (by_id, action, target) values (auth.uid(), 'cancel_meetup', p_id::text);
end $$;
grant execute on function public.report_meetup(uuid, text), public.mod_cancel_meetup(uuid) to authenticated;
