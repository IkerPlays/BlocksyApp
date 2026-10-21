import './style.css'
import { authDb } from './supabase.js'
import * as auth from './auth.js'
import * as api from './api.js'
import { pages, toast, closeModal, stopPageTimers } from './pages.js'
import { startGame } from './game.js'
import { setLastPlayed, applyTheme } from './settings.js'
import { applyIcons } from './icons.js'
import { headshot } from './avatar.js'
import { t, applyStatic, setLang, getLang, LANGS, langName, onLang } from './i18n.js'
import { initNotifications, openInvite } from './social-ui.js'
import { registerSW } from './pwa.js'

const $ = id => document.getElementById(id)
let profile = null, currentGame = null, stopGame = null, mode = 'login', stopNotif = null

function showScreen(name) {
  $('auth').classList.toggle('hidden', name !== 'auth')
  $('app').classList.toggle('hidden', name !== 'app')
  $('game').classList.toggle('hidden', name !== 'game')
}

// ---------- router ----------
const ctx = {
  get profile() { return profile },
  play, go: h => (location.hash = h),
  async refreshProfile() { profile = await auth.loadProfile(); paintChip() },
  refreshBadges: null,
}
function paintChip() {
  $('chip-name').textContent = profile.username
  $('chip-avatar').style.setProperty('--c', profile.avatar_color)
  $('chip-avatar').style.setProperty('--img', `url(${headshot(profile.username, profile.avatar_color)})`)
}
async function route() {
  if (!profile) return
  const hash = location.hash.slice(1) || 'home'
  // enlace directo a un juego: #join/<id>
  if (hash.startsWith('join/')) {
    const g = await api.getGame(hash.slice(5))
    location.hash = 'home'
    if (g) play(g); else toast(t('invite_game_gone'))
    return
  }
  const i = hash.indexOf('/'), page = i < 0 ? hash : hash.slice(0, i), arg = i < 0 ? undefined : hash.slice(i + 1)
  const name = pages[page] && !(page === 'create' && !api.canCreate()) ? page : 'home'
  document.querySelectorAll('#sidebar a').forEach(a => a.classList.toggle('active', a.dataset.page === name))
  $('sidebar').classList.remove('open')
  stopPageTimers()
  const root = $('page'); root.replaceChildren()
  try { await pages[name](root, ctx, arg ? decodeURIComponent(arg) : undefined) } catch (e) { console.error(e); toast(e.message) }
}
window.addEventListener('hashchange', route)
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
  route()
  api.openGameSession().then(() => { showCreate(api.canCreate()); if (location.hash.startsWith('#create')) route() }).catch(e => toast(t('err_game_server', { msg: e.message })))
}

// ---------- juego ----------
function play(game) {
  closeModal(); currentGame = game; setLastPlayed(game.id)
  auth.startPresence(() => currentGame?.id)
  showScreen('game')
  stopGame = startGame({ game, profile, canvas: $('view'), onExit: exitGame, onInvite: g => { $('game').classList.add('hidden-for-modal'); openInvite(ctx, g) } })
}
async function exitGame() {
  stopGame?.(); stopGame = null; currentGame = null
  auth.startPresence(() => null)
  showScreen('app'); route()
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
  const s = $('auth-lang'); s.replaceChildren(...LANGS.map(l => { const o = document.createElement('option'); o.value = l; o.textContent = langName(l); o.selected = l === getLang(); return o }))
  s.onchange = () => setLang(s.value)
}

// ---------- shell UI ----------
$('burger').onclick = () => $('sidebar').classList.toggle('open')
$('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal() })
new MutationObserver(() => { if ($('modal').classList.contains('hidden')) $('game').classList.remove('hidden-for-modal') }).observe($('modal'), { attributes: true, attributeFilter: ['class'] })
$('search').addEventListener('submit', e => { e.preventDefault(); const q = $('search-input').value.trim(); location.hash = q ? `discover/${encodeURIComponent(q)}` : 'discover' })
window.addEventListener('beforeunload', () => { api.leaveBeacon() })
registerSW(() => { $('update-bar').classList.remove('hidden') })
$('update-reload').onclick = () => location.reload()

applyTheme(); applyStatic(); buildLangSelect(); applyIcons()
authDb.auth.getSession().then(({ data }) => (data.session ? enterApp() : showScreen('auth')))
