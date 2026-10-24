import './style.css'
import { authDb } from './supabase.js'
import * as auth from './auth.js'
import * as api from './api.js'
import { pages, toast, closeModal, stopPageTimers, setNav } from './pages.js'
// game.js (three.js, Lua...) se carga cuando hace falta: la página de inicio abre antes
let gameMod = null
const loadGame = () => gameMod ?? (gameMod = import('./game.js'))
import { setLastPlayed, applyTheme, onSettings } from './settings.js'
import { applyAccess } from './access.js'
import { applyIcons } from './icons.js'
import { headshot } from './avatar.js'
import { t, applyStatic, setLang, getPref, LANGS, langName, onLang } from './i18n.js'
import { initNotifications, openInvite } from './social-ui.js'
import { openScriptModal } from './studio-ui.js'
import { cleanCode } from './collab.js'
import { startMeetupReminders } from './social.js'
import { registerSW, applyUpdate, canInstall, installApp, isInstalled } from './pwa.js'
import { installErrorLog, isNewVersion } from './about.js'
import { installPalette } from './palette.js'
import { needsWelcome, markWelcomed, installEasterEggs } from './onboarding.js'
import { sfx } from './sfx.js'
import { settings, saveSettings } from './settings.js'
import * as social from './social.js'
import { icon } from './icons.js'

const $ = id => document.getElementById(id)
let profile = null, currentGame = null, stopGame = null, mode = 'login', stopNotif = null, stopRemind = null

function showScreen(name) {
  $('auth').classList.toggle('hidden', name !== 'auth')
  $('app').classList.toggle('hidden', name !== 'app')
  $('game').classList.toggle('hidden', name !== 'game')
}

