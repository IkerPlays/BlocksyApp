-- GAME v7: el accesorio que llevas (sombrero|gafas|espalda|estela|mascota) puede medir hasta 64 caracteres. Despues de v4.sql. Seguro de repetir.
drop function if exists public.move(uuid, uuid, real, real, real, real, text, text);
create or replace function public.move(
  p_secret uuid, p_game uuid, p_x real, p_y real, p_z real, p_ry real,
  p_anim text default 'idle', p_platform text default 'web', p_hat text default '')
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret);
begin
  if abs(p_x) > 100000 or abs(p_y) > 100000 or abs(p_z) > 100000 then return; end if;
  insert into player_state (player_id, game_id, username, color, x, y, z, ry, anim, platform, hat, updated_at)
  values (s.player_id, p_game, s.username, s.color, p_x, p_y, p_z, p_ry,
          left(p_anim, 12), case when p_platform = '3ds' then '3ds' else 'web' end, left(coalesce(p_hat, ''), 64), now())
  on conflict (player_id) do update set
    game_id = excluded.game_id, username = excluded.username, color = excluded.color,
    x = excluded.x, y = excluded.y, z = excluded.z, ry = excluded.ry,
    anim = excluded.anim, platform = excluded.platform, hat = excluded.hat, updated_at = now();
  if random() < 0.02 then
    delete from player_state where updated_at < now() - interval '30 seconds';
  end if;
end $$;
grant execute on function public.move(uuid, uuid, real, real, real, real, text, text, text) to anon, authenticated;
