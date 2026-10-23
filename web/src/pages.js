import * as auth from './auth.js'
import * as api from './api.js'
import * as social from './social.js'
import { settings, saveSettings, resetSettings, lastPlayed, recentGames, getStats, applyTheme } from './settings.js'
import { icon } from './icons.js'
import { headshot, styleFor, EMOTES, createPreview, loadoutStyle, parseLoadout, packLoadout, PALETTES, defaultLook, randomLook } from './avatar.js'
import { t, LANGS, langName, getPref, setLang, onLang } from './i18n.js'
import { codeEditor } from './studio-ui.js'
import { partyPanel, attachEmoticons } from './party-ui.js'
import { installApp, canInstall, isInstalled, askNotifications, checkForUpdate, applyUpdate, isUpdateReady, BUILD } from './pwa.js'

const $ = id => document.getElementById(id)
export function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v
    else if (k === 'style') e.style.cssText = v
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else if (k === 'text') e.textContent = v
    else if (k === 'html') e.innerHTML = v
    else if (v === false || v == null) continue
    else e.setAttribute(k, v === true ? '' : v)
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k)
  return e
}
// Como replaceChildren pero acepta arrays anidados y descarta null/false
export function setKids(node, ...kids) { node.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false)) }
export function toast(msg) {
  const tt = $('toast'); tt.textContent = msg; tt.classList.remove('hidden')
  clearTimeout(toast.t); toast.t = setTimeout(() => tt.classList.add('hidden'), 2800)
}
const hueOf = id => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360; return h }
// Foto de perfil = la cabeza del avatar (mismo aspecto que el modelo 3D)
export const avatarEl = (name, color, online) => {
  const a = el('span', { class: 'avatar', style: `--c:${color};--img:url(${headshot(name, color)})` })
  if (online != null) a.append(el('span', { class: `dot ${online ? 'on' : ''}` }))
  return a
}
const avatar = avatarEl
const statusText = f => (f.is_online ? (f.current_game ? t('status_game') : t('status_online')) : t('status_offline'))
const MODES = ['build', 'social', 'obby', 'arena']
const modeLabel = m => t('mode_' + (m || 'build'))

// ---------- tarjetas de juego ----------
function roomBox(g, onPlay) {
  const input = el('input', { placeholder: t('room_code'), maxlength: 12, style: 'text-transform:uppercase;flex:1' })
  const go = c => { const v = String(c ?? input.value).trim(); if (v.length >= 3) { closeModal(); onPlay(g, { room: v }) } else toast(t('room_bad')) }
  return el('div', { class: 'room-box' }, el('small', { text: t('room_title') }), el('div', { class: 'form-row' }, input,
    el('button', { class: 'btn', text: t('room_new'), onclick: () => go(Math.random().toString(36).slice(2, 7).toUpperCase()) }), el('button', { class: 'btn', text: t('room_join'), onclick: () => go() })))
}
function voteBox(g) {
  const up = el('button', { class: 'btn', text: '+' }), down = el('button', { class: 'btn', text: '-' }), box = el('div', { class: 'form-row vote-box' }, up, down)
  const paint = v => { const x = v?.[g.id] ?? { up: 0, down: 0, mine: 0 }; up.textContent = `${t('like')} ${x.up}`; down.textContent = `${t('dislike')} ${x.down}`; up.classList.toggle('on', x.mine === 1); down.classList.toggle('on', x.mine === -1) }
  social.gameVotes().then(paint)
  for (const [b, v] of [[up, 1], [down, -1]]) b.onclick = async () => { try { await social.voteGame(g.id, v); paint(await social.gameVotes()) } catch (e) { toast(e.message) } }
  return box
}
function favBtn(g) {
  const b = el('button', { class: 'btn wide', text: '...' }), paint = on => { b.textContent = t(on ? 'fav_remove' : 'fav_add'); b.classList.toggle('on', on) }
  social.myFavorites().then(s => paint(s.has(g.id)))
  b.onclick = async () => { try { paint(await social.toggleFavorite(g.id)) } catch (e) { toast(e.message) } }
  return b
}
function gameCard(g, counts, onOpen) {
  const n = counts[g.id] ?? 0
  const thumb = el('div', { class: 'thumb', style: `--h:${g.hue ?? hueOf(g.id)}` }, el('div', { class: 'cube' }),
    n ? el('span', { class: 'live', text: t('playing_n', { n }) }) : null, el('span', { class: 'mode-tag', text: modeLabel(g.mode) }))
  return el('div', { class: 'gcard', onclick: () => onOpen(g) }, thumb,
    el('div', { class: 'gname', text: g.name }), el('div', { class: 'gmeta', text: t('by', { name: g.owner_name || 'Blocksy' }) }))
}
const grid = (games, counts, onOpen) => games.length
  ? el('div', { class: 'grid' }, games.map(g => gameCard(g, counts, onOpen)))
  : el('div', { class: 'empty', text: t('no_games') })

export function openGameModal(g, counts, onPlay) {
  const m = $('modal'), card = $('modal-card'), n = counts[g.id] ?? 0
  setKids(card, el('div', { class: 'detail' },
    el('div', { class: 'thumb', style: `--h:${g.hue ?? hueOf(g.id)}` }, el('div', { class: 'cube' })),
    el('div', {}, el('h2', { text: g.name }),
      el('small', { style: 'color:var(--muted)', text: `${t('by', { name: g.owner_name || 'Blocksy' })} · ${modeLabel(g.mode)}` }),
      el('div', { class: 'stats' },
        el('div', {}, el('b', { text: String(n) }), el('small', { text: t('playing_n', { n: '' }).trim() })),
        el('div', {}, el('b', { text: String(g.max_players) }), el('small', { text: t('max_players') })),
        el('div', {}, el('b', { text: 'Web + 3DS' }), el('small', { text: t('platforms') }))),
      el('p', { text: g.description || t('no_desc') }),
      el('button', { class: 'btn primary wide', text: t('play'), onclick: () => { closeModal(); onPlay(g) } }),
      voteBox(g),
      favBtn(g),
      roomBox(g, onPlay),
      el('button', { class: 'btn wide', text: t('close'), onclick: closeModal }))))
  m.classList.remove('hidden')
}
const skeletons = n => el('div', { class: 'grid' }, Array.from({ length: n }, () => el('div', {}, el('div', { class: 'skel card' }), el('div', { class: 'skel line' }))))
export const closeModal = () => $('modal').classList.add('hidden')

// Las páginas se repintan al cambiar de idioma; guardamos la última para repintarla
let refreshTimer = null
const every = (fn, ms) => { clearInterval(refreshTimer); refreshTimer = setInterval(() => { if (!document.hidden) fn() }, ms) }
export const stopPageTimers = () => clearInterval(refreshTimer)

