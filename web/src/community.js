// Clanes (chat y juegos compartidos) y quedadas con fecha. Necesita supabase/auth/v17.sql; sin él se explica qué falta.
import { el, setKids, toast, avatarEl } from './pages.js'
import { t, getLang } from './i18n.js'
import { icon } from './icons.js'
import * as social from './social.js'
import * as api from './api.js'
import { bump } from './settings.js'
import { fmtTime, dayLabel, mediaEl } from './social-ui.js'

const sqlMissing = e => /could not find|does not exist|schema cache/i.test(String(e?.message))
const noSql = () => el('div', { class: 'panel' }, el('h3', { text: t('need_sql_title') }), el('p', { class: 'muted', text: t('need_sql_v17') }))
const run = async fn => { try { return await fn() } catch (e) { toast(sqlMissing(e) ? t('need_sql_v17') : /name taken|23505|duplicate/i.test(e.message) ? t('clan_name_taken') : e.message) } }
// Archivo .ics para añadir la quedada al calendario del móvil o del ordenador
function downloadIcs(m) {
  const d = x => new Date(x).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''), start = new Date(m.starts_at)
  const esc = x => String(x).replace(/[\\;,]/g, '\\$&').replace(/\n/g, '\\n')
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Blocksy//ES', 'BEGIN:VEVENT', `UID:${m.id}@blocksy`, `DTSTAMP:${d(Date.now())}`, `DTSTART:${d(start)}`, `DTEND:${d(start.getTime() + 3600_000)}`,
    `SUMMARY:${esc(m.title)}`, `DESCRIPTION:${esc((m.game_name ? m.game_name + ' · ' : '') + 'Blocksy')}`, 'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(m.title)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'blocksy-quedada.ics'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
