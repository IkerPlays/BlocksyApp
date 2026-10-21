-- Parche: solo las cuentas autorizadas pueden crear y borrar juegos (y solo desde la web).
-- Ejecuta esto en el SQL Editor del proyecto GAME (es seguro repetirlo) y actualiza la función game-session
-- (supabase/functions/game-session/index.ts): ella marca la sesión con can_create según el email.
alter table public.sessions add column if not exists can_create boolean not null default false;

create or replace function public.create_game(p_secret uuid, p_name text, p_desc text default '', p_hue int default 200)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret); gid uuid;
begin
  if not s.can_create then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into games (name, description, owner_id, owner_name, hue)
  values (btrim(p_name), left(coalesce(p_desc, ''), 200), s.player_id, s.username, ((p_hue % 360) + 360) % 360)
  returning id into gid;
  return gid;
end $$;

create or replace function public.delete_game(p_secret uuid, p_game uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret);
begin
  if not s.can_create then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from games where id = p_game and owner_id = s.player_id;
end $$;
