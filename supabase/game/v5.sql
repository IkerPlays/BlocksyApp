-- GAME v5: varias piezas de bloque en una llamada (lo usa el Studio para cajas, estructuras y deshacer).
-- Ejecutar DESPUÉS de v3.sql / v4.sql. Es seguro repetirlo.
-- p_blocks = [[x, y, z, tipo], ...]; tipo -1 = borrar. Máximo 600 por llamada. Mismas reglas que place_block / break_block.
create or replace function public.place_blocks(p_secret uuid, p_game uuid, p_blocks jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions := public._me(p_secret); g public.game_rules; b jsonb; n int := 0; vx int; vy int; vz int; vk int;
begin
  select * into g from game_rules where game_id = p_game;
  if not found then return; end if;
  if g.mode in ('social', 'obby', 'arena') and g.owner_id <> s.player_id and not coalesce((g.config ->> 'allow_build')::boolean, false) then return; end if;
  if g.mode = 'build' and not coalesce((g.config ->> 'allow_build')::boolean, true) and g.owner_id <> s.player_id then return; end if;
  if jsonb_typeof(p_blocks) <> 'array' then return; end if;
  for b in select * from jsonb_array_elements(p_blocks) loop
    n := n + 1; exit when n > 600;
    vx := (b ->> 0)::int; vy := (b ->> 1)::int; vz := (b ->> 2)::int; vk := (b ->> 3)::int;
    continue when vy < 0 or vy > 255 or abs(vx) > 5000 or abs(vz) > 5000 or vk not between -1 and 15;
    if vk < 0 then
      delete from blocks where game_id = p_game and blocks.x = vx and blocks.y = vy and blocks.z = vz;
    else
      insert into blocks (game_id, x, y, z, kind, placed_by) values (p_game, vx, vy, vz, vk, s.player_id)
      on conflict (game_id, x, y, z) do update set kind = excluded.kind, placed_by = excluded.placed_by;
    end if;
  end loop;
end $$;
grant execute on function public.place_blocks(uuid, uuid, jsonb) to anon, authenticated;
