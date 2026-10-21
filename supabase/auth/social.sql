-- ============================================================
-- AUTH: solicitudes de amistad, chat entre amigos, notificaciones e invitaciones.
-- Ejecutar en el SQL Editor del proyecto AUTH (después de schema.sql). Es seguro repetirlo.
-- ============================================================

-- ---------- Privacidad: ya no hay lista pública de jugadores ----------
-- Solo ves tu perfil y el de tus amigos. Para encontrar a alguien hay que saber su nombre exacto (find_user).
drop policy if exists "profiles readable by signed-in users" on public.profiles;
drop policy if exists "profiles readable by self and friends" on public.profiles;
create policy "profiles readable by self and friends" on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or exists (select 1 from public.friendships f where f.user_id = auth.uid() and f.friend_id = profiles.id)
  );

-- Estado online: visto en los últimos 75 s (el cliente avisa cada 20 s)
create or replace view public.profiles_public with (security_invoker = true) as
  select id, username, avatar_color, current_game, last_seen,
         (last_seen > now() - interval '75 seconds') as is_online
  from public.profiles;
grant select on public.profiles_public to authenticated;

-- Las amistades solo se crean aceptando una solicitud (RPC); desde el cliente solo se leen
drop policy if exists "own friendships" on public.friendships;
drop policy if exists "read own friendships" on public.friendships;
create policy "read own friendships" on public.friendships for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.friendships from authenticated;

-- ---------- Tablas ----------
create table if not exists public.friend_requests (
  id         bigint generated always as identity primary key,
  from_id    uuid not null references auth.users(id) on delete cascade,
  to_id      uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (from_id, to_id),
  check (from_id <> to_id)
);
alter table public.friend_requests enable row level security;
drop policy if exists "own requests" on public.friend_requests;
create policy "own requests" on public.friend_requests for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());

create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  from_id    uuid not null references auth.users(id) on delete cascade,
  to_id      uuid not null references auth.users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists messages_pair_idx on public.messages (least(from_id, to_id), greatest(from_id, to_id), id desc);
create index if not exists messages_to_idx on public.messages (to_id, read_at);
alter table public.messages enable row level security;
drop policy if exists "own messages" on public.messages;
create policy "own messages" on public.messages for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());

create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,                      -- friend_request | friend_accept | invite
  from_id    uuid,
  from_name  text not null default '',
  payload    jsonb not null default '{}',
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, id desc);
alter table public.notifications enable row level security;
drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.friend_requests, public.messages, public.notifications from authenticated;
grant select on public.friend_requests, public.messages, public.notifications to authenticated;

-- ---------- Funciones ----------
create or replace function public._uname(p uuid) returns text language sql stable security definer set search_path = public as
$$ select username from profiles where id = p $$;
revoke all on function public._uname(uuid) from public, anon, authenticated;

-- Buscar por nombre EXACTO (sin distinguir mayúsculas). Devuelve solo lo básico.
create or replace function public.find_user(p_username text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'username', username, 'avatar_color', avatar_color)
  from profiles where lower(username) = lower(btrim(p_username)) and id <> auth.uid() limit 1;
$$;

create or replace function public.send_friend_request(p_username text) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t profiles; mine text := public._uname(auth.uid());
begin
  if me is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select * into t from profiles where lower(username) = lower(btrim(p_username));
  if not found then raise exception 'user not found' using errcode = 'P0002'; end if;
  if t.id = me then raise exception 'cannot add yourself' using errcode = '22023'; end if;
  if exists (select 1 from friendships where user_id = me and friend_id = t.id) then return 'already_friends'; end if;
  -- si esa persona ya me había pedido amistad, se acepta directamente
  if exists (select 1 from friend_requests where from_id = t.id and to_id = me) then
    perform public.respond_friend_request((select id from friend_requests where from_id = t.id and to_id = me), true);
    return 'accepted';
  end if;
  if exists (select 1 from friend_requests where from_id = me and to_id = t.id) then return 'already_sent'; end if;
  insert into friend_requests (from_id, to_id) values (me, t.id);
  insert into notifications (user_id, kind, from_id, from_name) values (t.id, 'friend_request', me, mine);
  return 'sent';
end $$;

