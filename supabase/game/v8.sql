-- GAME v8: eventos "rem" = RemoteEvent de los scripts Lua (viajan entre los jugadores de la partida). Despues de v4.sql. Seguro de repetir.
create or replace function public.game_event(p_secret uuid, p_game uuid, p_kind text, p_payload jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret);
begin
  if p_kind not in ('orb', 'caught', 'win', 'round', 'light', 'rem') then return; end if;
  if p_kind = 'rem' then
    if length(coalesce(p_payload::text, '')) > 900 then return; end if;                                   -- mensajes pequeños
    if (select count(*) from interactions where player_id = s.player_id and kind = 'rem' and created_at > now() - interval '1 second') >= 12 then return; end if;
  end if;
  insert into interactions (game_id, player_id, username, kind, payload) values (p_game, s.player_id, s.username, p_kind, coalesce(p_payload, '{}'));
  if random() < 0.05 then delete from interactions where kind in ('orb', 'caught', 'win', 'round', 'light', 'rem') and created_at < now() - interval '1 hour'; end if;
end $$;
grant execute on function public.game_event(uuid, uuid, text, jsonb) to anon, authenticated;
