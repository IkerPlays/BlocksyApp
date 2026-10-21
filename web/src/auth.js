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
export function startPresence(fn) {
  getGame = fn ?? getGame
  const tick = () => authDb.rpc('touch_presence', { p_game: getGame() ?? null })
  tick(); clearInterval(beat); beat = setInterval(tick, 30_000)
}
export function stopPresence() { clearInterval(beat) }

export async function searchPeople(q) {
  let req = authDb.from('profiles_public').select('*').order('is_online', { ascending: false }).order('username').limit(30)
  if (q) req = req.ilike('username', `%${q}%`)
  return (await req).data ?? []
}
export async function listFriends(myId) {
  const { data: rows } = await authDb.from('friendships').select('friend_id').eq('user_id', myId)
  const ids = (rows ?? []).map(r => r.friend_id)
  if (!ids.length) return []
  const { data } = await authDb.from('profiles_public').select('*').in('id', ids).order('is_online', { ascending: false })
  return data ?? []
}
export const addFriend = (myId, friendId) => authDb.from('friendships').upsert({ user_id: myId, friend_id: friendId })
export const removeFriend = (myId, friendId) => authDb.from('friendships').delete().match({ user_id: myId, friend_id: friendId })
