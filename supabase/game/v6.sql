-- GAME v6: salas privadas. Una sala es una copia de las reglas de un juego con un id propio derivado del codigo
-- (los jugadores de otra sala no se ven ni se escriben). Ejecutar despues de v3.sql. Seguro de repetir.
create or replace function public.join_room(p_secret uuid, p_parent uuid, p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret); rid uuid; c text := lower(btrim(p_code));
begin
  if c !~ '^[a-z0-9]{3,12}$' then raise exception 'bad room code' using errcode = '22023'; end if;
  rid := md5(p_parent::text || ':' || c)::uuid;
  insert into game_rules (game_id, owner_id, mode, config) select rid, owner_id, mode, config from game_rules where game_id = p_parent
  on conflict (game_id) do nothing;
  if not found and not exists (select 1 from game_rules where game_id = rid) then raise exception 'unknown game' using errcode = '22023'; end if;
  return rid;
end $$;
grant execute on function public.join_room(uuid, uuid, text) to anon, authenticated;
