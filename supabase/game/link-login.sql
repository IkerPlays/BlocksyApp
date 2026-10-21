-- Parche: añade el inicio de sesión por QR a un proyecto GAME que ya tiene schema.sql.
-- (Si ejecutas schema.sql completo no hace falta.) Es seguro ejecutarlo más de una vez.

-- ---------- Iniciar sesión en otro dispositivo (la 3DS muestra un QR; el móvil lo autoriza) ----------
create table if not exists public.link_codes (
  code       text primary key,
  poll_token uuid not null default gen_random_uuid(),
  secret     uuid,                                   -- sesión creada al aprobar
  expires_at timestamptz not null default now() + interval '10 minutes'
);
alter table public.link_codes enable row level security;   -- sin políticas: solo vía funciones

-- La 3DS pide un código (anónimo) y recibe también un token privado para consultar el estado
create or replace function public.link_start() returns jsonb
language plpgsql security definer set search_path = public as $$
declare c text; i int; p uuid;
        alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  delete from link_codes where expires_at < now();
  delete from sessions where expires_at < now();
  if (select count(*) from link_codes) > 500 then raise exception 'too many pending codes'; end if;
  loop
    c := '';
    for i in 1..6 loop c := c || substr(alphabet, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1); end loop;
    begin
      insert into link_codes (code) values (c) returning poll_token into p;
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  return jsonb_build_object('code', c, 'poll', p);
end $$;

-- La 3DS consulta si ya se aprobó (necesita el token privado)
create or replace function public.link_poll(p_code text, p_poll uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r link_codes; s sessions;
begin
  select * into r from link_codes where code = upper(btrim(p_code)) and poll_token = p_poll;
  if not found or r.expires_at < now() then return jsonb_build_object('status', 'expired'); end if;
  if r.secret is null then return jsonb_build_object('status', 'pending'); end if;
  select * into s from sessions where secret = r.secret;
  delete from link_codes where code = r.code;
  return jsonb_build_object('status', 'ok', 'secret', s.secret, 'player_id', s.player_id, 'username', s.username, 'color', s.color);
end $$;

-- El móvil/tablet (con sesión iniciada) aprueba el código: se crea una sesión de 30 días para la 3DS
create or replace function public.link_approve(p_secret uuid, p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare s sessions := public._me(p_secret); n sessions; k text := upper(btrim(p_code));
begin
  perform 1 from link_codes where code = k and secret is null and expires_at > now() for update;
  if not found then raise exception 'invalid code' using errcode = '22023'; end if;
  insert into sessions (player_id, username, color, expires_at)
  values (s.player_id, s.username, s.color, now() + interval '30 days') returning * into n;
  update link_codes set secret = n.secret where code = k;
end $$;

-- Comprueba que una sesión guardada sigue siendo válida
create or replace function public.whoami(p_secret uuid) returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('player_id', player_id, 'username', username, 'color', color)
  from sessions where secret = p_secret and expires_at > now();
$$;

grant execute on function public.link_start(), public.link_poll(text, uuid),
  public.link_approve(uuid, text), public.whoami(uuid) to anon, authenticated;
