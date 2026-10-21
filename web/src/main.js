import './style.css'
import { authDb } from './supabase.js'
import * as auth from './auth.js'
import * as api from './api.js'
import { pages, toast, closeModal } from './pages.js'
import { startGame } from './game.js'
import { setLastPlayed } from './settings.js'
import { applyIcons } from './icons.js'

const $ = id => document.getElementById(id)
let profile = null, currentGame = null, stopGame = null, mode = 'login'

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
}
function paintChip() {
  $('chip-name').textContent = profile.username
  $('chip-avatar').style.setProperty('--c', profile.avatar_color)
}
async function route() {
  if (!profile) return
  const [page, arg] = (location.hash.slice(1) || 'home').split('/')
  const name = pages[page] && !(page === 'create' && !api.canCreate()) ? page : 'home'
  document.querySelectorAll('#sidebar a').forEach(a => a.classList.toggle('active', a.dataset.page === name))
  $('sidebar').classList.remove('open')
  const root = $('page'); root.replaceChildren()
  try { await pages[name](root, ctx, arg ? decodeURIComponent(arg) : undefined) } catch (e) { console.error(e); toast(e.message) }
}
window.addEventListener('hashchange', route)

// Crear juegos: solo web y solo la cuenta autorizada (se comprueba también en el servidor)
function showCreate(on) { for (const id of ['nav-create', 'topnav-create']) $(id).classList.toggle('hidden', !on) }

async function enterApp() {
  profile = await auth.loadProfile()
  if (!profile) return showScreen('auth')
  paintChip(); showScreen('app')
  auth.startPresence(() => currentGame?.id)
  route()
  api.openGameSession().then(() => { showCreate(api.canCreate()); if (location.hash.startsWith('#create')) route() }).catch(e => toast('Servidor de juego: ' + e.message))
}

// ---------- juego ----------
function play(game) {
  closeModal(); currentGame = game; setLastPlayed(game.id)
  auth.startPresence(() => currentGame?.id)
  showScreen('game')
  stopGame = startGame({ game, profile, canvas: $('view'), onExit: exitGame })
}
async function exitGame() {
  stopGame?.(); stopGame = null; currentGame = null
  auth.startPresence(() => null)
  showScreen('app'); route()
}

// ---------- auth UI ----------
document.querySelectorAll('#auth-tabs .tab').forEach(b => b.onclick = () => {
  mode = b.dataset.mode
  document.querySelectorAll('#auth-tabs .tab').forEach(t => t.classList.toggle('active', t === b))
  $('username').classList.toggle('hidden', mode !== 'signup')
  $('username').required = mode === 'signup'
  $('auth-submit').textContent = mode === 'signup' ? 'Crear cuenta' : 'Entrar'
  $('password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password'
})
$('auth-form').addEventListener('submit', async e => {
  e.preventDefault()
  const msg = $('auth-msg'); msg.className = 'msg'; msg.textContent = '...'
  try {
    const email = $('email').value, pw = $('password').value
    if (mode === 'signup') await auth.signUp(email, pw, $('username').value.trim()); else await auth.signIn(email, pw)
    msg.textContent = ''; await enterApp()
  } catch (err) { msg.className = 'msg err'; msg.textContent = err.message }
})
$('logout').onclick = async () => { await auth.signOut(); profile = null; showCreate(false); showScreen('auth') }

// ---------- shell UI ----------
$('burger').onclick = () => $('sidebar').classList.toggle('open')
$('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal() })
$('search').addEventListener('submit', e => { e.preventDefault(); const q = $('search-input').value.trim(); location.hash = q ? `discover/${encodeURIComponent(q)}` : "discover" })
window.addEventListener('beforeunload', () => { api.leaveBeacon() })

applyIcons()
authDb.auth.getSession().then(({ data }) => (data.session ? enterApp() : showScreen('auth')))
