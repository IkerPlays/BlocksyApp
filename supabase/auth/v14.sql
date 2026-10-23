-- AUTH v14: aspecto del avatar elegido (piel, pelo, peinado, pantalon). Despues de v12.sql. Seguro de repetir.
alter table public.profiles add column if not exists look text not null default '';
revoke update (look) on public.profiles from anon, authenticated;
create or replace function public.set_look(p_look text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_look !~ '^[0-9]?\.[0-9]?\.[0-9]?\.[0-9]?$' and p_look <> '' then raise exception 'bad look' using errcode = '22023'; end if;
  update profiles set look = p_look where id = auth.uid();
end $$;
grant execute on function public.set_look(text) to authenticated;
-- profile_extra ahora tambien devuelve el aspecto
create or replace function public.profile_extra(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.profiles; fr boolean; nf int; ni int; b jsonb := '[]';
begin
  select * into t from profiles where lower(username) = lower(btrim(p_username));
  if not found then return null; end if;
  fr := t.id = me or exists (select 1 from friendships where user_id = me and friend_id = t.id);
  select count(*) into nf from friendships where user_id = t.id;
  select count(*) into ni from inventory where user_id = t.id;
  if t.created_at < '2027-01-01' then b := b || '"pioneer"'; end if;
  if t.play_seconds >= 3600 then b := b || '"regular"'; end if;
  if t.play_seconds >= 36000 then b := b || '"veteran"'; end if;
  if nf >= 5 then b := b || '"social"'; end if;
  if ni >= 5 then b := b || '"collector"'; end if;
  if t.bcoins >= 1000 then b := b || '"rich"'; end if;
  return jsonb_build_object('play_seconds', t.play_seconds, 'badges', b, 'last_seen', case when fr then t.last_seen end, 'look', t.look);
end $$;
grant execute on function public.profile_extra(text) to authenticated;
