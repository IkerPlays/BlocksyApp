// Acceso al proyecto GAME. Las escrituras exigen un secret de sesión emitido por la Edge Function.
import { authDb, gameDb, GAME_URL, GAME_KEY } from './supabase.js'

let session = null // { secret, player_id, username, color }

export async function openGameSession() {
  const { data: { session: s } } = await authDb.auth.getSession()
  if (!s) throw new Error('No hay sesión')
  const r = await fetch(`${GAME_URL}/functions/v1/game-session`, {
    method: 'POST',
    // Authorization con la clave anon: el gateway de Supabase la acepta aunque "Verify JWT" esté activado
    headers: { 'Content-Type': 'application/json', apikey: GAME_KEY, Authorization: `Bearer ${GAME_KEY}` },
    body: JSON.stringify({ token: s.access_token }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`No se pudo abrir la sesión de juego (${r.status}): ${j.error || j.message || j.msg || 'sin detalle'}`)
  session = j
  return session
}
export const clearGameSession = () => { session = null }

async function rpc(fn, args, retry = true) {
  if (!session) await openGameSession()
  const { error } = await gameDb.rpc(fn, { p_secret: session.secret, ...args })
  if (error && retry && /invalid session/i.test(error.message)) { await openGameSession(); return rpc(fn, args, false) }
  if (error) throw error
}

export const move = (game, p, platform = 'web') =>
  rpc('move', { p_game: game, p_x: p.x, p_y: p.y, p_z: p.z, p_ry: p.ry, p_anim: p.anim, p_platform: platform })
export const placeBlock = (game, x, y, z, kind) => rpc('place_block', { p_game: game, p_x: x, p_y: y, p_z: z, p_kind: kind })
export const breakBlock = (game, x, y, z) => rpc('break_block', { p_game: game, p_x: x, p_y: y, p_z: z })
export const say = (game, text) => rpc('say', { p_game: game, p_text: text })
export const leave = () => rpc('leave', {})
export const createGameRow = (name, desc, hue) => rpc('create_game', { p_name: name, p_desc: desc, p_hue: hue })
export const deleteGameRow = id => rpc('delete_game', { p_game: id })

// Al cerrar la pestaña: petición que sobrevive al unload
export function leaveBeacon() {
  if (!session) return
  fetch(`${GAME_URL}/rest/v1/rpc/leave`, {
    method: 'POST', keepalive: true,
    headers: { 'Content-Type': 'application/json', apikey: GAME_KEY },
    body: JSON.stringify({ p_secret: session.secret }),
  })
}

// ---------- Lecturas ----------
export async function listGames() {
  const { data } = await gameDb.from('games').select('*').order('created_at')
  return data ?? []
}
// { game_id: nº de jugadores activos }
export async function playerCounts() {
  const since = new Date(Date.now() - 15_000).toISOString()
  const { data } = await gameDb.from('player_state').select('game_id').gt('updated_at', since)
  const out = {}
  for (const r of data ?? []) out[r.game_id] = (out[r.game_id] ?? 0) + 1
  return out
}
