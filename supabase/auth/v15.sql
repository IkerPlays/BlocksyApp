-- AUTH v15: ranking de BCoins. Seguro de repetir.
-- Solo expone el nombre, el color y el saldo de los 50 jugadores con más BCoins.
create or replace function public.bcoin_leaderboard(p_limit int default 25)
returns table (username text, avatar_color text, bcoins int)
language sql stable security definer set search_path = public as $$
  select p.username, p.avatar_color, p.bcoins from profiles p
  where p.bcoins > 0 order by p.bcoins desc, p.username limit least(greatest(p_limit, 1), 50);
$$;
grant execute on function public.bcoin_leaderboard(int) to authenticated;