const whenLabel = iso => new Date(iso).toLocaleString(getLang(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const untilLabel = iso => {
  const ms = new Date(iso).getTime() - Date.now(); if (ms <= 0) return t('mt_started')
  const m = Math.round(ms / 60000); return m < 60 ? t('mt_in_min', { n: m }) : m < 1440 ? t('mt_in_h', { n: Math.round(m / 60) }) : t('mt_in_d', { n: Math.round(m / 1440) })
}

export async function clanPage(root, ctx) {
  let clan
  try { clan = await social.myClan() } catch (e) { return setKids(root, el('h1', { class: 'page-title', text: t('nav_clan') }), sqlMissing(e) ? noSql() : el('p', { class: 'msg', text: e.message })) }
  const again = () => clanPage(root, ctx)
  if (!clan) return noClanView(root, ctx, again)
  const me = ctx.profile, owner = clan.owner_id === me.id
  const list = el('div', { class: 'clan-chat' }), input = el('input', { placeholder: t('chat_ph'), maxlength: 300, autocomplete: 'off' })
  const names = Object.fromEntries(clan.members.map(m => [m.id, m]))
  const addMsg = m => {
    const mem = names[m.user_id], mine = m.user_id === me.id, atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60
    list.append(el('div', { class: `dm ${mine ? 'mine' : ''}` }, el('div', { class: 'bubble' }, mine ? null : el('b', { text: mem?.username ?? '?' }), el('span', { text: m.body }), el('small', { text: `${dayLabel(m.created_at)} ${fmtTime(m.created_at)}` }))))
    if (atBottom) list.scrollTop = list.scrollHeight
  }
  const form = el('form', { class: 'dm-form', onsubmit: async e => { e.preventDefault(); const b = input.value.trim(); if (!b) return; input.value = ''; await run(() => social.clanSend(b)) } }, input, el('button', { class: 'btn blue', html: icon('send', 18), title: t('send') }))
  const gamesBox = el('div'), pick = el('select')
  const paintGames = async () => {
    const all = await api.listGames().catch(() => []), byId = Object.fromEntries(all.map(g => [g.id, g]))
    pick.replaceChildren(el('option', { value: '', text: t('clan_add_game') }), ...all.map(g => el('option', { value: g.id, text: g.name })))
    setKids(gamesBox, clan.games.length ? clan.games.map(g => el('div', { class: 'person' }, el('div', { class: 'grow' }, el('b', { text: g.name })),
      byId[g.game_id] ? el('button', { class: 'btn primary', text: t('play'), onclick: () => ctx.play(byId[g.game_id]) }) : el('small', { class: 'muted', text: t('clan_game_gone') }),
      el('button', { class: 'btn tiny', html: icon('trash', 14), title: t('delete'), onclick: () => run(async () => { await social.clanRemoveGame(g.game_id); again() }) }))) : el('small', { class: 'muted', text: t('clan_no_games') }))
  }
  pick.onchange = () => { const g = pick.selectedOptions[0]; if (g?.value) run(async () => { await social.clanAddGame(g.value, g.textContent); again() }) }
  setKids(root, el('h1', { class: 'page-title', text: `[${clan.tag}] ${clan.name}` }), clan.description ? el('p', { class: 'muted', text: clan.description }) : null,
    el('div', { class: 'clan-grid' },
      el('div', {}, el('div', { class: 'section-s', text: t('clan_chat') }), el('div', { class: 'panel clan-chatbox' }, list, form)),
      el('div', {},
        el('div', { class: 'section-s', text: t('clan_members', { n: clan.members.length }) }),
        el('div', { class: 'panel' }, clan.members.map(m => el('div', { class: 'person' }, avatarEl(m.username, m.avatar_color, m.is_online), el('div', { class: 'grow' }, el('a', { href: `/u/${encodeURIComponent(m.username)}`, text: m.username + (m.role === 'owner' ? ' ★' : '') })),
          owner && m.id !== me.id ? el('button', { class: 'btn tiny danger', text: t('clan_kick'), onclick: () => { if (confirm(t('clan_kick_confirm', { name: m.username }))) run(async () => { await social.kickMember(m.id); again() }) } }) : null))),
        el('div', { class: 'section-s', text: t('clan_games') }), el('div', { class: 'panel' }, gamesBox, el('div', { style: 'margin-top:8px' }, pick)),
        el('button', { class: 'btn danger wide', style: 'margin-top:12px', text: t('clan_leave'), onclick: () => { if (confirm(t('clan_leave_confirm'))) run(async () => { await social.leaveClan(); again() }) } }))))
  paintGames()
  const old = await social.clanMessages(clan.id); old.forEach(addMsg); list.scrollTop = list.scrollHeight
  const stop = social.watchClan(clan.id, addMsg)
  const guard = setInterval(() => { if (!list.isConnected) { clearInterval(guard); stop() } }, 2000)
}

async function noClanView(root, ctx, again) {
  const name = el('input', { placeholder: t('clan_name'), maxlength: 20 }), tag = el('input', { placeholder: t('clan_tag'), maxlength: 5, style: 'width:90px' }), desc = el('input', { placeholder: t('clan_desc'), maxlength: 200 })
  const found = el('div', { class: 'panel' }), search = el('input', { placeholder: t('search'), type: 'search' })
  const paint = async () => {
    let l = []; try { l = await social.listClans(search.value.trim()) } catch {}
    setKids(found, l.length ? l.map(c => el('div', { class: 'person' }, el('div', { class: 'grow' }, el('b', { text: `[${c.tag}] ${c.name}` }), c.description ? el('small', { class: 'muted', text: c.description }) : null),
      el('small', { class: 'muted', text: t('clan_members', { n: c.members }) }), el('button', { class: 'btn primary', text: t('clan_join'), onclick: () => run(async () => { await social.joinClan(c.id); bump('clan'); again() }) }))) : el('div', { class: 'empty', text: t('clan_none') }))
  }
  search.oninput = () => { clearTimeout(paint.t); paint.t = setTimeout(paint, 300) }
  setKids(root, el('h1', { class: 'page-title', text: t('nav_clan') }), el('p', { class: 'muted', text: t('clan_intro') }),
    el('div', { class: 'panel' }, el('h3', { text: t('clan_create') }), el('div', { class: 'row-btns' }, name, tag), desc,
      el('button', { class: 'btn primary', style: 'margin-top:10px', text: t('clan_create'), onclick: () => { if (name.value.trim().length < 3 || !/^[A-Za-z0-9]{2,5}$/.test(tag.value.trim())) return toast(t('clan_bad')); run(async () => { await social.createClan(name.value, tag.value, desc.value); bump('clan'); again() }) } })),
    el('div', { class: 'section-s', text: t('clan_find') }), search, found)
  paint()
}

export async function eventsPage(root, ctx) {
  let list = [], clan = null
  try { list = await social.listMeetups(); clan = await social.myClan().catch(() => null) } catch (e) { return setKids(root, el('h1', { class: 'page-title', text: t('nav_events') }), sqlMissing(e) ? noSql() : el('p', { class: 'msg', text: e.message })) }
  const games = await api.listGames().catch(() => []), byId = Object.fromEntries(games.map(g => [g.id, g]))
  const again = () => eventsPage(root, ctx)
  const title = el('input', { placeholder: t('mt_title'), maxlength: 40 }), gsel = el('select', {}, el('option', { value: '', text: t('mt_any_game') }), ...games.map(g => el('option', { value: g.id, text: g.name })))
  const soon = new Date(Date.now() + 3600_000 * 2); soon.setMinutes(0, 0, 0)
  const pad = n => String(n).padStart(2, '0'), local = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  const when = el('input', { type: 'datetime-local', value: local(soon) }), clanOnly = el('input', { type: 'checkbox' })
  const card = m => el('div', { class: 'person meetup' }, el('div', { class: 'grow' }, el('b', { text: m.title + (m.clan ? ' 🛡' : '') }), el('div', { class: 'muted' }, `${whenLabel(m.starts_at)} · ${untilLabel(m.starts_at)}`),
      el('small', { class: 'muted', text: `${m.game_name || t('mt_any_game')} · ${t('by', { name: m.host })} · ${t('mt_going', { n: m.going })}` })),
    byId[m.game_id] && new Date(m.starts_at).getTime() - Date.now() < 900_000 ? el('button', { class: 'btn primary', text: t('play'), onclick: () => ctx.play(byId[m.game_id]) }) : null,
    el('button', { class: `btn ${m.me ? '' : 'blue'}`, text: m.me ? t('mt_going_you') : t('mt_join'), onclick: () => run(async () => { await social.rsvpMeetup(m.id, !m.me); if (!m.me) bump('meetups'); again() }) }),
    el('button', { class: 'btn tiny', html: icon('send', 14), title: t('mt_calendar'), onclick: () => downloadIcs(m) }),
    m.mine ? el('button', { class: 'btn tiny danger', html: icon('trash', 14), title: t('delete'), onclick: () => run(async () => { await social.cancelMeetup(m.id); again() }) }) : null)
  setKids(root, el('h1', { class: 'page-title', text: t('nav_events') }), el('p', { class: 'muted', text: t('mt_intro') }),
    el('div', { class: 'panel' }, el('h3', { text: t('mt_create') }), title, el('div', { class: 'row-btns' }, gsel, when),
      clan ? el('label', { class: 'chk' }, clanOnly, el('span', { text: t('mt_clan_only') })) : null,
      el('button', { class: 'btn primary', style: 'margin-top:10px', text: t('mt_create'), onclick: () => { const d = new Date(when.value); if (title.value.trim().length < 3 || isNaN(d)) return toast(t('mt_bad')); const g = gsel.selectedOptions[0]
        run(async () => { await social.createMeetup(title.value.trim(), g.value, g.value ? g.textContent : '', d.toISOString(), clanOnly.checked); toast(t('mt_created')); bump('meetups'); again() }) } })),
    el('div', { class: 'section-s', text: t('mt_upcoming') }), el('div', { class: 'panel' }, list.length ? list.map(card) : el('div', { class: 'empty', text: t('mt_none') })),
    el('small', { class: 'muted', text: t('mt_reminder_note') }))
}

// ---------- Moderación (solo equipo: tabla staff de AUTH v18) ----------
export async function moderationPage(root, ctx) {
  if (!(await social.isStaff())) return ctx.go('home')
  let tab = 'open'
  const body = el('div'), tabs = el('div', { class: 'row-btns' })
  const TABS = [['open', 'mod_open'], ['resolved', 'mod_done'], ['users', 'mod_users'], ['blocked', 'mod_blocked'], ['log', 'mod_log']]
  const paintTabs = () => setKids(tabs, TABS.map(([k, l]) => el('button', { class: `chip ${tab === k ? 'on' : ''}`, text: t(l), onclick: () => { tab = k; load() } })))
  const act = async fn => { try { await fn(); load() } catch (e) { toast(e.message) } }
  const ban = name => { const d = prompt(t('mod_ban_days'), '7'); if (d === null) return; const r = prompt(t('mod_reason'), ''); if (r === null) return; const days = d.trim() === '' ? 0 : parseInt(d, 10); act(() => social.modBan(name, days, r)) }
  const warn = name => { const x = prompt(t('mod_warn_text'), ''); if (x) act(() => social.modWarn(name, x)) }
  const media = text => { const m = social.parseMedia(text); return m ? mediaEl(m) : el('div', { class: 'bubble' }, el('span', { text })) }
  function reportCard(r) {
    const gid = /\(([0-9a-f]{8}-[0-9a-f-]{27})\)/i.exec(r.details ?? '')?.[1]
    return el('div', { class: 'panel mod-card' },
      el('div', { class: 'row-btns' }, el('span', { class: 'rarity ' + (r.kind === 'message' ? 'epic' : 'rare'), text: t('mod_kind_' + r.kind) }), el('b', { text: t('rep_' + r.reason) }), el('small', { class: 'muted', text: new Date(r.created_at).toLocaleString(getLang()) })),
      el('div', {}, el('a', { href: `/u/${encodeURIComponent(r.target)}`, text: r.target }), el('small', { class: 'muted', text: ' ' + t('mod_reported_by', { name: r.reporter }) + ' · ' + t('mod_reports_n', { n: r.reports_on_target }) }), r.banned ? el('b', { class: 'danger-txt', text: ' · ' + t('mod_is_banned') }) : null),
      r.details ? (r.kind === 'message' ? media(r.details) : el('p', { class: 'muted', text: r.details })) : null,
      r.note ? el('small', { class: 'muted', text: t('mod_note') + ': ' + r.note }) : null,
      el('div', { class: 'row-btns' },
        r.status === 'open' ? [el('button', { class: 'btn tiny', text: t('mod_dismiss'), onclick: () => act(() => social.modResolve(r.id, 'dismissed')) }), el('button', { class: 'btn tiny primary', text: t('mod_resolve'), onclick: () => { const n = prompt(t('mod_note'), ''); if (n !== null) act(() => social.modResolve(r.id, 'resolved', n)) } })]
          : el('button', { class: 'btn tiny', text: t('mod_reopen'), onclick: () => act(() => social.modResolve(r.id, 'open')) }),
        el('button', { class: 'btn tiny', text: t('mod_warn'), onclick: () => warn(r.target) }),
        el('button', { class: 'btn tiny danger', text: r.banned ? t('mod_unban') : t('mod_ban'), onclick: () => (r.banned ? act(() => social.modUnban(r.target)) : ban(r.target)) }),
        r.kind === 'message' && r.ref ? el('button', { class: 'btn tiny danger', text: t('mod_del_msg'), onclick: () => { if (confirm(t('mod_del_msg') + '?')) act(() => social.modDeleteMessage(+r.ref)) } }) : null,
        gid ? el('button', { class: 'btn tiny danger', text: t('mod_block_game'), onclick: () => { const x = prompt(t('mod_reason'), ''); if (x !== null) act(() => social.modBlockGame(gid, x)) } }) : null))
  }
  async function load() {
    paintTabs(); setKids(body, el('div', { class: 'empty', text: t('loading') }))
    try {
      if (tab === 'open' || tab === 'resolved') {
        const l = await social.modReports(tab === 'open' ? 'open' : 'all'); const list = tab === 'open' ? l : l.filter(r => r.status !== 'open')
        setKids(body, list.length ? list.map(reportCard) : el('div', { class: 'empty', text: t('mod_none') }))
      } else if (tab === 'users') {
        const input = el('input', { placeholder: t('mod_user_ph'), maxlength: 20 }), out = el('div')
        const find = async () => {
          const u = await social.modUser(input.value.trim()).catch(e => (toast(e.message), null)); if (!u) return setKids(out, el('div', { class: 'empty', text: t('mod_no_user') }))
          setKids(out, el('div', { class: 'panel' }, el('h3', { text: u.username + (u.staff ? ' ★ ' + u.staff : '') }), el('small', { class: 'muted', text: t('mod_user_info', { d: new Date(u.created_at).toLocaleDateString(getLang()), o: u.reports_open, n: u.reports_total }) }),
            u.ban ? el('p', { class: 'danger-txt', text: t('banned_msg', { until: u.ban.until ? new Date(u.ban.until).toLocaleDateString(getLang()) : t('banned_forever'), reason: u.ban.reason || '-' }) }) : null,
            el('div', { class: 'row-btns' }, el('button', { class: 'btn tiny', text: t('mod_warn'), onclick: () => warn(u.username) }), u.ban ? el('button', { class: 'btn tiny', text: t('mod_unban'), onclick: async () => { await act(() => social.modUnban(u.username)) } }) : el('button', { class: 'btn tiny danger', text: t('mod_ban'), onclick: () => ban(u.username) }))))
        }
        input.onkeydown = e => { if (e.key === 'Enter') find() }
        setKids(body, el('div', { class: 'row-btns' }, input, el('button', { class: 'btn primary', text: t('search'), onclick: find })), out)
      } else if (tab === 'blocked') {
        const l = await social.modBlocked()
        setKids(body, el('div', { class: 'panel' }, l.length ? l.map(b => el('div', { class: 'person' }, el('div', { class: 'grow' }, el('b', { text: b.ref }), el('small', { class: 'muted', text: ' ' + b.reason })), el('button', { class: 'btn tiny', text: t('mod_unblock'), onclick: () => act(() => social.modUnblockGame(b.ref)) }))) : el('div', { class: 'empty', text: t('mod_none') })))
      } else {
        const l = await social.modLog()
        setKids(body, el('div', { class: 'panel' }, l.length ? l.map(x => el('div', { class: 'person' }, el('div', { class: 'grow' }, el('b', { text: `${x.by} · ${x.action}` }), el('small', { class: 'muted', text: ` ${x.target} ${x.detail}` })), el('small', { class: 'muted', text: new Date(x.at).toLocaleString(getLang()) }))) : el('div', { class: 'empty', text: t('mod_none') })))
      }
    } catch (e) { setKids(body, sqlMissing(e) ? noSql() : el('p', { class: 'msg', text: e.message })) }
  }
  setKids(root, el('h1', { class: 'page-title', text: t('nav_mod') }), el('p', { class: 'muted', text: t('mod_intro') }), tabs, body)
  load()
}
