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
