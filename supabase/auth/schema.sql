-- ============================================================
-- Proyecto Supabase #1: AUTH (cuentas + presencia online)
-- Ejecutar en el SQL Editor del proyecto de Auth.
-- ============================================================

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  avatar_color text not null default '#4da6ff' check (avatar_color ~ '^#[0-9a-fA-F]{6}$'),
  last_seen    timestamptz not null default now(),
  current_game uuid,            -- id del juego (en el proyecto GAME) en el que está
  created_at   timestamptz not null default now()
);

-- Crea el perfil automáticamente al registrarse (username viene en user_metadata)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wanted text := coalesce(new.raw_user_meta_data->>'username', '');
begin
  if wanted !~ '^[A-Za-z0-9_]{3,20}$' or exists (select 1 from profiles where username = wanted) then
    wanted := 'player_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  insert into profiles (id, username) values (new.id, wanted);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Heartbeat: el cliente (web/3DS) llama a esto cada ~30 s
create or replace function public.touch_presence(p_game uuid default null)
returns void language sql security invoker as $$
  update public.profiles set last_seen = now(), current_game = p_game where id = auth.uid();
$$;

create or replace function public.go_offline()
returns void language sql security invoker as $$
  update public.profiles set last_seen = now() - interval '1 hour', current_game = null where id = auth.uid();
$$;

-- Vista pública con el estado online calculado (visto en los últimos 60 s)
create or replace view public.profiles_public with (security_invoker = true) as
  select id, username, avatar_color, current_game, last_seen,
         (last_seen > now() - interval '60 seconds') as is_online
  from public.profiles;

alter table public.profiles enable row level security;

drop policy if exists "profiles readable by signed-in users" on public.profiles;
create policy "profiles readable by signed-in users" on public.profiles
  for select to authenticated using (true);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

grant select on public.profiles_public to authenticated;
grant execute on function public.touch_presence(uuid), public.go_offline() to authenticated;
