// Interfaz social: chat privado, invitaciones y centro de notificaciones
import * as social from './social.js'
import * as api from './api.js'
import { headshot } from './avatar.js'
import { t, onLang } from './i18n.js'
import { icon } from './icons.js'
import { settings } from './settings.js'
import { sfx } from './sfx.js'
import { el, setKids, toast, avatarEl, closeModal } from './pages.js'

const $ = id => document.getElementById(id)
const status = f => (f.is_online ? (f.current_game ? t('status_game') : t('status_online')) : t('status_offline'))
export const fmtTime = iso => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// ---------- chat privado ----------
let openedChat = null     // { friendId, add(msg) } mientras la ventana está abierta
export function openChat(ctx, friend) {
  const me = ctx.profile
  const list = el('div', { class: 'dm-list' }), input = el('input', { placeholder: t('chat_ph'), maxlength: 500, autocomplete: 'off' })
  const seen = new Set()
  const line = m => {
    if (seen.has(m.id)) return; seen.add(m.id)
    const mine = m.from_id === me.id
    list.append(el('div', { class: `dm ${mine ? 'mine' : ''}` }, el('div', { class: 'bubble' }, el('span', { text: m.body }), el('small', { text: fmtTime(m.created_at) }))))
    list.scrollTop = list.scrollHeight
  }
  const form = el('form', { class: 'dm-form', onsubmit: async e => {
    e.preventDefault(); const body = input.value.trim(); if (!body) return; input.value = ''
    try { await social.sendMessage(friend.id, body); await refresh() } catch (er) { toast(er.message) }
  } }, input, el('button', { class: 'btn blue', html: icon('send', 18), title: t('send') }))
  async function refresh() {
    const msgs = await social.conversation(me.id, friend.id)
    if (!msgs.length && !seen.size) setKids(list, el('div', { class: 'empty', text: t('chat_empty') }))
    else { if (list.querySelector('.empty')) list.replaceChildren(); msgs.forEach(line) }
    social.markRead(friend.id).then(() => ctx.refreshBadges?.(), () => {})
  }
  const card = $('modal-card')
  setKids(card, el('div', { class: 'dm-card' },
    el('div', { class: 'dm-head' }, avatarEl(friend.username, friend.avatar_color, friend.is_online), el('div', { class: 'grow' }, el('b', { text: t('chat_with', { name: friend.username }) }), el('small', { text: status(friend) })),
      el('button', { class: 'btn', text: t('close'), onclick: () => { stop(); closeModal() } })),
    list, form))
  $('modal').classList.remove('hidden'); refresh(); input.focus()
  const timer = setInterval(refresh, 4000)
  const stop = () => { clearInterval(timer); openedChat = null }
  openedChat = { friendId: friend.id, refresh, stop }
  const mo = new MutationObserver(() => { if ($('modal').classList.contains('hidden')) { stop(); mo.disconnect() } })
  mo.observe($('modal'), { attributes: true, attributeFilter: ['class'] })
}
export const chatOpenWith = () => openedChat?.friendId

// ---------- invitar amigos al juego actual ----------
export async function openInvite(ctx, game) {
  const card = $('modal-card')
  setKids(card, el('div', { class: 'detail-col' }, el('h2', { text: t('invite_title') }), el('div', { class: 'empty', text: t('loading') })))
  $('modal').classList.remove('hidden')
  const friends = (await social.listFriends(ctx.profile.id)).filter(f => f.is_online)
  const rows = friends.length ? friends.map(f => {
    const b = el('button', { class: 'btn blue', text: t('invite'), onclick: async () => { b.disabled = true; try { await social.inviteFriend(f.id, game.id, game.name); toast(t('invite_sent', { name: f.username })); b.textContent = '✓' } catch (e) { toast(e.message); b.disabled = false } } })
    return el('div', { class: 'person' }, avatarEl(f.username, f.avatar_color, true), el('div', { class: 'grow' }, el('b', { text: f.username }), el('small', { text: status(f) })), b)
  }) : el('div', { class: 'empty', text: t('invite_none') })
  setKids(card, el('div', { class: 'detail-col' }, el('h2', { text: t('invite_title') }), el('div', { class: 'panel' }, rows),
    el('button', { class: 'btn wide', text: t('close'), onclick: closeModal })))
}

// ---------- notificaciones ----------
const text = n => n.kind === 'friend_request' ? t('n_friend_request', { name: n.from_name })
  : n.kind === 'friend_accept' ? t('n_friend_accept', { name: n.from_name })
  : n.kind === 'invite' ? t('n_invite', { name: n.from_name, game: n.payload?.game_name ?? '' }) : n.kind
let unread = 0, badges = { notif: 0, msgs: 0 }

