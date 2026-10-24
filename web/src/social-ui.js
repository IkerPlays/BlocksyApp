// Interfaz social: chat privado, invitaciones y centro de notificaciones
import * as social from './social.js'
import * as api from './api.js'
import { headshot } from './avatar.js'
import { t, onLang, getLang } from './i18n.js'
import { icon } from './icons.js'
import { settings, saveSettings } from './settings.js'
import { sfx } from './sfx.js'
import { el, setKids, toast, avatarEl, closeModal } from './pages.js'
import { attachEmoticons } from './party-ui.js'

const $ = id => document.getElementById(id)
const status = f => (f.is_online ? (f.current_game ? t('status_game') : t('status_online')) : t('status_offline'))
export const dayLabel = iso => { const d = new Date(iso), n = new Date(), y = new Date(Date.now() - 864e5); return d.toDateString() === n.toDateString() ? t('today') : d.toDateString() === y.toDateString() ? t('yesterday') : d.toLocaleDateString(getLang(), { weekday: 'short', day: 'numeric', month: 'short' }) }
export const fmtTime = iso => new Date(iso).toLocaleTimeString(getLang(), { hour: '2-digit', minute: '2-digit' })

// ---------- chat privado ----------
let openedChat = null     // { friendId, add(msg) } mientras la ventana está abierta
const mediaPreview = b => { const m = social.parseMedia(b); return m ? (m.kind === 'img' ? '📷 ' + t('attach_image') : '🎤 ' + t('voice_rec')) : b }
// imagen o nota de voz dentro de un mensaje (la URL firmada se pide al pintar)
function mediaEl(md) {
  if (md.kind === 'img') {
    const img = el('img', { class: 'dm-img', alt: '', loading: 'lazy' }); social.mediaUrl(md.path).then(u => { img.src = u; img.onclick = e => { e.stopPropagation(); window.open(u, '_blank', 'noopener') } }, () => img.replaceWith(el('span', { text: t('media_gone') })))
    return img
  }
  const a = el('audio', { class: 'dm-voice', controls: '', preload: 'none' }); social.mediaUrl(md.path).then(u => { a.src = u }, () => a.replaceWith(el('span', { text: t('media_gone') })))
  a.onclick = e => e.stopPropagation()
  return el('div', { class: 'dm-voice-box' }, el('small', { text: '🎤 ' + md.secs + ' s' }), a)
}
export function openChat(ctx, friend) {
  const me = ctx.profile
  const list = el('div', { class: 'dm-list' }), input = el('input', { placeholder: t('chat_ph'), maxlength: 500, autocomplete: 'off' })
  let shown = '', editing = null, selected = null
  // Se repinta toda la conversación (así se ven también los mensajes editados o borrados por el otro lado)
  function draw(msgs) {
    const sig = JSON.stringify(msgs.map(m => [m.id, m.body, m.edited_at])) + editing + selected
    if (sig === shown) return; shown = sig
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60 || !list.children.length
    if (!msgs.length) return setKids(list, el('div', { class: 'empty', text: t('chat_empty') }))
    let lastDay = ''
    setKids(list, msgs.flatMap(m => {
      const day = new Date(m.created_at).toDateString(), sep = day !== lastDay ? el('div', { class: 'dm-day', text: dayLabel(m.created_at) }) : null; lastDay = day
      return [sep, dmRow(m)]
    }))
    function dmRow(m) {
      const mine = m.from_id === me.id
      if (editing === m.id) {
        const ei = el('input', { value: m.body, maxlength: 500, class: 'dm-edit' })
        const save = async () => { const v = ei.value.trim(); editing = null; if (v && v !== m.body) { try { await social.editMessage(m.id, v) } catch (e) { toast(e.message) } } refresh(true) }
        ei.onkeydown = e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { editing = null; refresh(true) } }
        setTimeout(() => ei.focus(), 0)
        return el('div', { class: 'dm mine' }, el('div', { class: 'bubble' }, ei, el('div', { class: 'dm-actions show' }, el('button', { class: 'btn', text: t('save'), onclick: save }), el('button', { class: 'btn', text: t('cancel'), onclick: () => { editing = null; refresh(true) } }))))
      }
      const isMedia = !!social.parseMedia(m.body)
      const acts = mine ? el('div', { class: `dm-actions ${selected === m.id ? 'show' : ''}` },
        isMedia ? null : el('button', { class: 'btn', html: icon('edit', 14), title: t('edit'), onclick: e => { e.stopPropagation(); editing = m.id; refresh(true) } }),
        el('button', { class: 'btn danger', html: icon('trash', 14), title: t('delete'), onclick: async e => { e.stopPropagation(); if (confirm(t('msg_confirm_delete'))) { try { await social.deleteMessage(m.id); const md = social.parseMedia(m.body); if (md) social.removeMedia(md.path) } catch (er) { toast(er.message) } refresh(true) } } })) : null
      const media = social.parseMedia(m.body)
      return el('div', { class: `dm ${mine ? 'mine' : ''}`, onclick: () => { if (mine) { selected = selected === m.id ? null : m.id; refresh(true) } } },
        el('div', { class: 'bubble' }, media ? mediaEl(media) : el('span', { text: m.body }), el('small', { text: (m.edited_at ? t('msg_edited') + ' · ' : '') + fmtTime(m.created_at) })), acts)
    }
    if (atBottom) list.scrollTop = list.scrollHeight
  }
  let last = []
  const form = el('form', { class: 'dm-form', onsubmit: async e => {
    e.preventDefault(); const body = input.value.trim(); if (!body) return; input.value = ''
    try { await social.sendMessage(friend.id, body); await refresh() } catch (er) { toast(er.message) }
  } }, input, el('button', { class: 'btn blue', html: icon('send', 18), title: t('send') }))
  // adjuntar imagen y grabar nota de voz
  const fileIn = el('input', { type: 'file', accept: 'image/*', class: 'hidden' })
  fileIn.onchange = async () => { const f = fileIn.files[0]; fileIn.value = ''; if (!f) return; try { await social.sendImage(friend.id, me.id, f); await refresh() } catch (er) { toast(t('media_fail', { e: er.message })) } }
  let rec = null
  const micBtn = el('button', { type: 'button', class: 'btn', html: icon('mic', 18), title: t('voice_rec') })
  const stopRec = send => { if (!rec) return; rec.send = send; rec.mr.state !== 'inactive' && rec.mr.stop() }
  micBtn.onclick = async () => {
    if (rec) return stopRec(true)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return toast(t('voice_unsupported'))
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }), mr = new MediaRecorder(stream), chunks = [], t0 = Date.now()
      rec = { mr, send: true }; micBtn.classList.add('rec'); micBtn.textContent = '■ 0s'
      const tick = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); micBtn.textContent = '■ ' + s + 's'; if (s >= 60) stopRec(true) }, 500)
      mr.ondataavailable = e => e.data.size && chunks.push(e.data)
      mr.onstop = async () => {
        clearInterval(tick); stream.getTracks().forEach(x => x.stop()); const doSend = rec?.send; rec = null; micBtn.classList.remove('rec'); micBtn.innerHTML = icon('mic', 18)
        const secs = (Date.now() - t0) / 1000
        if (!doSend || secs < 0.7) return
        try { await social.sendVoice(friend.id, me.id, new Blob(chunks, { type: mr.mimeType || 'audio/webm' }), secs); await refresh() } catch (er) { toast(t('media_fail', { e: er.message })) }
      }
      mr.start()
    } catch { toast(t('voice_denied')) }
  }
  form.insertBefore(el('button', { type: 'button', class: 'btn', html: icon('camera', 18), title: t('attach_image'), onclick: () => fileIn.click() }), input)
  form.insertBefore(micBtn, input); form.append(fileIn)
  async function refresh(local) {
    if (!local || !last.length) last = await social.conversation(me.id, friend.id)
    shown = ''; draw(last)
    if (!local) social.markRead(friend.id).then(() => ctx.refreshBadges?.(), () => {})
  }
  const card = $('modal-card')
  setKids(card, el('div', { class: 'dm-card' },
    el('div', { class: 'dm-head' }, avatarEl(friend.username, friend.avatar_color, friend.is_online), el('div', { class: 'grow' }, el('b', { text: t('chat_with', { name: friend.username }) }), el('small', { text: status(friend) })),
      el('button', { class: 'btn', text: t('close'), onclick: () => { stop(); closeModal() } })),
    list, attachEmoticons(input), form))
  $('modal').classList.remove('hidden'); refresh(); input.focus()
  const timer = setInterval(() => { if (!editing) refresh() }, 4000)
  const stop = () => { clearInterval(timer); openedChat = null; stopRec(false) }
  openedChat = { friendId: friend.id, refresh, stop }
  const mo = new MutationObserver(() => { if ($('modal').classList.contains('hidden')) { stop(); mo.disconnect() } })
  mo.observe($('modal'), { attributes: true, attributeFilter: ['class'] })
}
export const chatOpenWith = () => openedChat?.friendId

