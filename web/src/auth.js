import { authDb } from './supabase.js'
import { leave, clearGameSession } from './api.js'

export async function signIn(email, password) {
  const { error } = await authDb.auth.signInWithPassword({ email, password })
  if (error) throw error
}
export async function signUp(email, password, username) {
  const { data, error } = await authDb.auth.signUp({ email, password, options: { data: { username } } })
  if (error) throw error
  if (!data.session) throw new Error('Cuenta creada. Confirma tu email y vuelve a entrar.')
}
export async function signOut() {
  stopPresence()
  try { await leave() } catch {}
  await authDb.rpc('go_offline')
  clearGameSession()
  await authDb.auth.signOut()
}

export async function loadProfile() {
  const { data: { user } } = await authDb.auth.getUser()
  if (!user) return null
  const { data } = await authDb.from('profiles_public').select('*').eq('id', user.id).single()
  return data
}
export async function saveColor(id, avatar_color) {
  const { error } = await authDb.from('profiles').update({ avatar_color }).eq('id', id)
  if (error) throw error
}

let beat, getGame = () => null
// Presencia: aviso cada 20 s, y al volver a la pestaña / recuperar la conexión (el estado online dura 75 s)
const tick = () => authDb.rpc('touch_presence', { p_game: getGame() ?? null }).then(() => {}, () => {})
export function startPresence(fn) {
  getGame = fn ?? getGame
  tick(); clearInterval(beat); beat = setInterval(tick, 20_000)
}
export function stopPresence() { clearInterval(beat) }
document.addEventListener('visibilitychange', () => { if (!document.hidden && beat) tick() })
window.addEventListener('online', () => { if (beat) tick() })
window.addEventListener('pagehide', () => { if (beat) authDb.rpc('go_offline').then(() => {}, () => {}) })
