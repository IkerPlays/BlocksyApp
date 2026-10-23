-- AUTH v13: votos (me gusta / no me gusta) de los juegos. Seguro de repetir.
create table if not exists public.game_votes (user_id uuid not null references public.profiles(id) on delete cascade, game_id uuid not null, vote smallint not null check (vote in (-1, 1)), updated_at timestamptz not null default now(), primary key (user_id, game_id));
alter table public.game_votes enable row level security;
revoke all on public.game_votes from anon, authenticated;
-- vote = 1 / -1; repetir el mismo voto lo quita (devuelve 0)
create or replace function public.vote_game(p_game uuid, p_vote int) returns int
language plpgsql security definer set search_path = public as $$
declare cur smallint;
begin
  if p_vote not in (-1, 1) then raise exception 'bad vote' using errcode = '22023'; end if;
  select vote into cur from game_votes where user_id = auth.uid() and game_id = p_game;
  if cur = p_vote then delete from game_votes where user_id = auth.uid() and game_id = p_game; return 0; end if;
  insert into game_votes (user_id, game_id, vote) values (auth.uid(), p_game, p_vote) on conflict (user_id, game_id) do update set vote = excluded.vote, updated_at = now();
  return p_vote;
end $$;
create or replace function public.game_votes_summary() returns table (game_id uuid, up bigint, down bigint, mine smallint)
language sql stable security definer set search_path = public as $$
  select v.game_id, count(*) filter (where v.vote = 1), count(*) filter (where v.vote = -1), coalesce(max(v.vote) filter (where v.user_id = auth.uid()), 0)::smallint
  from game_votes v group by v.game_id;
$$;
grant execute on function public.vote_game(uuid, int), public.game_votes_summary() to authenticated;