// ---------- invitar amigos al juego actual ----------
export async function openInvite(ctx, game) {
  const gid = game.parentId ?? game.id
  const card = $('modal-card')
  setKids(card, el('div', { class: 'detail-col' }, el('h2', { text: t('invite_title') }), el('div', { class: 'empty', text: t('loading') })))
  $('modal').classList.remove('hidden')
  const friends = (await social.listFriends(ctx.profile.id)).filter(f => f.is_online)
  const rows = friends.length ? friends.map(f => {
    const b = el('button', { class: 'btn blue', text: t('invite'), onclick: async () => { b.disabled = true; try { await social.inviteFriend(f.id, gid, game.name); toast(t('invite_sent', { name: f.username })); b.textContent = '✓' } catch (e) { toast(e.message); b.disabled = false } } })
    return el('div', { class: 'person' }, avatarEl(f.username, f.avatar_color, true), el('div', { class: 'grow' }, el('b', { text: f.username }), el('small', { text: status(f) })), b)
  }) : el('div', { class: 'empty', text: t('invite_none') })
  const all = friends.length > 1 ? el('button', { class: 'btn primary wide', text: t('invite_all'), onclick: async e => { e.target.disabled = true; let n = 0; for (const f of friends) { try { await social.inviteFriend(f.id, gid, game.name); n++ } catch {} } toast(t('invite_all_done', { n })) } }) : null
  setKids(card, el('div', { class: 'detail-col' }, el('h2', { text: t('invite_title') }), all, el('div', { class: 'panel' }, rows),
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
        const g = await api.getGame(n.payload?.game_id); if (!g) return toast(t('invite_game_gone')); ctx.play(g, { room: api.roomFromName(n.payload?.game_name) }) } }))
      rows.push(el('div', { class: `notif ${n.read ? '' : 'unread'}` }, avatarEl(n.from_name || '?', '#4da6ff'), el('div', { class: 'grow' }, el('b', { text: text(n) }), el('small', { text: new Date(n.created_at).toLocaleString(getLang()) })), actions))
    }
    setKids(panel, el('div', { class: 'notif-head' }, el('b', { text: t('notifications') }), el('button', { class: 'link-btn', text: settings.dnd ? t('dnd_off') : t('dnd_on'), onclick: () => { settings.dnd = !settings.dnd; saveSettings(); bell.classList.toggle('dnd', !!settings.dnd); drawPanel() } }), ns.length ? el('button', { class: 'link-btn', text: t('notif_clear'), onclick: async () => { await social.clearNotifications(); drawPanel(); refreshBadges() } }) : null),
      rows.length ? rows : el('div', { class: 'empty', text: t('notif_none') }))
    await social.readNotifications().catch(() => {})
    badges.notif = 0; paint()
  }
  bell.onclick = e => { e.stopPropagation(); const open = panel.classList.toggle('hidden') === false; if (open) drawPanel() }
  document.addEventListener('click', e => { if (!panel.contains(e.target) && e.target !== bell) panel.classList.add('hidden') })
  onLang(() => { if (!panel.classList.contains('hidden')) drawPanel() })

  const popup = (title, body, onClick, kind = 'message') => {
    if (!settings.notifPopups || settings.dnd || settings.nt?.[kind] === false) return
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
      if (f) popup(f.username, mediaPreview(row.body), () => openChat(ctx, f))
    } else if (kind === 'notification') {
      popup('Blocksy', text(row), () => (row.kind === 'invite' ? api.getGame(row.payload?.game_id).then(g => (g ? ctx.play(g, { room: api.roomFromName(row.payload?.game_name) }) : toast(t('invite_game_gone')))) : ctx.go('friends')), row.kind)
    }
    refreshBadges()
  })
  bell.classList.toggle('dnd', !!settings.dnd)
  refreshBadges(); const poll = setInterval(refreshBadges, 20000)
  return () => { stopWatch(); clearInterval(poll) }
}