create or replace function public.respond_friend_request(p_id bigint, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r friend_requests;
begin
  select * into r from friend_requests where id = p_id and to_id = auth.uid();
  if not found then return; end if;
  delete from friend_requests where id = r.id;
  delete from notifications where user_id = r.to_id and kind = 'friend_request' and from_id = r.from_id;
  if p_accept then
    insert into friendships (user_id, friend_id) values (r.to_id, r.from_id), (r.from_id, r.to_id) on conflict do nothing;
    insert into notifications (user_id, kind, from_id, from_name) values (r.from_id, 'friend_accept', r.to_id, public._uname(r.to_id));
  end if;
end $$;

create or replace function public.cancel_friend_request(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r friend_requests;
begin
  select * into r from friend_requests where id = p_id and from_id = auth.uid();
  if not found then return; end if;
  delete from friend_requests where id = r.id;
  delete from notifications where user_id = r.to_id and kind = 'friend_request' and from_id = r.from_id;
end $$;

create or replace function public.remove_friend(p_friend uuid) returns void
language sql security definer set search_path = public as $$
  delete from friendships where (user_id = auth.uid() and friend_id = p_friend) or (user_id = p_friend and friend_id = auth.uid());
$$;

-- Solicitudes recibidas / enviadas con nombre y color
create or replace function public.my_requests() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'dir', case when r.to_id = auth.uid() then 'in' else 'out' end,
      'user_id', p.id, 'username', p.username, 'avatar_color', p.avatar_color, 'created_at', r.created_at) order by r.id desc), '[]'::jsonb)
  from friend_requests r join profiles p on p.id = case when r.to_id = auth.uid() then r.from_id else r.to_id end
  where r.to_id = auth.uid() or r.from_id = auth.uid();
$$;

create or replace function public.send_message(p_to uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  p_body := left(btrim(p_body), 500);
  if p_body = '' then return; end if;
  if not exists (select 1 from friendships where user_id = auth.uid() and friend_id = p_to) then
    raise exception 'not friends' using errcode = '42501';
  end if;
  insert into messages (from_id, to_id, body) values (auth.uid(), p_to, p_body);
end $$;

create or replace function public.mark_read(p_from uuid) returns void
language sql security definer set search_path = public as $$
  update messages set read_at = now() where to_id = auth.uid() and from_id = p_from and read_at is null;
$$;

-- nº de mensajes sin leer por amigo
create or replace function public.unread_counts() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(from_id, n), '{}'::jsonb)
  from (select from_id, count(*) n from messages where to_id = auth.uid() and read_at is null group by from_id) s;
$$;

create or replace function public.invite_friend(p_friend uuid, p_game uuid, p_game_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from friendships where user_id = auth.uid() and friend_id = p_friend) then
    raise exception 'not friends' using errcode = '42501';
  end if;
  delete from notifications where user_id = p_friend and kind = 'invite' and from_id = auth.uid() and created_at < now() - interval '2 minutes';
  insert into notifications (user_id, kind, from_id, from_name, payload)
  values (p_friend, 'invite', auth.uid(), public._uname(auth.uid()), jsonb_build_object('game_id', p_game, 'game_name', left(p_game_name, 40)));
end $$;

create or replace function public.read_notifications() returns void
language sql security definer set search_path = public as $$
  update notifications set read = true where user_id = auth.uid() and not read and kind <> 'friend_request';
$$;
create or replace function public.clear_notifications() returns void
language sql security definer set search_path = public as $$
  delete from notifications where user_id = auth.uid() and kind <> 'friend_request';
$$;

grant execute on function
  public.find_user(text), public.send_friend_request(text), public.respond_friend_request(bigint, boolean),
  public.cancel_friend_request(bigint), public.remove_friend(uuid), public.my_requests(),
  public.send_message(uuid, text), public.mark_read(uuid), public.unread_counts(),
  public.invite_friend(uuid, uuid, text), public.read_notifications(), public.clear_notifications()
to authenticated;

-- ---------- Realtime ----------
do $$
declare t text;
begin
  foreach t in array array['messages', 'notifications', 'friend_requests'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Presencia: touch_presence también marca "visto" si el cliente envía la última partida
create or replace function public.touch_presence(p_game uuid default null)
returns void language sql security invoker as $$
  update public.profiles set last_seen = now(), current_game = p_game where id = auth.uid();
$$;

-- ---------- Perfiles (como Roblox): /u/<usuario> ----------
alter table public.profiles add column if not exists bio text not null default '';
alter table public.profiles drop constraint if exists profiles_bio_len;
alter table public.profiles add constraint profiles_bio_len check (char_length(bio) <= 160);

-- Perfil por nombre exacto: público lo básico; online y partida solo si es uno mismo o un amigo
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
    'relation', rel, 'request_id', rid,
    'friend_count', (select count(*) from friendships where user_id = t.id),
    'is_online', case when fr or t.id = me then t.last_seen > now() - interval '75 seconds' end,
    'current_game', case when fr or t.id = me then t.current_game end);
end $$;
grant execute on function public.get_profile(text) to authenticated;
