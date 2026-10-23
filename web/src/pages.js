import * as auth from './auth.js'
import * as api from './api.js'
import * as social from './social.js'
import { ACHIEVEMENTS, unlockedIds, progress, checkAchievements, wishlist, toggleWish } from './achievements.js'
import { KEY_ACTIONS, keyLabel } from './access.js'
import { DEFAULTS, settings, saveSettings, resetSettings, lastPlayed, recentGames, getStats, applyTheme } from './settings.js'
import { icon } from './icons.js'
import { headshot, styleFor, EMOTES, createPreview, loadoutStyle, parseLoadout, packLoadout, PALETTES, defaultLook, randomLook } from './avatar.js'
import { t, LANGS, langName, getPref, setLang, onLang, getLang, missingFor } from './i18n.js'
import { codeEditor } from './studio-ui.js'
import { partyPanel, attachEmoticons } from './party-ui.js'
import { TEMPLATES } from './templates.js'
import { listShots, delShot } from './gallery.js'
import { gameStat } from './settings.js'
import { APP_VERSION, whatsNew, markSeen, CREDITS, errorLog, clearErrors, reportUrl } from './about.js'
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
const pageSkel = () => [el('div', { class: 'skel', style: 'height:34px;width:38%;margin-bottom:16px' }), skeletons(6)]
export function showWelcome(go) {
  const step = (n, key, to) => el('button', { class: 'btn wide', onclick: () => { closeModal(); go(to) } }, el('b', { text: n + '  ' }), t(key))
  setKids($('modal-card'), el('div', { class: 'detail-col' }, el('h2', { text: t('welcome_title') }), el('p', { class: 'muted', text: t('welcome_text') }),
    step('1', 'welcome_avatar', 'avatar'), step('2', 'welcome_play', 'discover'), step('3', 'welcome_shop', 'shop'),
    el('button', { class: 'btn wide primary', text: t('close'), onclick: closeModal })))
  $('modal').classList.remove('hidden')
}
// Ajustes: buscador, secciones plegables, restablecer por sección y exportar/importar
function decorateSettings(root, ctx) {
  const grid = root.querySelector('.settings-grid'); if (!grid) return
  const COL = 'blocksy.set.collapsed'; let collapsed = []; try { collapsed = JSON.parse(localStorage.getItem(COL) || '[]') } catch {}
  const panels = [...grid.querySelectorAll(':scope > .panel')]
  for (const p of panels) {
    const h3 = p.querySelector('h3'); if (!h3) continue
    const id = h3.textContent, keys = [...p.querySelectorAll('[data-key]')].map(x => x.dataset.key)
    h3.classList.add('collapsible'); const fold = () => { p.classList.toggle('collapsed'); const l = new Set(collapsed); p.classList.contains('collapsed') ? l.add(id) : l.delete(id); collapsed = [...l]; try { localStorage.setItem(COL, JSON.stringify(collapsed)) } catch {} }
    h3.onclick = fold; if (collapsed.includes(id)) p.classList.add('collapsed')
    if (keys.length) { const r = el('button', { type: 'button', class: 'link-btn sec-reset', text: t('set_reset_section'), onclick: e => { e.stopPropagation(); for (const k of keys) settings[k] = DEFAULTS[k] ?? settings[k]; saveSettings(); applyTheme(); pages.settings(root, ctx) } }); h3.after(r) }
  }
  const search = el('input', { type: 'search', class: 'set-search', placeholder: t('set_search') })
  search.oninput = () => {
    const q = search.value.trim().toLowerCase()
    for (const p of panels) {
      const fields = [...p.querySelectorAll('label.field')]; let any = !q || (p.querySelector('h3')?.textContent ?? '').toLowerCase().includes(q)
      for (const f of fields) { const m = !q || f.textContent.toLowerCase().includes(q); f.classList.toggle('hidden', !m && !any); if (m) any = true }
      p.classList.toggle('hidden', !any); if (q && any) p.classList.remove('collapsed')
    }
  }
  const exp = el('button', { type: 'button', class: 'btn tiny', text: t('set_export'), onclick: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ format: 'blocksy-settings-1', settings }, null, 1)], { type: 'application/json' })); a.download = 'blocksy-settings.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) } })
  const imp = el('button', { type: 'button', class: 'btn tiny', text: t('set_import'), onclick: () => {
    const f = el('input', { type: 'file', accept: '.json,application/json' })
    f.onchange = async () => { try { const d = JSON.parse(await f.files[0].text()); if (d.format !== 'blocksy-settings-1') throw new Error('format'); for (const k of Object.keys(DEFAULTS)) if (k in d.settings && typeof d.settings[k] === typeof DEFAULTS[k]) settings[k] = d.settings[k]; saveSettings(); applyTheme(); toast(t('saved')); pages.settings(root, ctx) } catch { toast(t('set_import_bad')) } }
    f.click() } })
  grid.before(el('div', { class: 'form-row', style: 'align-items:center;gap:8px;margin-bottom:12px' }, search, exp, imp))
}
function showTranslations() {
  const rows = LANGS.filter(l => l !== 'en').map(l => ({ l, m: missingFor(l) }))
  setKids($('modal-card'), el('div', { class: 'detail-col' }, el('h2', { text: t('tr_check') }), el('p', { class: 'muted', text: t('tr_help') }),
    el('div', { class: 'hist-list' }, rows.map(({ l, m }) => el('div', { class: 'person' }, el('div', { class: 'grow' }, el('b', { text: langName(l) }), el('small', { text: t('tr_missing_n', { n: m.length }) })),
      m.length ? el('button', { class: 'btn tiny', text: t('download'), onclick: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(Object.fromEntries(m.map(k => [k, ''])), null, 1)], { type: 'application/json' })); a.download = `missing-${l}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) } }) : el('span', { class: 'owned', text: '✓' })))),
    el('button', { class: 'btn wide', text: t('close'), onclick: closeModal })))
  $('modal').classList.remove('hidden')
}
export function showNews() {
  const m = $('modal'); setKids($('modal-card'), el('div', { class: 'detail-col' }, el('h2', { text: t('whats_new') + ' · ' + APP_VERSION }), el('ul', { class: 'news-list' }, whatsNew().map(x => el('li', { text: x }))), el('button', { class: 'btn wide primary', text: t('close'), onclick: closeModal })))
  m.classList.remove('hidden'); markSeen()
}
function showCredits() {
  setKids($('modal-card'), el('div', { class: 'detail-col' }, el('h2', { text: t('credits') }), el('ul', { class: 'news-list' }, CREDITS.map(([a, b]) => el('li', {}, el('b', { text: a + ' ' }), b))), el('button', { class: 'btn wide', text: t('close'), onclick: closeModal })))
  $('modal').classList.remove('hidden')
}
function showErrors() {
  const l = errorLog()
  setKids($('modal-card'), el('div', { class: 'detail-col' }, el('h2', { text: t('error_log') }),
    l.length ? el('pre', { class: 'err-log', text: l.map(e => `${e.at.slice(11, 19)} ${e.msg}`).join('\n') }) : el('p', { class: 'muted', text: t('no_errors') }),
    el('button', { class: 'btn wide', text: t('clear'), onclick: () => { clearErrors(); showErrors() } }), el('button', { class: 'btn wide primary', text: t('close'), onclick: closeModal })))
  $('modal').classList.remove('hidden')
}
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
// apodos de amigos (solo los ves tú, se guardan en este navegador) y color de banner del perfil (va escondido al principio de la biografía)
const nickMap = () => { try { const o = JSON.parse(localStorage.getItem('blocksy.nicks') || '{}'); return o && typeof o === 'object' ? o : {} } catch { return {} } }
const nickOf = name => nickMap()[String(name).toLowerCase()] || name
const setNick = (name, v) => { const o = nickMap(); if (v) o[String(name).toLowerCase()] = v; else delete o[String(name).toLowerCase()]; try { localStorage.setItem('blocksy.nicks', JSON.stringify(o)) } catch {} }
const BANNER_RE = /^\u2063b(#[0-9a-fA-F]{6})/
const bannerOf = bio => BANNER_RE.exec(bio ?? '')?.[1] ?? ''
const bioText = bio => String(bio ?? '').replace(BANNER_RE, '')
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
  const thumb = el('div', { class: 'thumb' + (g.config?.thumb ? ' has-img' : ''), style: `--h:${g.hue ?? hueOf(g.id)}` + (g.config?.thumb ? `;background-image:url(${g.config.thumb})` : '') }, el('div', { class: 'cube' }),
    n ? el('span', { class: 'live', text: t('playing_n', { n }) }) : null, el('span', { class: 'mode-tag', text: modeLabel(g.mode) }))
  return el('div', { class: 'gcard', onclick: () => onOpen(g) }, thumb,
    el('div', { class: 'gname', text: g.name }), el('div', { class: 'gmeta', text: t('by', { name: g.owner_name || 'Blocksy' }) }))
}
const grid = (games, counts, onOpen) => games.length
  ? el('div', { class: 'grid' }, games.map(g => gameCard(g, counts, onOpen)))
  : el('div', { class: 'empty', text: t('no_games') })

export function openGameModal(g, counts, onPlay) {
  const m = $('modal'), card = $('modal-card'), n = counts[g.id] ?? 0, related = el('div')
  setKids(card, el('div', { class: 'detail' },
    el('div', { class: 'thumb', style: `--h:${g.hue ?? hueOf(g.id)}` }, el('div', { class: 'cube' })),
    el('div', {}, el('h2', { text: g.name }),
      el('small', { style: 'color:var(--muted)', text: `${t('by', { name: g.owner_name || 'Blocksy' })} · ${modeLabel(g.mode)}` }),
      el('div', { class: 'stats' },
        el('div', {}, el('b', { text: String(n) }), el('small', { text: t('playing_n', { n: '' }).trim() })),
        el('div', {}, el('b', { text: String(g.max_players) }), el('small', { text: t('max_players') })),
        el('div', {}, el('b', { text: 'Web + 3DS' }), el('small', { text: t('platforms') }))),
      el('p', { text: g.description || t('no_desc') }),
      (() => { const s = gameStat(g.id); return s.visits ? el('small', { class: 'muted', text: t('my_game_stats', { n: s.visits, m: Math.round(s.secs / 60) }) }) : null })(),
      el('button', { class: 'btn primary wide', text: t('play'), onclick: () => { closeModal(); onPlay(g) } }),
      voteBox(g),
      favBtn(g),
      roomBox(g, onPlay),
      related,
      g.owner_name && g.owner_name !== 'Blocksy' ? el('button', { class: 'btn wide ghost', text: t('report_game'), onclick: () => openReport(g.owner_name, `Juego: ${g.name} (${g.id})`) }) : null,
      el('button', { class: 'btn wide', text: t('close'), onclick: closeModal }))))
  m.classList.remove('hidden')
  api.listGames().then(all => { const tags = new Set(Array.isArray(g.config?.tags) ? g.config.tags : []); const rel = all.filter(x => x.id !== g.id && ((x.mode ?? 'build') === (g.mode ?? 'build') || (Array.isArray(x.config?.tags) && x.config.tags.some(tg => tags.has(tg))))).slice(0, 3); if (rel.length) setKids(related, el('div', { class: 'section-s', text: t('related_games') }), el('div', { class: 'chips' }, rel.map(x => el('button', { class: 'chip', text: x.name, onclick: () => openGameModal(x, counts, onPlay) })))) }).catch(() => {})
}
const skeletons = n => el('div', { class: 'grid' }, Array.from({ length: n }, () => el('div', {}, el('div', { class: 'skel card' }), el('div', { class: 'skel line' }))))
export const closeModal = () => $('modal').classList.add('hidden')

// Las páginas se repintan al cambiar de idioma; guardamos la última para repintarla
let refreshTimer = null
const every = (fn, ms) => { clearInterval(refreshTimer); refreshTimer = setInterval(() => { if (!document.hidden) fn() }, ms) }
export const stopPageTimers = () => clearInterval(refreshTimer)

function openReport(name, extra = '') {
  const reasons = ['spam', 'abuse', 'cheating', 'inappropriate', 'other']
  const sel = el('select', {}, reasons.map(r => el('option', { value: r, text: t('rep_' + r) })))
  const det = el('textarea', { class: 'bio-edit', rows: 3, maxlength: 300, placeholder: t('rep_details') })
  setKids($('modal-card'), el('div', { class: 'detail-col' }, el('h2', { text: t('report') + ': ' + name }), el('label', { class: 'field' }, t('rep_reason'), sel), det,
    el('div', { class: 'form-row' }, el('button', { class: 'btn danger', text: t('report'), onclick: async () => { try { await social.reportUser(name, sel.value, (extra ? extra + ' | ' : '') + det.value); toast(t('rep_sent')); closeModal() } catch (e) { toast(e.message) } } }), el('button', { class: 'btn', text: t('cancel'), onclick: closeModal }))))
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
          avatar(f.username, f.avatar_color, f.is_online), el('b', { text: nickOf(f.username), title: f.username }), el('small', { text: statusText(f) }))))
      : el('div', { class: 'empty', text: t('home_no_friends') }))
    paintFriends(friends)
    // racha y recompensa diaria, "seguir jugando", amigos jugando y juego al azar
    const streakBox = el('div', { class: 'home-chips' }), playingRow = el('div')
    social.loadWallet().then(w => {
      const claim = w?.can_claim ? el('button', { class: 'btn primary tiny', text: t('shop_claim'), onclick: async () => { try { const r = await social.claimDaily(); toast(t('shop_got', { n: r.amount })); paintStreak() } catch (e) { toast(e.message) } } }) : null
      const paintStreak = () => { const w2 = social.getWallet(); setKids(streakBox, el('span', { class: 'chip-info', html: icon('star', 14) + ' ' + t('shop_streak', { n: w2?.streak ?? 0 }) }), el('span', { class: 'chip-info', html: icon('coin', 14) + ' ' + (w2?.bcoins ?? 0) }), w2?.can_claim ? claim : null) }
      paintStreak()
    }).catch(() => {})
    const random = el('button', { class: 'btn', html: icon('compass', 16) + ' ' + t('random_game'), onclick: () => { const pool = games.filter(g => g.id !== last?.id); const g = pool[Math.floor(Math.random() * pool.length)] ?? games[0]; if (g) open(g) } })
    const paintPlaying = list => {
      const rows = list.filter(f => f.is_online && f.current_game).map(f => ({ f, g: games.find(x => x.id === f.current_game) })).filter(x => x.g)
      setKids(playingRow, rows.length ? [el('div', { class: 'section' }, el('h2', { text: t('friends_playing') })), el('div', { class: 'row-scroll' }, rows.map(({ f, g }) => el('div', { class: 'friend playing' }, avatar(f.username, f.avatar_color, true), el('b', { text: f.username }), el('small', { text: g.name }), el('button', { class: 'btn tiny primary', text: t('join'), onclick: () => ctx.play(g) }))))] : null)
    }
    paintPlaying(friends)
    setKids(root,
      el('div', { class: 'hero' }, avatar(ctx.profile.username, ctx.profile.avatar_color), el('h1', { text: t('hello', { name: ctx.profile.username }) }), random),
      streakBox,
      last ? el('div', { class: 'continue-card' }, el('div', { class: 'thumb sm' + (last.config?.thumb ? ' has-img' : ''), style: `--h:${last.hue ?? hueOf(last.id)}` + (last.config?.thumb ? `;background-image:url(${last.config.thumb})` : '') }, el('div', { class: 'cube' })),
        el('div', { class: 'grow' }, el('small', { text: t('continue') }), el('h3', { text: last.name }), el('small', { text: (counts[last.id] ?? 0) ? t('playing_n', { n: counts[last.id] }) : t('no_one_playing') })),
        el('button', { class: 'btn primary', html: icon('play', 16) + ' ' + t('play'), onclick: () => ctx.play(last) })) : null,
      playingRow,
      el('div', { class: 'section' }, el('h2', { text: t('friends_n', { n: friends.length }) }), el('a', { href: '/friends', text: t('see_all') })), friendsRow,
      recentRow, favRow,
      el('div', { class: 'section' }, el('h2', { text: t('popular') }), el('a', { href: '/discover', text: t('see_all') })),
      grid(popular.slice(0, 12), counts, open),
      el('div', { class: 'section' }, el('h2', { text: t('newest') })),
      grid([...games].reverse().slice(0, 12), counts, open))
    every(async () => { const fl = await social.listFriends(ctx.profile.id); paintFriends(fl); paintPlaying(fl) }, 10_000)
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
    let draw = () => {
      const q = input.value.trim().toLowerCase()
      setKids(chips, el('button', { class: `chip ${modeSel === '' ? 'on' : ''}`, text: t('see_all'), onclick: () => { modeSel = ''; draw() } }), MODES.map(m => el('button', { class: `chip ${modeSel === m ? 'on' : ''}`, text: modeLabel(m), onclick: () => { modeSel = m; draw() } })))
      setKids(out, grid((sortSel === 'newest' ? [...games].reverse() : [...games].sort(sortBy[sortSel])).filter(g => (!modeSel || (g.mode ?? 'build') === modeSel) && (!tagSel || tagsOf(g).includes(tagSel)) && (!q || g.name.toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q))), counts, g => openGameModal(g, counts, ctx.play)))
    }
    // sugerencias de búsqueda: nombres de juegos, etiquetas y búsquedas recientes
    const RS = 'blocksy.searches'; let recents = []; try { recents = JSON.parse(localStorage.getItem(RS) || '[]') } catch {}
    const dl = el('datalist', { id: 'disc-sugg' }, [...new Set([...recents, ...games.map(g => g.name), ...allTags.map(x => '#' + x)])].slice(0, 40).map(v => el('option', { value: v })))
    input.setAttribute('list', 'disc-sugg')
    input.onchange = () => { const v = input.value.trim(); if (v.length >= 2) { recents = [v, ...recents.filter(x => x !== v)].slice(0, 6); try { localStorage.setItem(RS, JSON.stringify(recents)) } catch {} } }
    const trend = el('div')
    const paintTrend = () => { const hot = [...games].filter(g => (counts[g.id] ?? 0) > 0).sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0)).slice(0, 4); setKids(trend, hot.length && !input.value.trim() && !modeSel && !tagSel ? [el('div', { class: 'section' }, el('h2', { text: t('trending') })), grid(hot, counts, g => openGameModal(g, counts, ctx.play))] : null) }
    const drawAll = draw; draw = () => { drawAll(); paintTrend() }
    input.oninput = draw; draw()
    setKids(root, el('h1', { class: 'page-title', text: t('discover') }), el('div', { class: 'form-row', style: 'margin-bottom:12px' }, input, dl, sortEl), chips, allTags.length ? el('div', { class: 'chips tags' }, allTags.map(tg => el('button', { class: 'chip', text: '#' + tg, onclick: e => { tagSel = tagSel === tg ? '' : tg; e.target.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.textContent === '#' + tagSel)); draw() } }))) : null, trend, out)
  },

  // Historial de versiones: las notas de las versiones estables publicadas en GitHub
  async changelog(root) {
    setKids(root, pageSkel())
    let list = []
    try {
      const r = await fetch('https://api.github.com/repos/IkerPlays/BlocksyApp/releases?per_page=20'); if (!r.ok) throw new Error(r.status)
      list = (await r.json()).filter(x => !x.draft && !x.prerelease)
    } catch {}
    const clean = s => String(s ?? '').replace(/[*`#]/g, '').split('\n').filter(l => l.trim() && !l.startsWith('<sub>') && !l.startsWith('---')).join('\n')
    setKids(root, el('h1', { class: 'page-title', text: t('nav_changelog') }),
      list.length ? list.map(x => el('div', { class: 'panel', style: 'margin-bottom:14px' }, el('h3', { text: x.name || x.tag_name }), el('small', { class: 'muted', text: new Date(x.published_at).toLocaleDateString(getLang()) }), el('pre', { class: 'notes', text: clean(x.body) })))
        : el('div', { class: 'panel' }, el('p', { class: 'muted', text: t('changelog_offline') }), el('ul', { class: 'news-list' }, whatsNew().map(x => el('li', { text: x })))))
  },

  // Privacidad y datos: qué se guarda, borrar datos locales, descargar mis datos y cómo borrar la cuenta
  async privacy(root, ctx) {
    const sec = (title, ...kids) => el('div', { class: 'panel', style: 'margin-bottom:14px' }, el('h3', { text: title }), ...kids)
    const p = k => el('p', { class: 'muted', text: t(k) })
    const clear = el('button', { class: 'btn danger', text: t('priv_clear'), onclick: () => {
      if (!confirm(t('priv_clear_confirm'))) return
      try { for (const k of Object.keys(localStorage)) if (k.startsWith('blocksy.')) localStorage.removeItem(k) } catch {}
      caches?.keys?.().then(ks => ks.forEach(k => caches.delete(k))); toast(t('priv_cleared')); setTimeout(() => location.reload(), 800) } })
    const dl = el('button', { class: 'btn', text: t('priv_download'), onclick: async () => {
      const data = { exported_at: new Date().toISOString(), profile: { id: ctx.profile.id, username: ctx.profile.username, avatar_color: ctx.profile.avatar_color }, local: {} }
      try { for (const k of Object.keys(localStorage)) if (k.startsWith('blocksy.') && k !== 'blocksy.gallery') { try { data.local[k] = JSON.parse(localStorage.getItem(k)) } catch { data.local[k] = localStorage.getItem(k) } } } catch {}
      try { data.wallet = await social.loadWallet() } catch {}
      try { data.friends = (await social.listFriends(ctx.profile.id)).map(f => f.username) } catch {}
      try { data.favorites = [...(await social.myFavorites())] } catch {}
      try { data.my_games = (await api.listGames()).filter(g => g.owner_id === ctx.profile.id).map(g => ({ id: g.id, name: g.name, description: g.description, mode: g.mode, config: g.config, script: g.script })) } catch {}
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })); a.download = 'blocksy-my-data.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) } })
    setKids(root, el('h1', { class: 'page-title', text: t('nav_privacy') }),
      sec(t('priv_what_title'), p('priv_what')), sec(t('priv_local_title'), p('priv_local'), clear),
      sec(t('priv_mine_title'), p('priv_mine'), dl),
      sec(t('priv_delete_title'), p('priv_delete'), el('a', { class: 'btn', href: reportUrl(t('priv_delete_issue') + ' ' + ctx.profile.username), target: '_blank', rel: 'noopener', text: t('priv_delete_btn') })))
  },

  // Galería de capturas de este dispositivo
  gallery(root) {
    const draw = () => {
      const l = listShots().slice().reverse()
      setKids(root, el('h1', { class: 'page-title', text: t('nav_gallery') }), el('p', { class: 'muted', text: t('gallery_help') }),
        l.length ? el('div', { class: 'shot-grid' }, l.map(s => el('div', { class: 'shot' }, el('img', { src: s.img, alt: s.game, loading: 'lazy' }),
          el('div', { class: 'shot-bar' }, el('small', { text: `${s.game} · ${new Date(s.at).toLocaleString(getLang())}` }),
            el('a', { class: 'btn tiny', href: s.img, download: `blocksy-${s.at}.jpg`, text: t('download') }), el('button', { class: 'btn tiny danger', text: '×', onclick: () => { delShot(s.at); draw() } }))))) : el('div', { class: 'empty', text: t('gallery_empty') }))
    }
    draw()
  },

  // Logros y ranking de BCoins
  async achievements(root, ctx) {
    await social.loadWallet().catch(() => {}); checkAchievements()
    const have = unlockedIds(), rank = el('div', { class: 'panel' }, el('small', { text: t('loading') }))
    setKids(root, el('h1', { class: 'page-title', text: t('nav_achievements') }),
      el('p', { class: 'muted', text: t('ach_count', { n: have.size, total: ACHIEVEMENTS.length }) }),
      el('div', { class: 'ach-grid' }, ACHIEVEMENTS.map(a => {
        const done = have.has(a.id), v = progress(a)
        return el('div', { class: `ach ${done ? 'done' : ''}` }, el('i', { html: icon(done ? 'trophy' : 'star', 22) }),
          el('div', { class: 'grow' }, el('b', { text: t('ach_' + a.id) }), el('small', { text: t('ach_' + a.id + '_d') }),
            el('div', { class: 'prog' }, el('i', { style: `width:${Math.round(v / a.goal * 100)}%` })), el('small', { text: `${a.fmt ? a.fmt(v) : v} / ${a.fmt ? a.fmt(a.goal) : a.goal}` })))
      })),
      el('div', { class: 'section' }, el('h2', { text: t('bcoin_ranking') })), rank)
    try {
      const r = await social.bcoinRanking()
      setKids(rank, r.length ? r.map((u, i) => el('div', { class: 'person', onclick: () => ctx.go(`u/${u.username}`) }, el('b', { text: `#${i + 1}` }), avatar(u.username, u.avatar_color, false), el('div', { class: 'grow', text: u.username }), el('span', { class: 'price', html: icon('coin', 16) + ' ' + u.bcoins }))) : el('small', { text: t('no_ranking') }))
    } catch { setKids(rank, el('small', { text: t('no_ranking') })) }
  },

  // Tienda: BCoins, sombreros, títulos y cofres de botín
  async shop(root, ctx) {
    setKids(root, pageSkel())
    const [items, w0] = await Promise.all([social.listShop(), social.loadWallet()])
    const canvas = el('canvas', { class: 'avatar-3d' }), coins = el('b', { class: 'coin-big' }), daily = el('div'), body = el('div')
    let pv = null, tryOn = null
    const equipped = () => social.getWallet()?.equipped ?? {}
    const owned = () => new Set(social.getWallet()?.inventory ?? [])
    const style = () => loadoutStyle(styleFor(ctx.profile.username, ctx.profile.avatar_color), { ...parseLoadout(packLoadout(equipped())), ...(tryOn ? { [tryOn.kind]: tryOn.id } : {}) })
    const rarity = r => el('span', { class: `rarity ${r}`, text: t('rar_' + r) })
    const price = n => el('span', { class: 'price', html: icon('coin', 16) + ' ' + n })
    const logBuy = (name, price, kind) => { try { const h = JSON.parse(localStorage.getItem('blocksy.history') || '[]'); h.push({ at: Date.now(), name, price, kind }); localStorage.setItem('blocksy.history', JSON.stringify(h.slice(-60))) } catch {} }
    const run = async fn => { try { await fn() } catch (e) { toast(/not enough/i.test(e.message) ? t('shop_no_coins') : /already/i.test(e.message) ? t('shop_owned') : e.message) } draw() }
    function paintDaily() {
      const wl = social.getWallet()
      const nextIn = () => { const n = new Date(), m = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1) - n.getTime(); return `${Math.floor(m / 3600000)}h ${Math.floor(m % 3600000 / 60000)}m` }
      setKids(daily, el('div', { class: `panel daily chest ${wl?.can_claim ? 'ready' : ''}` }, el('i', { class: 'chest-ico', html: icon('gift', 34) }), el('div', { class: 'grow' }, el('b', { text: t('daily_chest') }), el('small', { text: t('shop_streak', { n: wl?.streak ?? 0 }) + (wl?.can_claim ? '' : ' · ' + t('daily_next', { t: nextIn() })) })),
        wl?.can_claim ? el('button', { class: 'btn primary', html: icon('gift', 16) + ' ' + t('shop_claim'), onclick: () => run(async () => { const r = await social.claimDaily(); toast(t('shop_got', { n: r.amount })) }) })
          : el('span', { class: 'muted', text: t('shop_come_back') })))
    }
    function card(it) {
      const have = owned().has(it.id), eq = equipped()[it.kind] === it.id
      const btns = [], wished = wishlist().includes(it.id)
      if (!have && it.kind !== 'crate') btns.push(el('button', { class: `btn wish ${wished ? 'on' : ''}`, html: icon('star', 16), title: t('wish_toggle'), onclick: () => { toggleWish(it.id); draw() } }))
      if (it.kind === 'crate') btns.push(el('button', { class: 'btn blue', html: icon('gift', 16) + ' ' + t('shop_open'), onclick: () => run(async () => { const r = await social.openCrate(it.id); logBuy((items.find(i => i.id === r.item)?.name ?? r.item) + ' (' + it.name + ')', it.price, 'crate'); showReward(r) }) }))
      else if (have) {
        btns.push(el('button', { class: `btn ${eq ? '' : 'primary'}`, text: eq ? t('shop_unequip') : t('shop_equip'), onclick: () => run(async () => { eq ? await social.unequipSlot(it.kind) : await social.equipItem(it.id); tryOn = null; pv?.setStyle(style()) }) }))
      } else btns.push(el('button', { class: 'btn blue', text: t('shop_buy'), onclick: () => run(async () => { await social.buyItem(it.id); logBuy(it.name, it.price, it.kind); toast(t('shop_bought', { name: it.name })) }) }))
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
    const F = { kind: 'all', sort: 'default', owned: false }
    const RAR = { common: 0, rare: 1, epic: 2 }
    const filterBar = el('div', { class: 'shop-filters' })
    const paintFilters = () => {
      const kinds = ['all', 'crate', 'hat', 'face', 'back', 'trail', 'pet', 'title']
      const ks = el('select', { onchange: e => { F.kind = e.target.value; draw() } }, kinds.map(k => el('option', { value: k, text: t('sf_' + k), selected: F.kind === k })))
      const ss = el('select', { onchange: e => { F.sort = e.target.value; draw() } }, ['default', 'price_asc', 'price_desc', 'rarity'].map(k => el('option', { value: k, text: t('ss_' + k), selected: F.sort === k })))
      const ow = el('input', { type: 'checkbox', checked: F.owned }); ow.onchange = () => { F.owned = ow.checked; draw() }
      const anim = el('select', { onchange: e => pv?.setAnim(e.target.value) }, ['idle', 'wave', 'dance', 'walk'].map(k => el('option', { value: k, text: t('pv_' + k) })))
      const spin = el('input', { type: 'checkbox', checked: true }); spin.onchange = () => pv?.setSpin(spin.checked)
      setKids(filterBar, ks, ss, el('label', { class: 'chip-num' }, ow, t('sf_owned')), anim, el('label', { class: 'chip-num' }, spin, t('pv_spin')), el('button', { class: 'btn tiny', text: t('buy_history'), onclick: showHistory }))
    }
    function showHistory() {
      let h = []; try { h = JSON.parse(localStorage.getItem('blocksy.history') || '[]') } catch {}
      setKids($('modal-card'), el('div', { class: 'detail-col' }, el('h2', { text: t('buy_history') }),
        h.length ? el('div', { class: 'hist-list' }, h.slice().reverse().map(x => el('div', { class: 'person' }, el('div', { class: 'grow' }, el('b', { text: x.name }), el('small', { text: new Date(x.at).toLocaleString(getLang()) })), el('span', { class: 'price', html: icon('coin', 14) + ' ' + x.price })))) : el('p', { class: 'muted', text: t('buy_history_none') }),
        el('button', { class: 'btn wide', text: t('close'), onclick: closeModal })))
      $('modal').classList.remove('hidden')
    }
    const arrange = list => {
      let l = list.filter(i => (F.kind === 'all' || i.kind === F.kind) && (!F.owned || owned().has(i.id)))
      if (F.sort === 'price_asc') l = [...l].sort((a, b) => a.price - b.price); else if (F.sort === 'price_desc') l = [...l].sort((a, b) => b.price - a.price); else if (F.sort === 'rarity') l = [...l].sort((a, b) => (RAR[b.rarity] ?? 0) - (RAR[a.rarity] ?? 0))
      return l
    }
    function draw() {
      coins.innerHTML = icon('coin', 22) + ' ' + (social.getWallet()?.bcoins ?? 0)
      paintDaily(); pv?.setStyle(style())
      const sec = (title, kind) => { const l = arrange(items.filter(i => i.kind === kind)); return l.length ? [el('div', { class: 'section' }, el('h2', { text: title })), el('div', { class: 'shop-grid' }, l.map(card))] : null }
      const wl = items.filter(i => wishlist().includes(i.id) && !owned().has(i.id)), coinsNow = social.getWallet()?.bcoins ?? 0
      const wishBlock = wl.length ? [el('div', { class: 'section' }, el('h2', { text: t('wishlist') + (wl.some(i => i.price <= coinsNow) ? ' · ' + t('wish_afford') : '') })), el('div', { class: 'shop-grid' }, wl.map(card))] : null
      if (F.sort !== 'default') { const all = arrange(items); return setKids(body, el('div', { class: 'shop-grid' }, all.length ? all.map(card) : null), all.length ? null : el('div', { class: 'empty', text: t('ff_none') })) }
      setKids(body, F.kind === 'all' && !F.owned ? wishBlock : null, sec(t('shop_crates'), 'crate'), sec(t('shop_hats'), 'hat'), sec(t('shop_faces'), 'face'), sec(t('shop_backs'), 'back'), sec(t('shop_trails'), 'trail'), sec(t('shop_pets'), 'pet'), sec(t('shop_titles'), 'title'))
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
      filterBar, el('div', { class: 'shop-layout' }, el('div', { class: 'preview' }, canvas), body))
    pv = createPreview(canvas, style()); paintFilters(); draw(); paintMissions()
  },

  // Perfil: /profile (el tuyo) o /u/<usuario>
  async profile(root, ctx, name) {
    setKids(root, pageSkel())
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
      A.push(btn('', t('p_share'), async () => { const url = `${location.origin}/u/${p.username}`; if (navigator.share) { try { await navigator.share({ title: p.username + ' · Blocksy', url }); return } catch (e) { if (e?.name === 'AbortError') return } } try { await navigator.clipboard.writeText(url); toast(t('link_copied')) } catch { prompt(t('copy_link'), url) } }))
      if (p.relation === 'friends') A.push(btn('', t('p_nick'), async () => { const v = prompt(t('p_nick_ask', { name: p.username }), nickMap()[p.username.toLowerCase()] ?? ''); if (v !== null) { setNick(p.username, v.trim().slice(0, 20)); reload() } }))
      setKids(actions, A)
    }
    const banner = { value: '', cleared: false }
    const bannerEl = el('div', { class: 'p-banner' })
    const paintBanner = () => { const c = banner.cleared ? '' : banner.value || bannerOf(p.bio); bannerEl.style.background = c ? `linear-gradient(120deg, ${c}, ${c}66)` : ''; bannerEl.classList.toggle('on', !!c) }
    const paintBio = () => {
      if (!self) return setKids(bioBox, el('p', { class: bioText(p.bio) ? '' : 'muted', text: bioText(p.bio) || t('p_no_bio') }))
      const ta = el('textarea', { class: 'bio-edit', maxlength: 150, placeholder: t('p_bio_ph'), rows: 3 }); ta.value = bioText(p.bio)
      const count = el('small', { class: 'muted', text: `${ta.value.length}/150` }); ta.oninput = () => { count.textContent = `${ta.value.length}/150` }
      const bn = el('input', { type: 'color', value: bannerOf(p.bio) || '#335fff' }); bn.oninput = () => { banner.value = bn.value; paintBanner() }
      const noBn = el('button', { type: 'button', class: 'btn tiny', text: t('p_banner_none'), onclick: () => { banner.value = ''; banner.cleared = true; paintBanner() } })
      setKids(bioBox, ta, el('div', { class: 'form-row', style: 'align-items:center;gap:8px' }, count, el('label', { class: 'chip-num' }, t('p_banner'), bn), noBn),
        el('button', { class: 'btn', style: 'margin-top:8px', text: t('save'), onclick: async () => { const col = banner.cleared ? '' : (banner.value || bannerOf(p.bio)); const full = (col ? '\u2063b' + col : '') + ta.value.trim().slice(0, 150); const { error: e } = await social.setBio(ctx.profile.id, full); if (e) toast(e.message); else { p.bio = full; toast(t('saved')) } } }))
    }
    const status = self || p.relation === 'friends' ? (p.is_online ? (p.current_game ? t('status_game') : t('status_online')) : t('status_offline')) : ''
    setKids(root, el('div', { class: 'panel profile-card' },
      bannerEl, el('div', { class: 'preview' }, canvas),
      el('div', { class: 'profile-info' },
        el('h1', { class: 'page-title', style: 'margin-bottom:4px', text: p.username }), p.relation === 'friends' && nickOf(p.username) !== p.username ? el('small', { class: 'muted', text: t('p_nick_is', { nick: nickOf(p.username) }) }) : null,
        titleBox,
        status ? el('div', { class: 'p-status' }, el('span', { class: `dot-i ${p.is_online ? 'on' : ''}` }), status) : null,
        el('small', { style: 'color:var(--muted)', text: self ? t('p_you') : t('p_joined', { date: new Date(p.created_at).toLocaleDateString(getLang()) }) }),
        bioBox, extraBox,
        el('div', { class: 'stats-row', style: 'margin:14px 0' }, stat(p.friend_count, t('p_friends')), stat(mine0.length, t('p_games'))), actions)),
      el('div', { class: 'section' }, el('h2', { text: t('p_games') })), games,
      self ? [el('div', { class: 'section' }, el('h2', { text: t('friends_n', { n: '' }).replace('()', '').trim() })), friendsBox] : null)
    const pv = createPreview(canvas, { ...styleFor(p.username, p.avatar_color), ...loadoutStyle({}, parseLoadout(packLoadout(p.equipped))) }); pv.setAnim('wave')
    if (p.equipped?.title) social.listShop().then(items => { const it = items.find(i => i.id === p.equipped.title); if (it) titleBox.textContent = it.data?.text ?? it.name }).catch(() => {})
    paintBio(); paintBanner(); paintActions()
    social.profileExtra(p.username).then(x => { if (!x) return; if (x.look) pv.setStyle(loadoutStyle(styleFor(p.username, p.avatar_color), parseLoadout(packLoadout(p.equipped, x.look)))); const hrs = Math.floor(x.play_seconds / 3600), mins = Math.floor(x.play_seconds % 3600 / 60); const bd = [...(x.badges ?? []), ...(mine0.length ? ['creator'] : [])]
      setKids(extraBox, el('div', { class: 'badges' }, bd.map(b => el('span', { class: 'badge', title: t('badge_' + b + '_d'), text: t('badge_' + b) }))), el('small', { style: 'display:block;color:var(--muted);margin:6px 0', text: `${t('stat_time')}: ${hrs}h ${mins}m${x.last_seen && !p.is_online ? ` · ${t('last_seen')}: ${new Date(x.last_seen).toLocaleString(getLang())}` : ''}` })) })
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
    let games = {}, fFilter = 'all', fSearch = ''
    const filterBar = el('div', { class: 'form-row', style: 'align-items:center;gap:8px;margin-bottom:8px' })
    const fSearchEl = el('input', { type: 'search', placeholder: t('friends_search'), style: 'max-width:200px' }); fSearchEl.oninput = () => { fSearch = fSearchEl.value.trim().toLowerCase(); load() }
    const paintFilter = () => setKids(filterBar, ['all', 'online', 'ingame'].map(k => el('button', { class: `chip ${fFilter === k ? 'on' : ''}`, text: t('ff_' + k), onclick: () => { fFilter = k; paintFilter(); load() } })), fSearchEl)
    paintFilter()
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
        el('div', { class: 'grow' }, el('a', { href: `/u/${encodeURIComponent(f.username)}` }, el('b', { text: nickOf(f.username), title: f.username })), el('small', { text: gname ? `${statusText(f)} · ${gname}` : statusText(f) })),
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
        filterBar, ...(() => { const shown = friends.filter(f => (fFilter === 'all' || (fFilter === 'online' && f.is_online) || (fFilter === 'ingame' && f.is_online && f.current_game)) && (!fSearch || f.username.toLowerCase().includes(fSearch) || nickOf(f.username).toLowerCase().includes(fSearch))); return [shown.length ? shown.map(f => row(f, uc[f.id])) : el('div', { class: 'empty', text: friends.length ? t('ff_none') : t('no_friends') })] })())
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
    let mode = 'build', tpl = TEMPLATES[0]
    const tplBox = el('div', { class: 'mode-pick' })
    const drawTpl = () => setKids(tplBox, TEMPLATES.map(x => el('button', { type: 'button', class: `mode-card ${tpl === x ? 'on' : ''}`, onclick: () => { tpl = x; mode = x.mode; drawTpl(); drawModes() } }, el('b', { text: t(x.key) }), el('small', { text: t(x.key + '_d') }))))
    const modeBox = el('div', { class: 'mode-pick' })
    const drawModes = () => setKids(modeBox, MODES.map(m => el('button', { type: 'button', class: `mode-card ${mode === m ? 'on' : ''}`, onclick: () => { mode = m; drawModes() } },
      el('b', { text: modeLabel(m) }), el('small', { text: t(`mode_${m}_d`) }))))
    drawModes(); drawTpl()
    const hue = el('input', { type: 'range', min: 0, max: 359, value: Math.floor(Math.random() * 360) })
    const prev = el('div', { class: 'thumb', style: 'width:120px;flex:none;--h:0' }, el('div', { class: 'cube' }))
    const setHue = () => prev.style.setProperty('--h', hue.value); hue.oninput = setHue; setHue()
    const mineBox = el('div')
    // Importar un juego exportado desde el Studio (.json): crea un juego nuevo con sus bloques, reglas, script y piezas
    const file = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' })
    const importBtn = el('button', { type: 'button', class: 'btn', style: 'margin-left:8px', text: t('import_game'), onclick: () => file.click() })
    file.onchange = async () => {
      try {
        const d = JSON.parse(await file.files[0].text()); if (d.format !== 'blocksy-game-1') throw new Error(t('import_bad'))
        const id = await api.createGameRow(String(d.name || 'Juego').slice(0, 40), String(d.description || '').slice(0, 200), Number(d.hue) || 200, MODES.includes(d.mode) ? d.mode : 'build')
        const g = await api.getGame(id); g.config = d.config ?? {}; g.script = String(d.script ?? '').slice(0, 20000); g.max_players = Number(d.max_players) || 20; await api.updateGameRow(g)
        const bl = (d.blocks ?? []).slice(0, 20000); for (let i = 0; i < bl.length; i += 400) await api.placeBlocks(id, bl.slice(i, i + 400))
        toast(t('game_created')); ctx.go(`create/${id}`)
      } catch (e) { toast(e.message) } finally { file.value = '' }
    }
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
        try {
          const id = await api.createGameRow(name.value.trim(), desc.value.trim(), Number(hue.value), mode)
          if (tpl.id !== 'blank') { const g = await api.getGame(id); g.mode = mode; g.config = { ...(g.config ?? {}), ...tpl.config }; g.script = tpl.script; await api.updateGameRow(g) }
          toast(t('game_created')); ctx.go(`create/${id}`)
        } catch (er) { toast(er.message) }
      } }, el('h3', { text: t('create_new'), style: 'margin-bottom:12px' }),
        el('div', { class: 'form-row' }, name, desc), el('div', { class: 'section-s', text: t('templates') }), tplBox, el('div', { class: 'section-s', text: t('mode') }), modeBox,
        el('div', { class: 'form-row', style: 'align-items:center;margin-top:12px' }, prev, el('label', { class: 'field' }, t('cover_color'), hue)),
        el('button', { class: 'btn primary', text: t('create_btn') }), importBtn),
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
    const sw = (key, label, after) => { const i = el('input', { type: 'checkbox' }); i.dataset.key = key; i.checked = !!settings[key]; i.onchange = () => { settings[key] = i.checked; saveSettings(); after?.() }; return el('label', { class: 'field check' }, i, label) }
    const rg = (key, label, min, max, step, fmt = v => v) => { const o = el('output', { text: fmt(settings[key]) }); const i = el('input', { type: 'range', min, max, step, value: settings[key] }); i.dataset.key = key; i.oninput = () => { settings[key] = +i.value; o.textContent = fmt(settings[key]); saveSettings() }; return el('label', { class: 'field' }, el('span', {}, label, ' ', o), i) }
    const sel = (key, label, opts, after) => { const s = el('select', {}, opts.map(([v, l]) => el('option', { value: v, text: l, selected: settings[key] === v }))); s.dataset.key = key; s.onchange = () => { settings[key] = s.value; saveSettings(); after?.() }; return el('label', { class: 'field' }, label, s) }
    const keyRows = () => Object.keys(KEY_ACTIONS).map(a => {
      const b = el('button', { class: 'btn small keybind', text: keyLabel(settings.keymap?.[a] ?? KEY_ACTIONS[a]) })
      b.onclick = () => {
        b.textContent = t('press_key'); const h = e => {
          e.preventDefault(); e.stopPropagation(); window.removeEventListener('keydown', h, true)
          if (e.code !== 'Escape') { settings.keymap = { ...(settings.keymap ?? {}), [a]: e.code }; for (const o of Object.keys(settings.keymap)) if (o !== a && settings.keymap[o] === e.code) delete settings.keymap[o]; saveSettings() }
          pages.settings(root, ctx)
        }
        window.addEventListener('keydown', h, true)
      }
      return el('label', { class: 'field keyrow' }, el('span', { text: t('key_' + a) }), b)
    })
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
          sel('theme', t('set_theme'), [['dark', t('theme_dark')], ['light', t('theme_light')], ['contrast', t('theme_contrast')]], applyTheme), el('label', { class: 'field' }, t('set_accent'), accent), sw('reduceMotion', t('set_motion'), applyTheme), installRow, el('div', { class: 'section-s', text: t('web_version') }), upd),
        el('div', { class: 'panel' }, el('h3', { text: t('set_quality') }),
          sel('quality', t('set_quality'), [['low', t('q_low')], ['med', t('q_med')], ['high', t('q_high')], ['ultra', t('q_ultra')]]),
          sel('fpsCap', t('set_fpscap'), [[0, t('fps_none')], [30, '30 fps'], [60, '60 fps']], () => { settings.fpsCap = +settings.fpsCap; saveSettings() }), rg('viewDistance', t('set_dist'), 30, 250, 10), rg('fov', t('set_fov'), 50, 100, 1), sw('dynRes', t('set_dynres')), sw('shadows', t('set_shadows')), sw('bloom', t('set_bloom')), sw('clouds', t('set_clouds'))),
        el('div', { class: 'panel' }, el('h3', { text: t('voice_chat') }), rg('voiceVol', t('set_voice_vol'), 0, 2, 0.05, v => Math.round(v * 100) + '%'), sw('voiceProximity', t('set_voice_prox')), sel('voiceMode', t('set_voice_mode'), [['toggle', t('voice_mode_toggle')], ['ptt', t('voice_mode_ptt')]])),
        el('div', { class: 'panel' }, el('h3', { text: t('set_music') }),
          sw('music', t('set_music')), rg('musicVol', t('set_music_vol'), 0, 1, 0.05, v => Math.round(v * 100) + '%'), sw('shuffle', t('set_shuffle')),
          sw('sfx', t('set_sfx')), rg('sfxVol', t('set_sfx_vol'), 0, 1, 0.05, v => Math.round(v * 100) + '%')),
        el('div', { class: 'panel' }, el('h3', { text: t('controls') ?? 'Controles' }),
          rg('sensitivity', t('set_sens'), 0.3, 2.5, 0.1), rg('syncMs', t('set_sync'), 40, 400, 10, v => v + ' ms'), sw('invertY', t('set_invert')), sw('chatTime', t('set_chat_time')), sw('showClock', t('set_clock')), sw('stamina', t('set_stamina')), sw('names', t('set_names')), sw('bubbles', t('set_bubbles')),
          sw('notifPopups', t('set_notif')), sw('dnd', t('dnd_setting'), () => document.getElementById('bell')?.classList.toggle('dnd', !!settings.dnd)), ...['message', 'friend_request', 'friend_accept', 'invite'].map(k => { const i = el('input', { type: 'checkbox' }); i.checked = settings.nt?.[k] !== false; i.onchange = () => { settings.nt = { ...(settings.nt ?? {}), [k]: i.checked }; saveSettings() }; return el('label', { class: 'field check sub' }, i, t('nt_' + k)) }),
          sw('minimap', t('set_minimap')), sw('compass', t('set_compass')), sw('showFps', t('set_fps')),
          rg('touchSize', t('set_touch_size'), 0.7, 1.5, 0.1), sw('leftHanded', t('set_left'))),
        el('div', { class: 'panel' }, el('h3', { text: t('about') }), el('p', { class: 'muted', text: `Blocksy ${APP_VERSION} · ${BUILD}` }),
          el('div', { class: 'row-btns' },
            el('button', { class: 'btn', text: t('whats_new'), onclick: () => showNews() }),
            el('button', { class: 'btn', text: t('credits'), onclick: () => showCredits() }),
            el('button', { class: 'btn', text: t('error_log'), onclick: () => showErrors() }),
            el('a', { class: 'btn', href: '/privacy', text: t('nav_privacy') }), el('a', { class: 'btn', href: '/changelog', text: t('nav_changelog') }), el('button', { class: 'btn', text: t('tr_check'), onclick: showTranslations }), el('button', { class: 'btn primary', text: t('report_bug'), onclick: () => window.open(reportUrl(), '_blank', 'noopener') }))),
        el('div', { class: 'panel' }, el('h3', { text: t('set_access') }),
          sel('colorblind', t('set_colorblind'), [['none', t('cb_none')], ['protanopia', t('cb_prot')], ['deuteranopia', t('cb_deut')], ['tritanopia', t('cb_trit')]]),
          rg('textScale', t('set_text_size'), 0.9, 1.5, 0.05, v => Math.round(v * 100) + '%'), sw('subtitles', t('set_subtitles')), sw('uiSounds', t('set_ui_sounds')), sw('chatFilter', t('set_chat_filter')), sw('vibrate', t('set_vibrate')), sw('noFlash', t('set_noflash')), sw('srChat', t('set_srchat')), sel('batterySaver', t('set_saver'), [['auto', t('saver_auto')], ['on', t('saver_on')], ['off', t('saver_off')]])),
        el('div', { class: 'panel' }, el('h3', { text: t('set_keys') }), ...keyRows(),
          el('button', { class: 'btn', text: t('keys_reset'), onclick: () => { settings.keymap = {}; saveSettings(); pages.settings(root, ctx) } })),
        el('div', { class: 'panel' }, el('h3', { text: t('blocked_users') }), blockedBox),
        el('div', { class: 'panel' }, el('h3', { text: t('set_stats') }),
          el('div', { class: 'stats-row' }, stat('stat_time', `${hrs}h ${mins}m`), stat('stat_placed', st.placed), stat('stat_broken', st.broken), stat('stat_games', st.games.length), stat('stat_msgs', st.msgs)),
          el('button', { class: 'btn danger', style: 'margin-top:14px', text: t('set_reset'), onclick: () => { resetSettings(); applyTheme(); pages.settings(root, ctx) } }))))
    decorateSettings(root, ctx)
  },
}

// ---------- editor avanzado ----------
const TERRAINS = ['flat', 'hills', 'islands', 'plaza', 'checker', 'void', 'obby']
const SKIES = ['day', 'dawn', 'sunset', 'night', 'space']
async function editor(root, ctx, id) {
  setKids(root, pageSkel())
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
      const wx = el('div', { class: 'chips' }, ['', 'rain', 'snow'].map(v => el('button', { type: 'button', class: `chip ${(g.config.weather ?? '') === v ? 'on' : ''}`, text: t('weather_' + (v || 'none')), onclick: () => { g.config.weather = v; draw() } })))
      const fog = el('input', { type: 'number', min: 0.25, max: 2, step: 0.1, value: g.config.fog ?? 1 }); fog.oninput = () => { g.config.fog = Number(fog.value) || 1 }
      return [el('div', { class: 'section-s', text: t('ed_terrain') }), tp, el('div', { class: 'section-s', text: t('ed_sky') }), sk, el('div', { class: 'section-s', text: t('ed_spawn') }), el('div', { class: 'form-row' }, spawn), el('div', { class: 'section-s', text: t('env_weather') }), wx, el('label', { class: 'field' }, t('env_fog'), fog)]
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