function openReport(name) {
  const reasons = ['spam', 'abuse', 'cheating', 'inappropriate', 'other']
  const sel = el('select', {}, reasons.map(r => el('option', { value: r, text: t('rep_' + r) })))
  const det = el('textarea', { class: 'bio-edit', rows: 3, maxlength: 300, placeholder: t('rep_details') })
  setKids($('modal-card'), el('div', { class: 'detail-col' }, el('h2', { text: t('report') + ': ' + name }), el('label', { class: 'field' }, t('rep_reason'), sel), det,
    el('div', { class: 'form-row' }, el('button', { class: 'btn danger', text: t('report'), onclick: async () => { try { await social.reportUser(name, sel.value, det.value); toast(t('rep_sent')); closeModal() } catch (e) { toast(e.message) } } }), el('button', { class: 'btn', text: t('cancel'), onclick: closeModal }))))
  $('modal').classList.remove('hidden')
}
export { openReport }

// ---------- páginas ----------
// ctx = { profile, play(game), go(hash), refreshProfile() }
export const pages = {
  async home(root, ctx) {
    setKids(root, el('div', { class: 'section' }, el('h2', { text: t('loading') })), skeletons(4))
    const [games, counts, friends] = await Promise.all([api.listGames(), api.playerCounts(), social.listFriends(ctx.profile.id)])
    const open = g => openGameModal(g, counts, ctx.play)
    const popular = [...games].sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))
    const last = games.find(g => g.id === lastPlayed())
    const friendsRow = el('div'), favRow = el('div'), recentRow = el('div')
    { const rg = recentGames().map(id => games.find(g => g.id === id)).filter(Boolean).slice(0, 6); if (rg.length) setKids(recentRow, el('div', { class: 'section' }, el('h2', { text: t('recent') })), grid(rg, counts, open)) }
    social.myFavorites().then(s => { const fg = games.filter(g => s.has(g.id)); if (fg.length) setKids(favRow, el('div', { class: 'section' }, el('h2', { text: t('favorites') })), grid(fg, counts, open)) })
    const paintFriends = list => setKids(friendsRow, list.length
      ? el('div', { class: 'row-scroll' }, list.map(f => el('a', { class: 'friend', href: `/u/${encodeURIComponent(f.username)}` },
          avatar(f.username, f.avatar_color, f.is_online), el('b', { text: f.username }), el('small', { text: statusText(f) }))))
      : el('div', { class: 'empty', text: t('home_no_friends') }))
    paintFriends(friends)
    setKids(root,
      el('div', { class: 'hero' }, avatar(ctx.profile.username, ctx.profile.avatar_color), el('h1', { text: t('hello', { name: ctx.profile.username }) })),
      el('div', { class: 'section' }, el('h2', { text: t('friends_n', { n: friends.length }) }), el('a', { href: '/friends', text: t('see_all') })), friendsRow,
      last ? [el('div', { class: 'section' }, el('h2', { text: t('continue') })), grid([last], counts, open)] : null,
      recentRow, favRow,
      el('div', { class: 'section' }, el('h2', { text: t('popular') }), el('a', { href: '/discover', text: t('see_all') })),
      grid(popular.slice(0, 12), counts, open),
      el('div', { class: 'section' }, el('h2', { text: t('newest') })),
      grid([...games].reverse().slice(0, 12), counts, open))
    every(async () => { paintFriends(await social.listFriends(ctx.profile.id)) }, 10_000)
  },

  async discover(root, ctx, query = '') {
    setKids(root, el('h1', { class: 'page-title', text: t('discover') }), skeletons(8))
    const [games, counts] = await Promise.all([api.listGames(), api.playerCounts()])
    const input = el('input', { placeholder: t('search_ph'), value: query })
    let modeSel = '', tagSel = '', sortSel = 'popular'; const votes = await social.gameVotes()
    const tagsOf = g => (Array.isArray(g.config?.tags) ? g.config.tags : [])
    const allTags = [...new Set(games.flatMap(tagsOf))].slice(0, 14)
    const sortBy = { popular: (a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0), newest: () => 0, az: (a, b) => a.name.localeCompare(b.name), liked: (a, b) => ((votes[b.id]?.up ?? 0) - (votes[b.id]?.down ?? 0)) - ((votes[a.id]?.up ?? 0) - (votes[a.id]?.down ?? 0)) }
    const sortEl = el('select', { onchange: e => { sortSel = e.target.value; draw() } }, ['popular', 'newest', 'az', 'liked'].map(k => el('option', { value: k, text: t('sort_' + k) })))
    const chips = el('div', { class: 'chips' })
    const out = el('div')
    const draw = () => {
      const q = input.value.trim().toLowerCase()
      setKids(chips, el('button', { class: `chip ${modeSel === '' ? 'on' : ''}`, text: t('see_all'), onclick: () => { modeSel = ''; draw() } }), MODES.map(m => el('button', { class: `chip ${modeSel === m ? 'on' : ''}`, text: modeLabel(m), onclick: () => { modeSel = m; draw() } })))
      setKids(out, grid((sortSel === 'newest' ? [...games].reverse() : [...games].sort(sortBy[sortSel])).filter(g => (!modeSel || (g.mode ?? 'build') === modeSel) && (!tagSel || tagsOf(g).includes(tagSel)) && (!q || g.name.toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q))), counts, g => openGameModal(g, counts, ctx.play)))
    }
    input.oninput = draw; draw()
    setKids(root, el('h1', { class: 'page-title', text: t('discover') }), el('div', { class: 'form-row', style: 'margin-bottom:12px' }, input, sortEl), chips, allTags.length ? el('div', { class: 'chips tags' }, allTags.map(tg => el('button', { class: 'chip', text: '#' + tg, onclick: e => { tagSel = tagSel === tg ? '' : tg; e.target.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.textContent === '#' + tagSel)); draw() } }))) : null, out)
  },

  // Tienda: BCoins, sombreros, títulos y cofres de botín
  async shop(root, ctx) {
    setKids(root, el('h1', { class: 'page-title', text: t('loading') }))
    const [items, w0] = await Promise.all([social.listShop(), social.loadWallet()])
    const canvas = el('canvas', { class: 'avatar-3d' }), coins = el('b', { class: 'coin-big' }), daily = el('div'), body = el('div')
    let pv = null, tryOn = null
    const equipped = () => social.getWallet()?.equipped ?? {}
    const owned = () => new Set(social.getWallet()?.inventory ?? [])
    const style = () => loadoutStyle(styleFor(ctx.profile.username, ctx.profile.avatar_color), { ...parseLoadout(packLoadout(equipped())), ...(tryOn ? { [tryOn.kind]: tryOn.id } : {}) })
    const rarity = r => el('span', { class: `rarity ${r}`, text: t('rar_' + r) })
    const price = n => el('span', { class: 'price', html: icon('coin', 16) + ' ' + n })
    const run = async fn => { try { await fn() } catch (e) { toast(/not enough/i.test(e.message) ? t('shop_no_coins') : /already/i.test(e.message) ? t('shop_owned') : e.message) } draw() }
    function paintDaily() {
      const wl = social.getWallet()
      setKids(daily, el('div', { class: 'panel daily' }, el('div', {}, el('b', { text: t('shop_daily') }), el('small', { text: t('shop_streak', { n: wl?.streak ?? 0 }) })),
        wl?.can_claim ? el('button', { class: 'btn primary', html: icon('gift', 16) + ' ' + t('shop_claim'), onclick: () => run(async () => { const r = await social.claimDaily(); toast(t('shop_got', { n: r.amount })) }) })
          : el('span', { class: 'muted', text: t('shop_come_back') })))
    }
    function card(it) {
      const have = owned().has(it.id), eq = equipped()[it.kind] === it.id
      const btns = []
      if (it.kind === 'crate') btns.push(el('button', { class: 'btn blue', html: icon('gift', 16) + ' ' + t('shop_open'), onclick: () => run(async () => { const r = await social.openCrate(it.id); showReward(r) }) }))
      else if (have) {
        btns.push(el('button', { class: `btn ${eq ? '' : 'primary'}`, text: eq ? t('shop_unequip') : t('shop_equip'), onclick: () => run(async () => { eq ? await social.unequipSlot(it.kind) : await social.equipItem(it.id); tryOn = null; pv?.setStyle(style()) }) }))
      } else btns.push(el('button', { class: 'btn blue', text: t('shop_buy'), onclick: () => run(async () => { await social.buyItem(it.id); toast(t('shop_bought', { name: it.name })) }) }))
      if (['hat', 'face', 'back'].includes(it.kind) && !eq) btns.push(el('button', { class: 'btn', text: t('shop_try'), onclick: () => { tryOn = { kind: it.kind, id: it.id }; pv?.setStyle(style()) } }))
      return el('div', { class: `shop-card ${it.rarity}` }, el('div', { class: 'sc-top' }, el('b', { text: it.name }), rarity(it.rarity)), el('small', { text: it.description }),
        el('div', { class: 'sc-bot' }, it.kind === 'crate' || !have ? price(it.price) : el('span', { class: 'owned', text: eq ? t('shop_equipped') : t('shop_owned') }), el('div', { class: 'sc-btns' }, btns)))
    }
    function showReward(r) {
      const it = items.find(i => i.id === r.item)
      setKids($('modal-card'), el('div', { class: `detail-col reward ${it?.rarity ?? ''}` }, el('div', { class: 'big-ico', html: icon('gift', 44) }), el('h2', { text: it?.name ?? r.item }), rarity(it?.rarity ?? 'common'),
        el('p', { text: r.duplicate ? t('shop_dup', { n: r.refund }) : t('shop_new') }), el('button', { class: 'btn wide primary', text: t('close'), onclick: closeModal })))
      $('modal').classList.remove('hidden')
    }
    function draw() {
      coins.innerHTML = icon('coin', 22) + ' ' + (social.getWallet()?.bcoins ?? 0)
      paintDaily(); pv?.setStyle(style())
      const sec = (title, kind) => { const l = items.filter(i => i.kind === kind); return l.length ? [el('div', { class: 'section' }, el('h2', { text: title })), el('div', { class: 'shop-grid' }, l.map(card))] : null }
      setKids(body, sec(t('shop_crates'), 'crate'), sec(t('shop_hats'), 'hat'), sec(t('shop_faces'), 'face'), sec(t('shop_backs'), 'back'), sec(t('shop_trails'), 'trail'), sec(t('shop_pets'), 'pet'), sec(t('shop_titles'), 'title'))
    }
    const missionsBox = el('div')
    const paintMissions = async () => {
      let ms = []; try { ms = await social.getMissions() } catch {}
      setKids(missionsBox, ms.length ? [el('div', { class: 'section' }, el('h2', { text: t('missions') })), el('div', { class: 'panel' }, ms.map(m => el('div', { class: 'person' },
        el('div', { class: 'grow' }, el('b', { text: t('mis_' + m.key) }), el('div', { class: 'prog' }, el('i', { style: `width:${Math.round(m.n / m.goal * 100)}%` })), el('small', { text: `${m.n}/${m.goal}` })),
        el('span', { class: 'price', html: icon('coin', 16) + ' ' + m.reward }),
        m.claimed ? el('span', { class: 'owned', text: t('mis_done') }) : el('button', { class: 'btn primary', text: t('shop_claim'), disabled: m.n < m.goal, onclick: () => run(async () => { await social.claimMission(m.key); toast(t('shop_got', { n: m.reward })); paintMissions() }) }))))] : null)
    }
    setKids(root, el('div', { class: 'section' }, el('h1', { class: 'page-title', text: t('nav_shop') }), coins), daily, missionsBox,
      el('div', { class: 'shop-layout' }, el('div', { class: 'preview' }, canvas), body))
    pv = createPreview(canvas, style()); draw(); paintMissions()
  },

  // Perfil: /profile (el tuyo) o /u/<usuario>
  async profile(root, ctx, name) {
    setKids(root, el('h1', { class: 'page-title', text: t('loading') }))
    const { data: p, error } = await social.getProfile(name, ctx.profile.id)
    if (error || !p) return setKids(root, el('h1', { class: 'page-title', text: t('nav_profile') }), el('div', { class: 'empty', text: error ? `${t('err_generic')}: ${error.message}` : t('p_not_found') }))
    const self = p.relation === 'self', canvas = el('canvas', { class: 'avatar-3d' })
    const extraBox = el('div')
    const stat = (v, k) => el('div', { class: 'stat' }, el('b', { text: String(v) }), el('small', { text: k }))
    const actions = el('div', { class: 'form-row profile-actions' }), bioBox = el('div'), games = el('div'), friendsBox = el('div'), titleBox = el('div', { class: 'p-title' })
    const reload = () => pages.profile(root, ctx, name)
    const gameName = {}; let mine0 = []
    const paintActions = async () => {
      const btn = (cls, text, fn) => el('button', { class: `btn ${cls}`, text, onclick: async () => { try { await fn(); } catch (e) { toast(e.message) } } })
      const A = []
      if (self) A.push(el('a', { class: 'btn blue', href: '/avatar', text: t('p_edit_avatar') }))
      else if (p.relation === 'friends') {
        A.push(btn('blue', t('chat'), async () => { const { openChat } = await import('./social-ui.js'); openChat(ctx, { id: p.id, username: p.username, avatar_color: p.avatar_color, is_online: p.is_online, current_game: p.current_game }) }))
        if (p.is_online && p.current_game) { const g = await api.getGame(p.current_game); if (g) A.push(btn('primary', `${t('join')} · ${g.name}`, async () => ctx.play(g))) }
        A.push(btn('', t('remove'), async () => { if (confirm(t('confirm_remove', { name: p.username }))) { await social.removeFriend(p.id); reload() } }))
      } else if (p.relation === 'pending_in') {
        A.push(btn('primary', t('accept'), async () => { await social.respondRequest(p.request_id, true); reload() }), btn('', t('decline'), async () => { await social.respondRequest(p.request_id, false); reload() }))
      } else if (p.relation === 'pending_out') A.push(btn('', t('cancel_req'), async () => { await social.cancelRequest(p.request_id); reload() }))
      else A.push(btn('blue', t('add_friend'), async () => { const r = await social.sendRequest(p.username); toast(t(r === 'sent' ? 'req_sent' : r === 'accepted' ? 'req_accepted' : r === 'already_sent' ? 'req_already' : 'req_friends', { name: p.username })); reload() }))
      if (!self) {
        const blocked = social.isBlockedName(p.username)
        A.push(btn('', t(blocked ? 'unblock' : 'block'), async () => { if (blocked) await social.unblockUser(p.username); else if (confirm(t('block_confirm', { name: p.username }))) await social.blockUser(p.username); reload() }),
          btn('', t('report'), () => openReport(p.username)))
      }
      A.push(btn('', t('p_copy'), async () => { const url = `${location.origin}/u/${p.username}`; try { await navigator.clipboard.writeText(url); toast(t('link_copied')) } catch { prompt(t('copy_link'), url) } }))
      setKids(actions, A)
    }
    const paintBio = () => {
      if (!self) return setKids(bioBox, el('p', { class: p.bio ? '' : 'muted', text: p.bio || t('p_no_bio') }))
      const ta = el('textarea', { class: 'bio-edit', maxlength: 160, placeholder: t('p_bio_ph'), rows: 3 }); ta.value = p.bio || ''
      setKids(bioBox, ta, el('button', { class: 'btn', style: 'margin-top:8px', text: t('save'), onclick: async () => { const { error: e } = await social.setBio(ctx.profile.id, ta.value.trim()); if (e) toast(e.message); else { p.bio = ta.value.trim(); toast(t('saved')) } } }))
    }
    const status = self || p.relation === 'friends' ? (p.is_online ? (p.current_game ? t('status_game') : t('status_online')) : t('status_offline')) : ''
    setKids(root, el('div', { class: 'panel profile-card' },
      el('div', { class: 'preview' }, canvas),
      el('div', { class: 'profile-info' },
        el('h1', { class: 'page-title', style: 'margin-bottom:4px', text: p.username }),
        titleBox,
        status ? el('div', { class: 'p-status' }, el('span', { class: `dot-i ${p.is_online ? 'on' : ''}` }), status) : null,
        el('small', { style: 'color:var(--muted)', text: self ? t('p_you') : t('p_joined', { date: new Date(p.created_at).toLocaleDateString() }) }),
        bioBox, extraBox,
        el('div', { class: 'stats-row', style: 'margin:14px 0' }, stat(p.friend_count, t('p_friends')), stat(mine0.length, t('p_games'))), actions)),
      el('div', { class: 'section' }, el('h2', { text: t('p_games') })), games,
      self ? [el('div', { class: 'section' }, el('h2', { text: t('friends_n', { n: '' }).replace('()', '').trim() })), friendsBox] : null)
    const pv = createPreview(canvas, { ...styleFor(p.username, p.avatar_color), ...loadoutStyle({}, parseLoadout(packLoadout(p.equipped))) }); pv.setAnim('wave')
    if (p.equipped?.title) social.listShop().then(items => { const it = items.find(i => i.id === p.equipped.title); if (it) titleBox.textContent = it.data?.text ?? it.name }).catch(() => {})
    paintBio(); paintActions()
    social.profileExtra(p.username).then(x => { if (!x) return; if (x.look) pv.setStyle(loadoutStyle(styleFor(p.username, p.avatar_color), parseLoadout(packLoadout(p.equipped, x.look)))); const hrs = Math.floor(x.play_seconds / 3600), mins = Math.floor(x.play_seconds % 3600 / 60); const bd = [...(x.badges ?? []), ...(mine0.length ? ['creator'] : [])]
      setKids(extraBox, el('div', { class: 'badges' }, bd.map(b => el('span', { class: 'badge', title: t('badge_' + b + '_d'), text: t('badge_' + b) }))), el('small', { style: 'display:block;color:var(--muted);margin:6px 0', text: `${t('stat_time')}: ${hrs}h ${mins}m${x.last_seen && !p.is_online ? ` · ${t('last_seen')}: ${new Date(x.last_seen).toLocaleString()}` : ''}` })) })
    await social.myBlocked()
    const [all, counts] = await Promise.all([api.listGames(), api.playerCounts()])
    const mine = all.filter(g => g.owner_id === p.id); mine0 = mine
    setKids(games, mine.length ? grid(mine, counts, g => openGameModal(g, counts, ctx.play)) : el('div', { class: 'empty', text: t('p_no_games') }))
    if (self) { const fl = await social.listFriends(ctx.profile.id); setKids(friendsBox, fl.length ? el('div', { class: 'row-scroll' }, fl.map(f => el('a', { class: 'friend', href: `/u/${encodeURIComponent(f.username)}` }, avatar(f.username, f.avatar_color, f.is_online), el('b', { text: f.username }), el('small', { text: statusText(f) })))) : el('div', { class: 'empty', text: t('no_friends') })) }
    every(() => {}, 60_000)
  },

  async avatar(root, ctx) {
    const colors = ['#4da6ff', '#ff9f43', '#2ecc71', '#e74c3c', '#9b59b6', '#f1c40f', '#1abc9c', '#ff6b9d', '#ecf0f1', '#95a5a6']
    let sel = ctx.profile.avatar_color
    const canvas = el('canvas', { class: 'avatar-3d' })
    const custom = el('input', { type: 'color', value: sel, style: 'width:56px;height:40px;border:0;background:none' })
    const sw = el('div', { class: 'swatches' })
    let pv = null
    await social.loadWallet().catch(() => {})
    let lookCode = social.getLook(); await social.loadLook(ctx.profile.username).then(c => (lookCode = c)).catch(() => {})
    const style = () => loadoutStyle(styleFor(ctx.profile.username, sel), parseLoadout(packLoadout(social.getWallet()?.equipped, lookCode)))
    const paint = () => {
      pv?.setStyle(style()); custom.value = sel
      setKids(sw, ...colors.map(c => el('div', { class: `swatch ${c === sel ? 'sel' : ''}`, style: `--c:${c}`, onclick: () => { sel = c; paint() } })), custom)
    }
    custom.oninput = () => { sel = custom.value; pv?.setStyle(style()) }
    // Aspecto: piel, pelo, peinado y pantalón (los demás lo ven igual); aleatorio y atuendos guardados
    const lookBox = el('div'), outfitBox = el('div')
    const lk = () => { const d = defaultLook(ctx.profile.username), a = lookCode.split('.'); return [0, 1, 2, 3].map(i => (a[i] !== undefined && a[i] !== '' ? Number(a[i]) : d[i])) }
    const setLookAt = (i, v) => { const cur = lk(); cur[i] = v; lookCode = cur.join('.'); paintLook(); pv?.setStyle(style()) }
    const paintLook = () => {
      const cur = lk(), row = (title, i, items) => [el('div', { class: 'section-s', text: title }), el('div', { class: 'swatches' }, items.map((c, k) => el('div', { class: `swatch ${cur[i] === k ? 'sel' : ''}`, style: `--c:${c}`, onclick: () => setLookAt(i, k) })))]
      setKids(lookBox, row(t('look_skin'), 0, PALETTES.skin), row(t('look_hair'), 1, PALETTES.hair),
        el('div', { class: 'section-s', text: t('look_style') }), el('div', { class: 'acc-row' }, [0, 1, 2].map(k => el('button', { class: `acc-chip ${cur[2] === k ? 'on' : ''}`, text: t('hairstyle_' + k), onclick: () => setLookAt(2, k) }))),
        row(t('look_pants'), 3, PALETTES.pants),
        el('div', { class: 'acc-row', style: 'margin-top:8px' }, el('button', { class: 'btn', text: t('look_random'), onclick: () => { lookCode = randomLook(); sel = colors[Math.floor(Math.random() * colors.length)]; paintLook(); paint() } }), el('button', { class: 'btn', text: t('look_reset'), onclick: () => { lookCode = ''; paintLook(); pv?.setStyle(style()) } })))
    }
    const outfits = () => { try { return JSON.parse(localStorage.getItem('blocksy.outfits') || '[]') } catch { return [] } }
    const saveOutfits = l => { try { localStorage.setItem('blocksy.outfits', JSON.stringify(l)) } catch {} }
    async function wear(o) {
      sel = o.shirt; lookCode = o.look ?? ''
      const have = new Set(social.getWallet()?.inventory ?? []), cur = social.getWallet()?.equipped ?? {}
      for (const kind of ['hat', 'face', 'back', 'trail', 'pet']) { try { if (o.eq?.[kind] && have.has(o.eq[kind])) { if (cur[kind] !== o.eq[kind]) await social.equipItem(o.eq[kind]) } else if (cur[kind]) await social.unequipSlot(kind) } catch {} }
      paintLook(); paintAcc(); paint(); toast(t('outfit_worn'))
    }
    const paintOutfits = () => {
      const list = outfits()
      setKids(outfitBox, el('div', { class: 'section-s', text: t('outfits') }), el('div', { class: 'acc-row' }, [0, 1, 2, 3].map(i => {
        const o = list[i]
        return el('span', {}, el('button', { class: `acc-chip ${o ? 'on' : ''}`, text: o ? `${t('outfit')} ${i + 1}` : `+ ${t('outfit')} ${i + 1}`, onclick: () => { if (o) wear(o); else { const l = outfits(); l[i] = { shirt: sel, look: lookCode, eq: { ...(social.getWallet()?.equipped ?? {}) } }; saveOutfits(l); paintOutfits(); toast(t('outfit_saved')) } } }),
          o ? el('button', { class: 'acc-chip', text: 'x', title: t('delete'), onclick: () => { const l = outfits(); l[i] = null; saveOutfits(l); paintOutfits() } }) : null)
      })))
    }
    paintLook(); paintOutfits()
    const emotes = el('div', { class: 'emote-row' }, EMOTES.map(e => el('button', { class: 'btn', text: t('emote_' + e.id), onclick: () => pv?.setAnim(e.id) })), el('button', { class: 'btn secondary', text: t('still'), onclick: () => pv?.setAnim('idle') }))
    // Accesorios: sombreros y títulos que ya tienes (se compran en la tienda)
    const shopItems = await social.listShop().catch(() => [])
    const accBox = el('div')
    const paintAcc = () => {
      const w = social.getWallet() ?? {}, have = new Set(w.inventory ?? []), eq = w.equipped ?? {}
      const group = (kind, title) => {
        const list = shopItems.filter(i => i.kind === kind && have.has(i.id))
        return [el('div', { class: 'section-s', text: title }), el('div', { class: 'acc-row' },
          el('button', { class: `acc-chip ${!eq[kind] ? 'on' : ''}`, text: t('acc_none'), onclick: async () => { try { await social.unequipSlot(kind) } catch (e) { toast(e.message) } paintAcc(); pv?.setStyle(style()) } }),
          list.map(i => el('button', { class: `acc-chip ${eq[kind] === i.id ? 'on' : ''}`, text: i.name, onclick: async () => { try { await social.equipItem(i.id) } catch (e) { toast(e.message) } paintAcc(); pv?.setStyle(style()) } })),
          !list.length ? el('a', { href: '/shop', class: 'acc-link', text: t('acc_get') }) : null)]
      }
      setKids(accBox, group('hat', t('shop_hats')), group('face', t('shop_faces')), group('back', t('shop_backs')), group('trail', t('shop_trails')), group('pet', t('shop_pets')), group('title', t('shop_titles')))
    }
    paintAcc()
    setKids(root, el('h1', { class: 'page-title', text: t('avatar') }),
      el('div', { class: 'panel avatar-edit' }, el('div', { class: 'preview' }, canvas), el('div', {},
        el('h3', { text: ctx.profile.username }), el('p', { style: 'color:var(--muted)', text: t('avatar_help') }),
        sw, lookBox, accBox, outfitBox, el('div', { class: 'section-s', text: t('try_emotes') }), emotes,
        el('button', { class: 'btn primary', style: 'margin-top:16px', text: t('save'), onclick: async () => {
          try { await auth.saveColor(ctx.profile.id, sel); await social.setLook(lookCode); await ctx.refreshProfile(); toast(t('avatar_saved')) } catch (e) { toast(e.message) } } }))))
    pv = createPreview(canvas, style()); paint()
  },

  // Amigos: se añaden por nombre exacto + solicitud que el otro debe aceptar. Chat, invitar y unirse.
  async friends(root, ctx) {
    const input = el('input', { placeholder: t('friend_ph'), maxlength: 20, autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false' })
    const msg = el('p', { class: 'msg', style: 'text-align:left' })
    const reqBox = el('div'), mine = el('div', { class: 'panel' }), partyBox = partyPanel(ctx)
    let games = {}
    const add = async e => {
      e?.preventDefault(); const name = input.value.trim(); if (!name) return
      msg.className = 'msg'; msg.textContent = '...'
      try {
        const r = await social.sendRequest(name)
        msg.className = 'msg ok'; msg.textContent = t(r === 'sent' ? 'req_sent' : r === 'accepted' ? 'req_accepted' : r === 'already_sent' ? 'req_already' : 'req_friends', { name })
        if (r === 'sent' || r === 'accepted') input.value = ''
        load()
      } catch (er) { msg.className = 'msg err'; msg.textContent = social.errKey(er) ? t(social.errKey(er)) : er.message }
    }
    const row = (f, unread) => {
      const gname = f.is_online && f.current_game ? games[f.current_game]?.name : null
      return el('div', { class: 'person' }, avatar(f.username, f.avatar_color, f.is_online),
        el('div', { class: 'grow' }, el('a', { href: `/u/${encodeURIComponent(f.username)}` }, el('b', { text: f.username })), el('small', { text: gname ? `${statusText(f)} · ${gname}` : statusText(f) })),
        f.is_online && f.current_game && games[f.current_game] ? el('button', { class: 'btn primary', text: t('join'), onclick: () => ctx.play(games[f.current_game]) }) : null,
        el('button', { class: 'btn blue', html: icon('chat', 16) + (unread ? `<span class="count">${unread}</span>` : ''), title: t('chat'), onclick: async () => { const { openChat } = await import('./social-ui.js'); openChat(ctx, f) } }),
        el('button', { class: 'btn', html: icon('trash', 16), title: t('remove'), onclick: async () => { if (confirm(t('confirm_remove', { name: f.username }))) { await social.removeFriend(f.id); load() } } }))
    }
    async function load() {
      const [friends, reqs, uc, gl] = await Promise.all([social.listFriends(ctx.profile.id), social.myRequests().catch(() => []), social.unreadCounts().catch(() => ({})), api.listGames()])
      games = Object.fromEntries(gl.map(g => [g.id, g]))
      const inc = reqs.filter(r => r.dir === 'in'), out = reqs.filter(r => r.dir === 'out')
      setKids(reqBox,
        inc.length ? [el('h3', { text: `${t('requests_in')} (${inc.length})`, style: 'margin:0 0 6px' }), el('div', { class: 'panel', style: 'margin-bottom:18px' }, inc.map(r => el('div', { class: 'person' }, avatar(r.username, r.avatar_color),
          el('div', { class: 'grow' }, el('b', { text: r.username })),
          el('button', { class: 'btn primary', text: t('accept'), onclick: async () => { await social.respondRequest(r.id, true); load(); ctx.refreshBadges?.() } }),
          el('button', { class: 'btn', text: t('decline'), onclick: async () => { await social.respondRequest(r.id, false); load(); ctx.refreshBadges?.() } }))))] : null,
        out.length ? [el('h3', { text: `${t('requests_out')} (${out.length})`, style: 'margin:0 0 6px' }), el('div', { class: 'panel', style: 'margin-bottom:18px' }, out.map(r => el('div', { class: 'person' }, avatar(r.username, r.avatar_color),
          el('div', { class: 'grow' }, el('b', { text: r.username })),
          el('button', { class: 'btn', text: t('cancel_req'), onclick: async () => { await social.cancelRequest(r.id); load() } }))))] : null)
      setKids(mine, el('h3', { text: t('my_friends', { n: friends.length }), style: 'margin-bottom:6px' }),
        friends.length ? friends.map(f => row(f, uc[f.id])) : el('div', { class: 'empty', text: t('no_friends') }))
    }
    setKids(root, el('h1', { class: 'page-title', text: t('friends') }),
      el('form', { class: 'panel add-friend', onsubmit: add }, el('h3', { text: t('add_friend'), style: 'margin-bottom:6px' }), el('p', { style: 'color:var(--muted);margin:0 0 10px;font-size:14px', text: t('friend_help') }),
        el('div', { class: 'form-row' }, input, el('button', { class: 'btn blue', style: 'white-space:nowrap', text: t('friend_add_btn') })), msg),
      partyBox.el, reqBox, mine)
    load(); every(load, 8000)
  },

  // ---------- Crear: lista de mis juegos + editor avanzado ----------
  async create(root, ctx, arg) {
    if (arg) return editor(root, ctx, arg)
    const name = el('input', { placeholder: t('game_name'), minlength: 3, maxlength: 40 })
    const desc = el('input', { placeholder: t('game_desc'), maxlength: 200 })
    let mode = 'build'
    const modeBox = el('div', { class: 'mode-pick' })
    const drawModes = () => setKids(modeBox, MODES.map(m => el('button', { type: 'button', class: `mode-card ${mode === m ? 'on' : ''}`, onclick: () => { mode = m; drawModes() } },
      el('b', { text: modeLabel(m) }), el('small', { text: t(`mode_${m}_d`) }))))
    drawModes()
    const hue = el('input', { type: 'range', min: 0, max: 359, value: Math.floor(Math.random() * 360) })
    const prev = el('div', { class: 'thumb', style: 'width:120px;flex:none;--h:0' }, el('div', { class: 'cube' }))
    const setHue = () => prev.style.setProperty('--h', hue.value); hue.oninput = setHue; setHue()
    const mineBox = el('div')
    async function load() {
      const games = (await api.listGames()).filter(g => g.owner_id === ctx.profile.id)
      setKids(mineBox, games.length ? games.map(g => el('div', { class: 'person' },
        el('div', { class: 'thumb', style: `width:56px;--h:${g.hue}` }, el('div', { class: 'cube' })),
        el('div', { class: 'grow' }, el('b', { text: g.name }), el('small', { text: `${modeLabel(g.mode)} · ${g.description || ''}` })),
        el('button', { class: 'btn', text: t('play'), onclick: () => ctx.play(g) }),
        el('button', { class: 'btn', html: icon('code', 16), title: t('st_open'), onclick: () => ctx.go(`studio/${g.id}`) }),
        el('button', { class: 'btn blue', html: icon('edit', 16), title: t('edit'), onclick: () => ctx.go(`create/${g.id}`) }),
        el('button', { class: 'btn danger', html: icon('trash', 16), title: t('delete'), onclick: async () => { if (confirm(t('confirm_delete', { name: g.name }))) { await api.deleteGameRow(g.id); load() } } })))
        : el('div', { class: 'empty', text: t('no_my_games') }))
    }
    setKids(root, el('h1', { class: 'page-title', text: t('create') }),
      el('form', { class: 'panel', onsubmit: async e => {
        e.preventDefault()
        try { const id = await api.createGameRow(name.value.trim(), desc.value.trim(), Number(hue.value), mode); toast(t('game_created')); ctx.go(`create/${id}`) } catch (er) { toast(er.message) }
      } }, el('h3', { text: t('create_new'), style: 'margin-bottom:12px' }),
        el('div', { class: 'form-row' }, name, desc), el('div', { class: 'section-s', text: t('mode') }), modeBox,
        el('div', { class: 'form-row', style: 'align-items:center;margin-top:12px' }, prev, el('label', { class: 'field' }, t('cover_color'), hue)),
        el('button', { class: 'btn primary', text: t('create_btn') })),
      el('div', { class: 'section' }, el('h2', { text: t('my_games') })), el('div', { class: 'panel' }, mineBox))
    load()
  },

  // Autoriza el inicio de sesión de otro dispositivo (la 3DS muestra un QR con este enlace: /link/CODIGO)
  async link(root, ctx, code = '') {
    const input = el('input', { placeholder: t('link_code_ph'), maxlength: 6, value: code.toUpperCase(), style: 'text-transform:uppercase;letter-spacing:4px;font-size:22px;text-align:center' })
    const msg = el('p', { class: 'msg' })
    const btn = el('button', { class: 'btn primary wide', text: t('link_auth') })
    const go = async () => {
      const c = input.value.trim().toUpperCase()
      if (c.length !== 6) { msg.className = 'msg err'; msg.textContent = t('link_6'); return }
      btn.disabled = true; msg.className = 'msg'; msg.textContent = t('link_busy')
      try {
        await api.linkApprove(c)
        msg.textContent = ''
        setKids(root, el('h1', { class: 'page-title', text: t('link_title') }),
          el('div', { class: 'panel', style: 'max-width:520px;text-align:center' },
            el('div', { class: 'big-ico', html: icon('check', 44) }), el('h2', { text: t('link_done') }),
            el('p', { style: 'color:var(--muted)', text: t('link_done_p', { name: ctx.profile.username }) }),
            el('a', { class: 'btn blue', href: '/home', text: t('link_go_home') })))
      } catch (e) {
        btn.disabled = false; msg.className = 'msg err'
        msg.textContent = /invalid code/i.test(e.message) ? t('link_bad') : e.message
      }
    }
    btn.onclick = go
    input.onkeydown = e => { if (e.key === 'Enter') go() }
    setKids(root, el('h1', { class: 'page-title', text: t('link_title') }),
      el('div', { class: 'panel', style: 'max-width:520px' },
        el('p', { style: 'color:var(--muted);margin-top:0', text: code ? t('link_ask', { name: ctx.profile.username }) : t('link_help') }),
        el('div', { style: 'margin:16px 0' }, input), btn, msg))
    if (code.length === 6) btn.focus()
  },

  settings(root, ctx) {
    const sw = (key, label, after) => { const i = el('input', { type: 'checkbox' }); i.checked = !!settings[key]; i.onchange = () => { settings[key] = i.checked; saveSettings(); after?.() }; return el('label', { class: 'field check' }, i, label) }
    const rg = (key, label, min, max, step, fmt = v => v) => { const o = el('output', { text: fmt(settings[key]) }); const i = el('input', { type: 'range', min, max, step, value: settings[key] }); i.oninput = () => { settings[key] = +i.value; o.textContent = fmt(settings[key]); saveSettings() }; return el('label', { class: 'field' }, el('span', {}, label, ' ', o), i) }
    const sel = (key, label, opts, after) => { const s = el('select', {}, opts.map(([v, l]) => el('option', { value: v, text: l, selected: settings[key] === v }))); s.onchange = () => { settings[key] = s.value; saveSettings(); after?.() }; return el('label', { class: 'field' }, label, s) }
    const accent = el('input', { type: 'color', value: settings.accent }); accent.oninput = () => { settings.accent = accent.value; saveSettings(); applyTheme() }
    const langSel = el('select', {}, ['auto', ...LANGS].map(l => el('option', { value: l, text: l === 'auto' ? t('lang_auto') : langName(l), selected: l === getPref() }))); langSel.onchange = () => { setLang(langSel.value) }
    const st = getStats(), hrs = Math.floor(st.time / 3600), mins = Math.floor((st.time % 3600) / 60)
    const stat = (k, v) => el('div', { class: 'stat' }, el('b', { text: String(v) }), el('small', { text: t(k) }))
    const installRow = el('div')
    const paintInstall = () => setKids(installRow, isInstalled() ? el('p', { style: 'color:var(--muted)', text: t('set_installed') })
      : canInstall() ? el('button', { class: 'btn blue', html: icon('device', 16) + ' ' + t('set_install'), onclick: async () => { await installApp(); paintInstall() } }) : null,
      'Notification' in window && Notification.permission !== 'granted' ? el('button', { class: 'btn', style: 'margin-left:8px', html: icon('bell', 16) + ' ' + t('set_notif_perm'), onclick: async () => { await askNotifications(); paintInstall() } }) : null)
    paintInstall()
    const blockedBox = el('div')
    const paintBlocked = async () => { const l = await social.myBlocked(true); setKids(blockedBox, l.length ? l.map(b => el('div', { class: 'person' }, el('div', { class: 'grow' }, el('b', { text: b.username })), el('button', { class: 'btn', text: t('unblock'), onclick: async () => { await social.unblockUser(b.username); paintBlocked() } }))) : el('div', { class: 'empty', text: t('blocked_none') })) }
    paintBlocked()
    const upd = el('div', { class: 'upd-row' }), updMsg = el('small', { style: 'color:var(--muted)' })
    const paintUpd = () => setKids(upd, el('div', {}, el('b', { text: t('web_version') }), ' ', el('code', { text: BUILD })), updMsg,
      isUpdateReady() ? el('button', { class: 'btn primary', text: t('update_now'), onclick: applyUpdate })
        : el('button', { class: 'btn', text: t('check_updates'), onclick: async () => { updMsg.textContent = t('checking'); const r = await checkForUpdate(); updMsg.textContent = r === 'latest' ? t('up_to_date') : r === 'ready' ? t('update_available') : t('err_generic'); paintUpd() } }))
    paintUpd()
    setKids(root, el('h1', { class: 'page-title', text: t('settings') }),
      el('div', { class: 'settings-grid' },
        el('div', { class: 'panel' }, el('h3', { text: t('set_language') }), el('label', { class: 'field' }, t('set_language'), langSel), el('p', { class: 'msg', style: 'text-align:left', text: t('lang_hint') }),
          sel('theme', t('set_theme'), [['dark', t('theme_dark')], ['light', t('theme_light')]], applyTheme), el('label', { class: 'field' }, t('set_accent'), accent), sw('reduceMotion', t('set_motion'), applyTheme), installRow, el('div', { class: 'section-s', text: t('web_version') }), upd),
        el('div', { class: 'panel' }, el('h3', { text: t('set_quality') }),
          sel('quality', t('set_quality'), [['low', t('q_low')], ['med', t('q_med')], ['high', t('q_high')], ['ultra', t('q_ultra')]]),
          rg('viewDistance', t('set_dist'), 30, 250, 10), rg('fov', t('set_fov'), 50, 100, 1), sw('dynRes', t('set_dynres')), sw('shadows', t('set_shadows')), sw('bloom', t('set_bloom')), sw('clouds', t('set_clouds'))),
        el('div', { class: 'panel' }, el('h3', { text: t('voice_chat') }), rg('voiceVol', t('set_voice_vol'), 0, 2, 0.05, v => Math.round(v * 100) + '%'), sw('voiceProximity', t('set_voice_prox')), sel('voiceMode', t('set_voice_mode'), [['toggle', t('voice_mode_toggle')], ['ptt', t('voice_mode_ptt')]])),
        el('div', { class: 'panel' }, el('h3', { text: t('set_music') }),
          sw('music', t('set_music')), rg('musicVol', t('set_music_vol'), 0, 1, 0.05, v => Math.round(v * 100) + '%'), sw('shuffle', t('set_shuffle')),
          sw('sfx', t('set_sfx')), rg('sfxVol', t('set_sfx_vol'), 0, 1, 0.05, v => Math.round(v * 100) + '%')),
        el('div', { class: 'panel' }, el('h3', { text: t('controls') ?? 'Controles' }),
          rg('sensitivity', t('set_sens'), 0.3, 2.5, 0.1), rg('syncMs', t('set_sync'), 40, 400, 10, v => v + ' ms'), sw('invertY', t('set_invert')), sw('names', t('set_names')), sw('bubbles', t('set_bubbles')),
          sw('minimap', t('set_minimap')), sw('showFps', t('set_fps')), sw('notifPopups', t('set_notif')),
          rg('touchSize', t('set_touch_size'), 0.7, 1.5, 0.1), sw('leftHanded', t('set_left'))),
        el('div', { class: 'panel' }, el('h3', { text: t('blocked_users') }), blockedBox),
        el('div', { class: 'panel' }, el('h3', { text: t('set_stats') }),
          el('div', { class: 'stats-row' }, stat('stat_time', `${hrs}h ${mins}m`), stat('stat_placed', st.placed), stat('stat_broken', st.broken), stat('stat_games', st.games.length), stat('stat_msgs', st.msgs)),
          el('button', { class: 'btn danger', style: 'margin-top:14px', text: t('set_reset'), onclick: () => { resetSettings(); applyTheme(); pages.settings(root, ctx) } }))))
  },
}

// ---------- editor avanzado ----------
const TERRAINS = ['flat', 'hills', 'islands', 'plaza', 'checker', 'void', 'obby']
const SKIES = ['day', 'sunset', 'night', 'space']
async function editor(root, ctx, id) {
  setKids(root, el('h1', { class: 'page-title', text: t('loading') }))
  const g = await api.getGame(id)
  if (!g || g.owner_id !== ctx.profile.id) return ctx.go('create')
  g.config = { allow_chat: true, allow_emotes: true, ...(g.config ?? {}) }
  if (g.config.allow_build == null) g.config.allow_build = g.mode === 'build'
  let tab = 'general'
  const body = el('div'), tabs = el('div', { class: 'tabs ed-tabs' })
  const num = (k, label, min, max, step, def) => { const o = el('output', { text: g.config[k] ?? def }); const i = el('input', { type: 'range', min, max, step, value: g.config[k] ?? def }); i.oninput = () => { g.config[k] = +i.value; o.textContent = i.value }; return el('label', { class: 'field' }, el('span', {}, label, ' ', o), i) }
  const chk = (k, label) => { const i = el('input', { type: 'checkbox' }); i.checked = !!g.config[k]; i.onchange = () => (g.config[k] = i.checked); return el('label', { class: 'field check' }, i, label) }
  const pane = {
    general: () => {
      const name = el('input', { value: g.name, maxlength: 40 }); name.oninput = () => (g.name = name.value)
      const desc = el('input', { value: g.description, maxlength: 200 }); desc.oninput = () => (g.description = desc.value)
      const hue = el('input', { type: 'range', min: 0, max: 359, value: g.hue }); hue.oninput = () => { g.hue = +hue.value; prev.style.setProperty('--h', g.hue) }
      const prev = el('div', { class: 'thumb', style: `width:120px;flex:none;--h:${g.hue}` }, el('div', { class: 'cube' }))
      const max = el('input', { type: 'number', min: 1, max: 50, value: g.max_players }); max.oninput = () => (g.max_players = +max.value || 20)
      const mp = el('div', { class: 'mode-pick' }, MODES.map(m => el('button', { type: 'button', class: `mode-card ${g.mode === m ? 'on' : ''}`, onclick: () => { g.mode = m; if (g.config.allow_build_touched !== true) g.config.allow_build = m === 'build'; draw() } }, el('b', { text: modeLabel(m) }), el('small', { text: t(`mode_${m}_d`) }))))
      const tagsIn = el('input', { value: (g.config.tags ?? []).join(', '), maxlength: 60, placeholder: t('ed_tags_ph') }); tagsIn.oninput = () => (g.config.tags = tagsIn.value.split(',').map(x => x.trim().toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean).slice(0, 5))
      const welcome = el('input', { value: g.config.welcome ?? '', maxlength: 120, placeholder: t('ed_welcome') }); welcome.oninput = () => (g.config.welcome = welcome.value)
      return [el('div', { class: 'form-row' }, name, desc), el('div', { class: 'section-s', text: t('mode') }), mp,
        el('div', { class: 'form-row', style: 'align-items:center;margin-top:12px' }, prev, el('label', { class: 'field' }, t('cover_color'), hue), el('label', { class: 'field' }, t('ed_players'), max)),
        el('label', { class: 'field' }, t('ed_welcome'), welcome), el('label', { class: 'field' }, t('ed_tags'), tagsIn)]
    },
    rules: () => [
      el('label', { class: 'field check' }, (() => { const i = el('input', { type: 'checkbox' }); i.checked = !!g.config.allow_build; i.onchange = () => { g.config.allow_build = i.checked; g.config.allow_build_touched = true }; return i })(), t('ed_allow_build')),
      chk('allow_chat', t('ed_allow_chat')), chk('allow_emotes', t('ed_allow_emotes')), chk('allow_fly', 'Vuelo (F)'),
      num('speed', t('ed_speed'), 2, 16, 0.5, 6), num('jump', t('ed_jump'), 4, 18, 0.5, 8.6), num('gravity', t('ed_gravity'), 4, 60, 1, 24)],
    world: () => {
      const spawn = ['x', 'y', 'z'].map((a, i) => { const inp = el('input', { type: 'number', step: 0.5, value: g.config.spawn?.[i] ?? '', placeholder: a.toUpperCase(), style: 'width:90px' }); inp.oninput = () => { const v = ['x', 'y', 'z'].map((_, k) => Number(spawn[k].value)); g.config.spawn = spawn.every(s => s.value !== '') ? v : undefined }; return inp })
      const tp = el('div', { class: 'mode-pick' }, TERRAINS.map(w => el('button', { type: 'button', class: `mode-card ${(g.config.world ?? 'flat') === w ? 'on' : ''}`, onclick: () => { g.config.world = w; draw() } }, el('b', { text: t('ter_' + w) }))))
      const sk = el('div', { class: 'chips' }, SKIES.map(s => el('button', { type: 'button', class: `chip ${(g.config.sky ?? 'day') === s ? 'on' : ''}`, text: t('sky_' + s), onclick: () => { g.config.sky = s; if (s !== 'day') delete g.config.time; draw() } })),
        el('button', { type: 'button', class: `chip ${g.config.time === 0 ? 'on' : ''}`, text: t('ed_time').split(' (')[0] + ' ⟳', onclick: () => { g.config.time = 0; delete g.config.sky; draw() } }))
      const music = chk('music', t('ed_music'))
      return [el('div', { class: 'section-s', text: t('ed_terrain') }), tp, el('div', { class: 'section-s', text: t('ed_sky') }), sk, el('div', { class: 'section-s', text: t('ed_spawn') }), el('div', { class: 'form-row' }, spawn)]
    },
    code: () => codeEditor(g),
  }
  function draw() {
    setKids(tabs, ['general', 'rules', 'world', 'code'].map(k => el('button', { class: `tab ${tab === k ? 'active' : ''}`, text: t('ed_' + k), onclick: () => { tab = k; draw() } })))
    setKids(body, pane[tab]())
  }
  const save = async () => { await api.updateGameRow({ ...g, config: Object.fromEntries(Object.entries(g.config).filter(([, v]) => v !== undefined)) }); toast(t('ed_saved')) }
  setKids(root, el('div', { class: 'section' }, el('h1', { class: 'page-title', text: `${t('editor')}: ${g.name}` }), el('a', { href: '/create', text: t('back') })),
    el('div', { class: 'panel' }, tabs, body),
    el('div', { class: 'form-row', style: 'margin-top:14px' },
      el('button', { class: 'btn primary', text: t('save'), onclick: () => save().catch(e => toast(e.message)) }),
      el('button', { class: 'btn', html: icon('edit', 16) + ' ' + t('st_open'), onclick: async () => { try { await save(); ctx.go(`studio/${g.id}`) } catch (e) { toast(e.message) } } }),
      el('button', { class: 'btn blue', html: icon('play', 16) + ' ' + t('play'), onclick: async () => { try { await save(); ctx.play(await api.getGame(g.id)) } catch (e) { toast(e.message) } } })))
  draw()
}
