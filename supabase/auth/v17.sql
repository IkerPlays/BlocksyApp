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
