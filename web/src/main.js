import './style.css'
import { authDb } from './supabase.js'
import * as auth from './auth.js'
import * as api from './api.js'
import { pages, toast, closeModal, stopPageTimers } from './pages.js'
import { startGame } from './game.js'
import { setLastPlayed, applyTheme, onSettings } from './settings.js'
import { applyAccess } from './access.js'
import { applyIcons } from './icons.js'
import { headshot } from './avatar.js'
import { t, applyStatic, setLang, getPref, LANGS, langName, onLang } from './i18n.js'
import { initNotifications, openInvite } from './social-ui.js'
import { openScriptModal } from './studio-ui.js'
import { registerSW, applyUpdate } from './pwa.js'
import { installErrorLog, isNewVersion } from './about.js'
import * as social from './social.js'
import { icon } from './icons.js'

const $ = id => document.getElementById(id)
let profile = null, currentGame = null, stopGame = null, mode = 'login', stopNotif = null

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
    const g = await api.getGame(arg)
    if (!g || g.owner_id !== profile.id || !api.canCreate()) { history.replaceState(null, '', '/create'); return route() }
    return play(g, { studio: true })
  }
  if (page === 'u') { page = 'profile'; arg = arg ?? profile.username }
  if (page === 'profile' && !arg) arg = profile.username
  const name = pages[page] && !(page === 'create' && !api.canCreate()) ? page : 'home'
  if (name !== page) history.replaceState(null, '', '/home')
  const navName = name === 'profile' && arg?.toLowerCase() !== profile.username.toLowerCase() ? '' : name
  document.querySelectorAll('#sidebar a').forEach(a => a.classList.toggle('active', a.dataset.page === navName))
  $('sidebar').classList.remove('open')
  stopPageTimers()
  const root = $('page'); root.replaceChildren()
  try { await pages[name](root, ctx, arg) } catch (e) { console.error(e); toast(e.message) }
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
  closeModal(); currentGame = game; if (!opts.studio) setLastPlayed(game.id)
  auth.startPresence(() => currentGame?.id)
  showScreen('game')
  // lienzo nuevo en cada partida: reutilizar el de otro juego con un contexto WebGL ya usado puede dejar la pantalla en negro
  const old = $('view'), cv = document.createElement('canvas'); cv.id = 'view'; old.replaceWith(cv)
  try {
    stopGame = startGame({ game, profile, canvas: cv, onExit: opts.studio ? () => exitStudio(game) : exitGame, studio: opts.studio ? { save: g => api.updateGameRow(g), openScript: openScriptModal } : undefined, onInvite: g => { $('game').classList.add('hidden-for-modal'); openInvite(ctx, g) } })
  } catch (e) {
    console.error(e); toast(`${game.name}: ${e.message}`); exitGame()
  }
}
function exitStudio(game) {
  stopGame?.(); stopGame = null; currentGame = null
  auth.startPresence(() => null)
  showScreen('app'); navigate(`/create/${game.id}`, true)
}
async function exitGame() {
  stopGame?.(); stopGame = null; currentGame = null
  auth.startPresence(() => null)
  showScreen('app'); route()
  if (isNewVersion()) setTimeout(() => import('./pages.js').then(m => m.showNews()), 1200)
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
$('logout').onclick = async () => { stopNotif?.(); stopNotif = null; await auth.signOut(); profile = null; showCreate(false); showScreen('auth') }
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
installErrorLog()
registerSW(() => { $('update-bar').classList.remove('hidden') })
$('update-reload').onclick = () => applyUpdate()
$('update-later').onclick = () => $('update-bar').classList.add('hidden')

applyTheme(); applyAccess(); onSettings(applyAccess); applyStatic(); buildLangSelect(); applyIcons()
authDb.auth.getSession().then(({ data }) => (data.session ? enterApp() : showScreen('auth')))

$('userchip').onclick = () => navigate('/profile')
