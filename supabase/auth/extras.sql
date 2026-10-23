-- ============================================================
-- AUTH: moderación (reportar y bloquear) y misiones diarias. Ejecutar en AUTH (después de social.sql y shop.sql). Es seguro repetirlo.
-- ============================================================

-- ---------- Bloquear y reportar ----------
create table if not exists public.blocked_users (
  user_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id), check (user_id <> blocked_id)
);
alter table public.blocked_users enable row level security;
drop policy if exists "own blocks" on public.blocked_users;
create policy "own blocks" on public.blocked_users for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.blocked_users from authenticated;
grant select on public.blocked_users to authenticated;

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null, target_name text not null, reason text not null, details text not null default '',
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;      -- solo el dueño del proyecto las ve (SQL Editor / service role)
revoke all on public.reports from anon, authenticated;

create or replace function public.block_user(p_username text) returns void
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  select id into t from profiles where lower(username) = lower(btrim(p_username));
  if t is null or t = auth.uid() then raise exception 'user not found' using errcode = 'P0002'; end if;
  insert into blocked_users (user_id, blocked_id) values (auth.uid(), t) on conflict do nothing;
  delete from friendships where (user_id = auth.uid() and friend_id = t) or (user_id = t and friend_id = auth.uid());
  delete from friend_requests where (from_id = auth.uid() and to_id = t) or (from_id = t and to_id = auth.uid());
end $$;
create or replace function public.unblock_user(p_username text) returns void
language sql security definer set search_path = public as $$
  delete from blocked_users where user_id = auth.uid() and blocked_id = (select id from profiles where lower(username) = lower(btrim(p_username)));
$$;
create or replace function public.my_blocked() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username)), '[]'::jsonb)
  from blocked_users b join profiles p on p.id = b.blocked_id where b.user_id = auth.uid();
$$;
create or replace function public.report_user(p_username text, p_reason text, p_details text default '') returns void
language plpgsql security definer set search_path = public as $$
declare t profiles;
begin
  select * into t from profiles where lower(username) = lower(btrim(p_username));
  if not found or t.id = auth.uid() then raise exception 'user not found' using errcode = 'P0002'; end if;
  if p_reason not in ('spam', 'abuse', 'cheating', 'inappropriate', 'other') then raise exception 'bad reason' using errcode = '22023'; end if;
  if (select count(*) from reports where reporter_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then raise exception 'too many reports' using errcode = '22023'; end if;
  insert into reports (reporter_id, target_id, target_name, reason, details) values (auth.uid(), t.id, t.username, p_reason, left(coalesce(p_details, ''), 300));
end $$;

-- Los bloqueados no pueden pedirte amistad ni escribirte (se comprueba al enviar)
create or replace function public.send_friend_request(p_username text) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t profiles; mine text := public._uname(auth.uid());
begin
  if me is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select * into t from profiles where lower(username) = lower(btrim(p_username));
  if not found then raise exception 'user not found' using errcode = 'P0002'; end if;
  if t.id = me then raise exception 'cannot add yourself' using errcode = '22023'; end if;
  if exists (select 1 from blocked_users where (user_id = t.id and blocked_id = me) or (user_id = me and blocked_id = t.id)) then raise exception 'user not found' using errcode = 'P0002'; end if;
  if exists (select 1 from friendships where user_id = me and friend_id = t.id) then return 'already_friends'; end if;
  if exists (select 1 from friend_requests where from_id = t.id and to_id = me) then
    perform public.respond_friend_request((select id from friend_requests where from_id = t.id and to_id = me), true);
    return 'accepted';
  end if;
  if exists (select 1 from friend_requests where from_id = me and to_id = t.id) then return 'already_sent'; end if;
  insert into friend_requests (from_id, to_id) values (me, t.id);
  insert into notifications (user_id, kind, from_id, from_name) values (t.id, 'friend_request', me, mine);
  return 'sent';
end $$;
grant execute on function public.block_user(text), public.unblock_user(text), public.my_blocked(), public.report_user(text, text, text), public.send_friend_request(text) to authenticated;

-- ---------- Misiones diarias ----------
create table if not exists public.mission_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  key text not null, n int not null default 0, claimed boolean not null default false,
  primary key (user_id, day, key)
);
alter table public.mission_progress enable row level security;
drop policy if exists "own missions" on public.mission_progress;
create policy "own missions" on public.mission_progress for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.mission_progress from authenticated;
grant select on public.mission_progress to authenticated;

-- Misiones: clave -> (objetivo, recompensa)
create or replace function public._mission(p_key text, out goal int, out reward int) language sql immutable as $$
  select case p_key when 'place_50' then 50 when 'play_10' then 10 when 'obby_win' then 1 when 'chat_5' then 5 when 'friend_1' then 1 end,
         case p_key when 'place_50' then 30 when 'play_10' then 40 when 'obby_win' then 60 when 'chat_5' then 20 when 'friend_1' then 25 end;
$$;
create or replace function public.mission_add(p_key text, p_add int) returns int
language plpgsql security definer set search_path = public as $$
declare g int; r int; v int;
begin
  select goal, reward into g, r from public._mission(p_key);
  if g is null then return 0; end if;
  insert into mission_progress (user_id, key, n) values (auth.uid(), p_key, 0) on conflict do nothing;
  update mission_progress set n = least(g, n + least(greatest(p_add, 0), 20)) where user_id = auth.uid() and day = (now() at time zone 'utc')::date and key = p_key returning n into v;
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
  return r;
end $$;
create or replace function public.my_missions() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', k, 'goal', (public._mission(k)).goal, 'reward', (public._mission(k)).reward,
    'n', coalesce((select n from mission_progress where user_id = auth.uid() and day = (now() at time zone 'utc')::date and key = k), 0),
    'claimed', coalesce((select claimed from mission_progress where user_id = auth.uid() and day = (now() at time zone 'utc')::date and key = k), false))), '[]'::jsonb)
  from unnest(array['place_50', 'play_10', 'obby_win', 'chat_5', 'friend_1']) as k;
$$;
grant execute on function public.mission_add(text, int), public.mission_claim(text), public.my_missions() to authenticated;
