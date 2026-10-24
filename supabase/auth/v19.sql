-- ============================================================
-- AUTH v19: denunciar mensajes del chat de clan y que el equipo pueda borrarlos. Ejecutar en el SQL Editor de AUTH (después de v17.sql y v18.sql).
-- Es seguro repetirlo.
-- ============================================================
create or replace function public.report_clan_message(p_id bigint, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare m clan_messages;
begin
  select * into m from clan_messages where id = p_id and clan_id = public._my_clan();
  if not found then raise exception 'no such message' using errcode = 'P0002'; end if;
  if m.user_id = auth.uid() then raise exception 'own message' using errcode = '22023'; end if;
  if p_reason not in ('spam', 'abuse', 'cheating', 'inappropriate', 'other') then raise exception 'bad reason' using errcode = '22023'; end if;
  if (select count(*) from reports where reporter_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then raise exception 'too many reports' using errcode = '22023'; end if;
  insert into reports (reporter_id, target_id, target_name, reason, details, kind, ref) values (auth.uid(), m.user_id, public._uname(m.user_id), p_reason, m.body, 'clanmsg', p_id::text);
end $$;
create or replace function public.mod_delete_clan_message(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._need_staff();
  delete from clan_messages where id = p_id;
  insert into mod_log (by_id, action, target) values (auth.uid(), 'delete_clan_message', p_id::text);
end $$;
grant execute on function public.report_clan_message(bigint, text), public.mod_delete_clan_message(bigint) to authenticated;

-- Lista de cuentas suspendidas ahora mismo (para el panel de Moderación)
create or replace function public.mod_bans() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._need_staff();
  return (select coalesce(jsonb_agg(jsonb_build_object('username', public._uname(b.user_id), 'until', b.until, 'reason', b.reason, 'since', b.created_at) order by b.created_at desc), '[]'::jsonb)
    from bans b where b.until is null or b.until > now());
end $$;
grant execute on function public.mod_bans() to authenticated;
