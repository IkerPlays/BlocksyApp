// Acceso al proyecto GAME. Las escrituras exigen un secret de sesión emitido por la Edge Function.
import { authDb, gameDb, GAME_URL, GAME_KEY, storeDb, STORE_URL, STORE_KEY, HAS_STORE } from './supabase.js'

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
export const clearGameSession = () => { session = null; storeSession = null }

// Sesión del proyecto STORE (la misma Edge Function game-session, desplegada también allí): sirve para crear/editar juegos y pedir precios firmados
let storeSession = null
export async function openStoreSession() {
  const { data: { session: s } } = await authDb.auth.getSession()
  if (!s) throw new Error('No hay sesión')
  const r = await fetch(`${STORE_URL}/functions/v1/game-session`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: STORE_KEY, Authorization: `Bearer ${STORE_KEY}` },
    body: JSON.stringify({ token: s.access_token }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`No se pudo abrir la sesión de la tienda (${r.status}): ${j.error || j.message || 'sin detalle'}`)
  return (storeSession = j)
}
export async function storeRpc(fn, args, retry = true) {
  if (!storeSession) await openStoreSession()
  const { data, error } = await storeDb.rpc(fn, { p_secret: storeSession.secret, ...args })
  if (error && retry && /invalid session/i.test(error.message)) { storeSession = null; return storeRpc(fn, args, false) }
  if (error) throw error
  return data
}
// El servidor decide quién puede crear juegos (función game-session + tabla sessions): solo cuentas autorizadas
export const canCreate = () => session?.can_create === true

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
export const linkApprove = code => rpc('link_approve', { p_code: code })
// Reglas mínimas de cada juego que valida GAME (construir / chat): se envían a GAME tras guardar el juego (en STORE si hay, si no en GAME)
const rulesOf = g => ({ allow_build: g.config?.allow_build, allow_chat: g.config?.allow_chat })
const syncRules = (id, mode, config) => rpc('upsert_game_rules', { p_game: id, p_mode: mode, p_config: { allow_build: config?.allow_build, allow_chat: config?.allow_chat } })

export const createGameRow = async (name, desc, hue, mode = 'build') => {
  if (HAS_STORE) {
    const id = await storeRpc('create_game', { p_name: name, p_desc: desc, p_hue: hue, p_mode: mode })
    await syncRules(id, mode, {})
    return id
  }
  if (!session) await openGameSession()
  const { data, error } = await gameDb.rpc('create_game', { p_secret: session.secret, p_name: name, p_desc: desc, p_hue: hue, p_mode: mode })
  if (error && /p_mode|could not find|does not exist/i.test(error.message)) {         // GAME sin v2.sql: crear sin modo
    const r = await gameDb.rpc('create_game', { p_secret: session.secret, p_name: name, p_desc: desc, p_hue: hue })
    if (r.error) throw r.error
    return r.data
  }
  if (error) throw error
  return data
}
export const updateGameRow = async g => {
  if (HAS_STORE) {
    await storeRpc('update_game', { p_game: g.id, p_name: g.name, p_desc: g.description, p_hue: g.hue, p_max: g.max_players, p_mode: g.mode, p_config: g.config ?? {}, p_script: g.script ?? '' })
    return syncRules(g.id, g.mode, g.config)
  }
  return rpc('update_game', { p_game: g.id, p_name: g.name, p_desc: g.description, p_hue: g.hue, p_max: g.max_players, p_mode: g.mode, p_config: g.config ?? {}, p_script: g.script ?? '' })
}
export const deleteGameRow = async id => {
  if (HAS_STORE) { await storeRpc('delete_game', { p_game: id }); return rpc('delete_game_data', { p_game: id }) }
  return rpc('delete_game', { p_game: id })
}

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
export async function getGame(id) {
  const { data } = await (HAS_STORE ? storeDb : gameDb).from('games').select('*').eq('id', id).maybeSingle()
  return data
}
export async function listGames() {
  const { data } = await (HAS_STORE ? storeDb : gameDb).from('games').select('*').order('created_at')
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