export function initNotifications(ctx) {
  const bell = $('bell'), count = $('bell-count'), panel = $('notif-panel')
  const paint = () => {
    const n = badges.notif + badges.msgs
    count.textContent = n > 9 ? '9+' : String(n); count.classList.toggle('hidden', !n)
    const fb = $('friends-badge'); if (fb) { fb.textContent = badges.msgs ? String(badges.msgs) : ''; fb.classList.toggle('hidden', !badges.msgs) }
    document.title = n ? `(${n}) Blocksy` : 'Blocksy'
  }
  async function refreshBadges() {
    try {
      const [ns, uc, reqs] = await Promise.all([social.notifications(), social.unreadCounts(), social.myRequests()])
      badges.notif = ns.filter(x => !x.read).length + 0
      badges.msgs = Object.values(uc).reduce((a, b) => a + b, 0)
      badges.reqIn = reqs.filter(r => r.dir === 'in').length
      paint()
    } catch {}
  }
  ctx.refreshBadges = refreshBadges
  async function drawPanel() {
    const [ns, uc, friends] = await Promise.all([social.notifications(), social.unreadCounts(), social.listFriends(ctx.profile.id)])
    const byId = Object.fromEntries(friends.map(f => [f.id, f]))
    const rows = []
    for (const [fid, n] of Object.entries(uc)) {
      const f = byId[fid]; if (!f) continue
      rows.push(el('div', { class: 'notif unread', onclick: () => { panel.classList.add('hidden'); openChat(ctx, f) } }, avatarEl(f.username, f.avatar_color), el('div', { class: 'grow' }, el('b', { text: t('n_message', { name: f.username }) }), el('small', { text: t('n_msg_unread', { n }) }))))
    }
    for (const n of ns) {
      const actions = []
      if (n.kind === 'friend_request') actions.push(el('button', { class: 'btn blue', text: t('nav_friends'), onclick: e => { e.stopPropagation(); panel.classList.add('hidden'); ctx.go('friends') } }))
      if (n.kind === 'invite') actions.push(el('button', { class: 'btn primary', text: t('join'), onclick: async e => {
        e.stopPropagation(); panel.classList.add('hidden')
        const g = await api.getGame(n.payload?.game_id); if (!g) return toast(t('invite_game_gone')); ctx.play(g) } }))
      rows.push(el('div', { class: `notif ${n.read ? '' : 'unread'}` }, avatarEl(n.from_name || '?', '#4da6ff'), el('div', { class: 'grow' }, el('b', { text: text(n) }), el('small', { text: new Date(n.created_at).toLocaleString() })), actions))
    }
    setKids(panel, el('div', { class: 'notif-head' }, el('b', { text: t('notifications') }), ns.length ? el('button', { class: 'link-btn', text: t('notif_clear'), onclick: async () => { await social.clearNotifications(); drawPanel(); refreshBadges() } }) : null),
      rows.length ? rows : el('div', { class: 'empty', text: t('notif_none') }))
    await social.readNotifications().catch(() => {})
    badges.notif = 0; paint()
  }
  bell.onclick = e => { e.stopPropagation(); const open = panel.classList.toggle('hidden') === false; if (open) drawPanel() }
  document.addEventListener('click', e => { if (!panel.contains(e.target) && e.target !== bell) panel.classList.add('hidden') })
  onLang(() => { if (!panel.classList.contains('hidden')) drawPanel() })

  const popup = (title, body, onClick) => {
    if (!settings.notifPopups) return
    const p = el('div', { class: 'popup', onclick: () => { p.remove(); onClick?.() } }, el('b', { text: title }), el('span', { text: body }))
    $('popups').append(p); setTimeout(() => p.remove(), 6000)
    sfx.notify()
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') { try { new Notification(title, { body, icon: '/icons/icon-192.png' }) } catch {} }
  }
  const stopWatch = social.watch(ctx.profile.id, async (kind, row) => {
    if (kind === 'requests') return refreshBadges()
    if (kind === 'message') {
      if (chatOpenWith() === row.from_id) { openedChat.refresh(); return }
      const f = (await social.listFriends(ctx.profile.id)).find(x => x.id === row.from_id)
      if (f) popup(f.username, row.body, () => openChat(ctx, f))
    } else if (kind === 'notification') {
      popup('Blocksy', text(row), () => (row.kind === 'invite' ? api.getGame(row.payload?.game_id).then(g => (g ? ctx.play(g) : toast(t('invite_game_gone')))) : ctx.go('friends')))
    }
    refreshBadges()
  })
  refreshBadges(); const poll = setInterval(refreshBadges, 20000)
  return () => { stopWatch(); clearInterval(poll) }
}
