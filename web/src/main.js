import './style.css'
import { authDb } from './supabase.js'
import { signIn, signUp, signOut, loadProfile, startPresence, stopPresence } from './auth.js'
import { renderLobby, createGame } from './lobby.js'
import { startGame } from './game.js'

const $ = id => document.getElementById(id)
const show = name => { for (const s of ['auth', 'lobby', 'game']) $(s).classList.toggle('hidden', s !== name) }
let profile = null, currentGame = null, stopGame = null

async function enterLobby() {
  profile = await loadProfile()
  if (!profile) return show('auth')
  $('me').textContent = profile.username
  show('lobby')
  startPresence(() => currentGame?.id)
  await renderLobby(play)
}

function play(game) {
  currentGame = game
  show('game')
  stopGame = startGame({ game, profile, canvas: $('view'), onStats: t => ($('stats').textContent = t) })
}

$('leave').onclick = async () => { stopGame?.(); stopGame = null; currentGame = null; await enterLobby() }
$('logout').onclick = async () => { stopPresence(); await signOut(); show('auth') }

$('auth-form').addEventListener('submit', async e => {
  e.preventDefault()
  const mode = e.submitter?.dataset.mode
  const msg = $('auth-msg'); msg.textContent = '...'
  try {
    const email = $('email').value, pw = $('password').value
    if (mode === 'signup') await signUp(email, pw, $('username').value.trim())
    else await signIn(email, pw)
    msg.textContent = ''
    await enterLobby()
  } catch (err) { msg.textContent = err.message }
})

$('new-game').addEventListener('submit', async e => {
  e.preventDefault()
  try { await createGame($('game-name').value.trim()); $('game-name').value = ''; await renderLobby(play) }
  catch (err) { alert(err.message) }
})

authDb.auth.getSession().then(({ data }) => (data.session ? enterLobby() : show('auth')))
