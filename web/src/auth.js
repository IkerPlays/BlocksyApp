import { authDb } from './supabase.js'

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
  await authDb.rpc('go_offline')
  await authDb.auth.signOut()
}

export async function loadProfile() {
  const { data: { user } } = await authDb.auth.getUser()
  if (!user) return null
  const { data } = await authDb.from('profiles_public').select('*').eq('id', user.id).single()
  return data
}

// Marca al usuario como online mientras la pestaña esté abierta
let beat
export function startPresence(getGameId) {
  const tick = () => authDb.rpc('touch_presence', { p_game: getGameId() ?? null })
  tick()
  clearInterval(beat)
  beat = setInterval(tick, 30_000)
}
export function stopPresence() { clearInterval(beat) }

export async function listPeople() {
  const { data } = await authDb.from('profiles_public').select('*').order('is_online', { ascending: false }).order('username').limit(50)
  return data ?? []
}