// ---------- router (rutas reales: /home, /friends, /u/nombre...) ----------
const ctx = {
  get profile() { return profile },
  play, go: h => navigate('/' + String(h).replace(/^[#/]+/, '')),
  async refreshProfile() { profile = await auth.loadProfile(); paintChip() },
  refreshBadges: null,
}
export function navigate(path, replace = false) {
  if (path === location.pathname + location.search) return route()
  history[replace ? 'replaceState' : 'pushState'](null, '', path); route()
}
function paintChip() {
  $('chip-name').textContent = profile.username
  $('chip-avatar').style.setProperty('--c', profile.avatar_color)
  $('chip-avatar').style.setProperty('--img', `url(${headshot(profile.username, profile.avatar_color)})`)
}
// Los enlaces antiguos con # (por ejemplo el QR de la 3DS: /#link/CODIGO) se convierten en rutas
if (location.hash.length > 1) history.replaceState(null, '', '/' + location.hash.slice(1))
async function route() {
  if (!profile) return
  const parts = location.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  let page = parts[0] || 'home', arg = parts.slice(1).join('/') || undefined
  if (page === 'join') {                                          // enlace directo a un juego: /join/<id>
    const g = await api.getGame(arg)
    history.replaceState(null, '', '/home'); document.title = 'Blocksy'
    if (g) play(g); else toast(t('invite_game_gone'))
    return
  }
  if (page === 'studio') {                                        // /studio/<id>: editor tipo Roblox Studio (solo el dueño)
    if (!api.canCreate()) await api.openGameSession().catch(() => {})
    const join = cleanCode(new URLSearchParams(location.search).get('join'))
    const g = await api.getGame(arg, { forCollab: join.length === 6 })
    if (g && join.length === 6 && g.owner_id !== profile.id) return play(g, { studio: true, collab: { code: join, guest: true } })       // invitado: edita en directo, no guarda
    if (!g || g.owner_id !== profile.id || !api.canCreate()) { history.replaceState(null, '', '/create'); return route() }
    return play(g, { studio: true, collab: join.length === 6 ? { code: join, guest: false } : undefined })
  }
  if (page === 'share') {                                         // destino de "Compartir con Blocksy" (manifest share_target)
    const sp = new URLSearchParams(location.search), raw = sp.get('url') || sp.get('text') || ''; let target = ''
    try { const u = new URL(raw.match(/https?:\/\/\S+/)?.[0] ?? raw, location.origin); if (u.origin === location.origin && /^\/(join|u)\//.test(u.pathname)) target = u.pathname } catch {}
    history.replaceState(null, '', target || (sp.get('title') || sp.get('text') ? '/discover/' + encodeURIComponent((sp.get('title') || sp.get('text')).slice(0, 40)) : '/home')); return route()
  }
  if (page === 'u') { page = 'profile'; arg = arg ?? profile.username }
  if (page === 'profile' && !arg) arg = profile.username
  const name = pages[page] && !(page === 'create' && !api.canCreate()) ? page : 'home'
  if (name !== page) history.replaceState(null, '', '/home')
  { const pg = $("page"); pg.classList.remove("pg-in"); void pg.offsetWidth; pg.classList.add("pg-in") }
  const navName = name === 'profile' && arg?.toLowerCase() !== profile.username.toLowerCase() ? '' : name
  document.querySelectorAll('#sidebar a').forEach(a => a.classList.toggle('active', a.dataset.page === navName))
  $('sidebar').classList.remove('open')
  stopPageTimers()
  const root = $('page'); root.replaceChildren()
  try { await pages[name](root, ctx, arg) } catch (e) {
    console.error(e); toast(e.message)
    const retry = document.createElement('button'); retry.className = 'btn primary'; retry.textContent = t('retry'); retry.onclick = () => route()
    const box = document.createElement('div'); box.className = 'panel err-panel'; const h = document.createElement('h3'); h.textContent = t('load_failed'); const p = document.createElement('p'); p.className = 'muted'; p.textContent = String(e.message ?? e); box.append(h, p, retry); root.replaceChildren(box)
  }
  window.scrollTo(0, 0)
}
window.addEventListener('popstate', route)
// enlaces internos sin recargar la página
document.addEventListener('click', e => {
  const a = e.target.closest?.('a[href^="/"]')
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return
  e.preventDefault(); if (profile) navigate(a.getAttribute('href'))
})
// al cambiar de idioma se repinta lo estático y la página actual
onLang(() => { applyStatic(); buildLangSelect(); if (profile && !currentGame) route() })

// Crear juegos: solo web y solo la cuenta autorizada (se comprueba también en el servidor)
function showCreate(on) { for (const id of ['nav-create', 'topnav-create']) $(id).classList.toggle('hidden', !on) }

async function enterApp() {
  profile = await auth.loadProfile()
  if (!profile) return showScreen('auth')
  paintChip(); showScreen('app')
  auth.startPresence(() => currentGame?.id)
  stopNotif?.(); stopNotif = initNotifications(ctx)
  stopRemind?.(); stopRemind = startMeetupReminders((m, stage) => { const msg = t(stage === 'now' ? 'mt_now' : 'mt_soon', { title: m.title }); toast(msg); try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Blocksy', { body: msg, icon: '/icons/icon-192.png' }) } catch {} })
  social.onWallet(w => { $('coins').innerHTML = icon('coin', 18) + ' ' + (w.bcoins ?? 0) })
  social.loadWallet().catch(() => {})
  route()
  api.openGameSession().then(() => { showCreate(api.canCreate()); if (location.pathname.startsWith('/create')) route() }).catch(e => toast(t('err_game_server', { msg: e.message })))
}

// ---------- juego ----------
function play(game, opts = {}) {
  if (opts.room) {                                                 // sala privada: otro id con las mismas reglas
    const code = String(opts.room).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
    return api.joinRoom(game.id, code).then(id => play({ ...game, id, parentId: game.id, name: `${game.name} · ${code}` }, { ...opts, room: null }), e => toast(e.message))
  }
  closeModal(); currentGame = game; if (!opts.studio) { setLastPlayed(game.id); social.visitGame(game.parentId ?? game.id) }
  auth.startPresence(() => currentGame?.id)
  showScreen('game')
  // lienzo nuevo en cada partida: reutilizar el de otro juego con un contexto WebGL ya usado puede dejar la pantalla en negro
  const old = $('view'), cv = document.createElement('canvas'); cv.id = 'view'; old.replaceWith(cv)
  loadGame().then(({ startGame }) => {
    if (currentGame !== game) return
    stopGame = startGame({ game, profile, canvas: cv, onExit: opts.studio ? () => exitStudio(game, opts.collab?.guest) : exitGame, studio: opts.studio ? { save: g => api.updateGameRow(g), openScript: openScriptModal, collab: opts.collab } : undefined, onInvite: g => { $('game').classList.add('hidden-for-modal'); openInvite(ctx, g) } })
  }).catch(e => { console.error(e); toast(`${game.name}: ${e.message}`); exitGame() })
}
function exitStudio(game, guest) {
  stopGame?.(); stopGame = null; currentGame = null
  auth.startPresence(() => null)
  showScreen('app'); navigate(guest ? `/game/${game.id}` : `/create/${game.id}`, true)
}
async function exitGame() {
  stopGame?.(); stopGame = null; currentGame = null
  auth.startPresence(() => null)
  showScreen('app'); route()
  ;(window.requestIdleCallback ?? (f => setTimeout(f, 3000)))(() => loadGame().catch(() => {}))          // precarga el motor del juego mientras miras el inicio
  if (needsWelcome()) { markWelcomed(); setTimeout(() => import('./pages.js').then(m => m.showWelcome(ctx.go)), 800) }
  else if (isNewVersion()) setTimeout(() => import('./pages.js').then(m => m.showNews()), 1200)
}

// ---------- auth UI ----------
document.querySelectorAll('#auth-tabs .tab').forEach(b => b.onclick = () => {
  mode = b.dataset.mode
  document.querySelectorAll('#auth-tabs .tab').forEach(x => x.classList.toggle('active', x === b))
  $('username').classList.toggle('hidden', mode !== 'signup')
  $('username').required = mode === 'signup'
  $('auth-submit').dataset.i18n = mode === 'signup' ? 'signup' : 'login'; applyStatic()
  $('password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password'
})
$('auth-form').addEventListener('submit', async e => {
  e.preventDefault()
  const msg = $('auth-msg'); msg.className = 'msg'; msg.textContent = '...'
  try {
    const email = $('email').value, pw = $('password').value
    if (mode === 'signup') await auth.signUp(email, pw, $('username').value.trim()); else await auth.signIn(email, pw)
    msg.textContent = ''; await enterApp()
  } catch (err) { msg.className = 'msg err'; msg.textContent = err.message === 'Cuenta creada. Confirma tu email y vuelve a entrar.' ? t('account_created') : err.message }
})
$('logout').onclick = async () => { stopNotif?.(); stopNotif = null; stopRemind?.(); stopRemind = null; await auth.signOut(); profile = null; showCreate(false); showScreen('auth') }
function buildLangSelect() {
  const s = $('auth-lang'); s.replaceChildren(...['auto', ...LANGS].map(l => { const o = document.createElement('option'); o.value = l; o.textContent = l === 'auto' ? t('lang_auto') : langName(l); o.selected = l === getPref(); return o }))
  s.onchange = () => setLang(s.value)
}

// ---------- shell UI ----------
$('burger').onclick = () => $('sidebar').classList.toggle('open')
$('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal() })
new MutationObserver(() => { if ($('modal').classList.contains('hidden')) $('game').classList.remove('hidden-for-modal') }).observe($('modal'), { attributes: true, attributeFilter: ['class'] })
$('search').addEventListener('submit', e => { e.preventDefault(); const q = $('search-input').value.trim(); navigate(q ? `/discover/${encodeURIComponent(q)}` : '/discover') })
window.addEventListener('beforeunload', () => { api.leaveBeacon() })
setNav(h => ctx.go(h))
installPalette(() => (profile ? { go: ctx.go, play, canCreate: api.canCreate, games: api.listGames, setTheme: v => { settings.theme = v; saveSettings(); applyTheme() } } : null)); // aviso para instalar la app: a partir de la 3.ª visita, una sola vez (se puede cerrar para siempre)
{
  let visits = 0, dismissed = false; try { visits = +(localStorage.getItem('blocksy.visits') || 0) + 1; localStorage.setItem('blocksy.visits', String(visits)); dismissed = localStorage.getItem('blocksy.installDismissed') === '1' } catch {}
  const show = () => {
    if (dismissed || visits < 3 || isInstalled() || !canInstall() || document.getElementById('install-banner')) return
    const b = document.createElement('div'); b.id = 'install-banner'
    const txt = document.createElement('span'); txt.textContent = t('install_banner')
    const yes = document.createElement('button'); yes.className = 'btn primary tiny'; yes.textContent = t('install_btn'); yes.onclick = async () => { await installApp(); b.remove() }
    const no = document.createElement('button'); no.className = 'btn tiny'; no.textContent = '×'; no.onclick = () => { try { localStorage.setItem('blocksy.installDismissed', '1') } catch {} b.remove() }
    b.append(txt, yes, no); document.body.append(b)
  }
  window.addEventListener('blocksy:installable', () => setTimeout(show, 4000)); setTimeout(show, 6000)
}
// accesibilidad: enlace para saltar al contenido, nombres para botones solo con icono y aviso de página nueva
{
  const skip = document.createElement('a'); skip.href = '#page'; skip.className = 'skip-link'; skip.textContent = t('skip_content'); skip.onclick = e => { e.preventDefault(); const p = document.getElementById('page'); p.setAttribute('tabindex', '-1'); p.focus() }; document.body.prepend(skip)
  const label = root => root.querySelectorAll?.('button:not([aria-label]), a:not([aria-label])').forEach(b => { if (!b.textContent.trim() && b.title) b.setAttribute('aria-label', b.title) })
  new MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(n => n.nodeType === 1 && (n.matches?.('button,a') ? label({ querySelectorAll: () => [n] }) : label(n))) }).observe(document.body, { childList: true, subtree: true })
  const live = document.createElement('div'); live.setAttribute('aria-live', 'polite'); live.className = 'sr-only'; document.body.append(live); window.addEventListener('popstate', () => setTimeout(() => { live.textContent = document.title }, 300))
}
installErrorLog(); installEasterEggs(m => toast(m))
document.addEventListener('click', e => { if (settings.uiSounds && e.target.closest?.('.btn, #sidebar a, .tab, .card, .game-card, .person, .shop-card button')) sfx.click() }, true)
registerSW(() => { $('update-bar').classList.remove('hidden') })
$('update-reload').onclick = () => applyUpdate()
$('update-later').onclick = () => $('update-bar').classList.add('hidden')

applyTheme(); applyAccess(); onSettings(applyAccess); applyStatic(); buildLangSelect(); applyIcons()
authDb.auth.getSession().then(({ data }) => (data.session ? enterApp() : showScreen('auth')))

$('userchip').onclick = () => navigate('/profile')
