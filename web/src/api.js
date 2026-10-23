// Acceso al proyecto GAME. Las escrituras exigen un secret de sesión emitido por la Edge Function.
import { authDb, gameDb, GAME_URL, GAME_KEY, storeDb, STORE_URL, STORE_KEY, HAS_STORE } from './supabase.js'

let session = null // { secret, player_id, username, color }

// ---- STORE: estado y modo de emergencia ----
// "Failed to fetch" = el navegador no pudo ni hablar con el servidor (proyecto pausado, función sin desplegar o sin CORS).
// Si STORE no responde, la web usa el modo anterior (tienda en AUTH, juegos en GAME) en vez de romperse.
const isNet = e => /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(String(e?.message ?? e))
const authHeaders = key => (/^eyJ/.test(key) ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key })      // las claves nuevas (sb_publishable_) no son JWT: no van en Authorization
let storeState = { at: 0, read: true, write: true, why: '' }
export const storeStatus = () => storeState
async function probeStore(force = false) {
  if (!HAS_STORE) return storeState = { at: Date.now(), read: false, write: false, why: '' }
  if (!force && Date.now() - storeState.at < 60_000) return storeState
  let read = true, write = true, why = ''
  try { await fetch(`${STORE_URL}/rest/v1/games?select=id&limit=1`, { headers: authHeaders(STORE_KEY) }) } catch { read = false; write = false; why = 'STORE no responde (proyecto pausado o URL incorrecta)' }
  if (read && !storeSession) { try { await openStoreSession() } catch (e) { write = false; why = e.message } }
  return storeState = { at: Date.now(), read, write, why }
}
export const storeReadOk = async () => HAS_STORE && (await probeStore()).read
export const storeWriteOk = async () => HAS_STORE && (await probeStore()).write
const FB_KEY = 'blocksy.fbGames'     // juegos creados en GAME mientras STORE no estaba disponible (solo este dispositivo)
const fbIds = () => { try { return JSON.parse(localStorage.getItem(FB_KEY) || '[]') } catch { return [] } }
const addFb = id => { try { localStorage.setItem(FB_KEY, JSON.stringify([...new Set([...fbIds(), id])])) } catch {} }

export async function openGameSession() {
  const { data: { session: s } } = await authDb.auth.getSession()
  if (!s) throw new Error('No hay sesión')
  const r = await fetch(`${GAME_URL}/functions/v1/game-session`, {
    method: 'POST',
    // Authorization con la clave anon: el gateway de Supabase la acepta aunque "Verify JWT" esté activado
    headers: { 'Content-Type': 'application/json', ...authHeaders(GAME_KEY) },
    body: JSON.stringify({ token: s.access_token }),
  }).catch(e => { throw new Error(isNet(e) ? 'No se pudo conectar con el servidor GAME (¿proyecto pausado o función game-session sin desplegar?)' : e.message) })
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
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(STORE_KEY) },
    body: JSON.stringify({ token: s.access_token }),
  }).catch(e => { throw new Error(isNet(e) ? 'La función game-session de STORE no responde: despliégala en STORE con Verify JWT desactivado (supabase/README.md, paso 3)' : e.message) })
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

let hatOk = true      // GAME con v4.sql acepta p_hat; si no, se envía sin sombrero
export const move = async (game, p, platform = 'web') => {
  const base = { p_game: game, p_x: p.x, p_y: p.y, p_z: p.z, p_ry: p.ry, p_anim: p.anim, p_platform: platform }
  if (hatOk && p.hat) {
    try { return await rpc('move', { ...base, p_hat: p.hat }) } catch (e) { if (/p_hat|could not find|schema cache/i.test(e.message)) hatOk = false; else throw e }
  }
  return rpc('move', base)
}
export const placeBlock = (game, x, y, z, kind) => rpc('place_block', { p_game: game, p_x: x, p_y: y, p_z: z, p_kind: kind })
// Varios bloques de una vez ([x, y, z, tipo]; tipo -1 = borrar). Si el servidor aún no tiene place_blocks (GAME v5), se hace uno a uno.
let bulkOk = true
export async function placeBlocks(game, list) {
  if (bulkOk) {
    try { await rpc('place_blocks', { p_game: game, p_blocks: list }); return } catch (e) { if (!/place_blocks|schema cache|PGRST202/i.test(e.message ?? '')) throw e; bulkOk = false }
  }
  let i = 0
  const worker = async () => { while (i < list.length) { const [x, y, z, k] = list[i++]; await (k < 0 ? breakBlock(game, x, y, z) : placeBlock(game, x, y, z, k)) } }
  await Promise.all([worker(), worker(), worker(), worker()])
}
export const breakBlock = (game, x, y, z) => rpc('break_block', { p_game: game, p_x: x, p_y: y, p_z: z })
// Mejores tiempos compartidos (GAME v5): devuelve tu puesto y el top 5. Si el servidor aún no lo tiene, devuelve null.
export async function submitTime(game, ms) {
  try {
    const rank = await rpc('submit_time', { p_game: game, p_ms: Math.round(ms) })
    const { data } = await gameDb.from('best_times').select('username,ms').eq('game_id', game).order('ms').limit(5)
    return { rank: Number(rank) || 0, top: data ?? [] }
  } catch { return null }
}
// Salas privadas (GAME v6): mismo juego, id propio por código. Devuelve el id de la sala.
export const joinRoom = (parent, code) => rpc('join_room', { p_parent: parent, p_code: code })
export const roomFromName = name => (/ · ([A-Z0-9]{3,12})$/.exec(String(name ?? '')) ?? [])[1] ?? null
export const say = (game, text) => rpc('say', { p_game: game, p_text: text })
export const leave = () => rpc('leave', {})
export const linkApprove = code => rpc('link_approve', { p_code: code })
// Reglas mínimas de cada juego que valida GAME (construir / chat): se envían a GAME tras guardar el juego (en STORE si hay, si no en GAME)
const rulesOf = g => ({ allow_build: g.config?.allow_build, allow_chat: g.config?.allow_chat })
const syncRules = (id, mode, config) => rpc('upsert_game_rules', { p_game: id, p_mode: mode, p_config: { allow_build: config?.allow_build, allow_chat: config?.allow_chat } })

export const createGameRow = async (name, desc, hue, mode = 'build') => {
  const viaStore = await storeWriteOk()
  if (viaStore) {
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
  if (HAS_STORE) addFb(data)
  return data
}
export const updateGameRow = async g => {
  if (HAS_STORE && !fbIds().includes(g.id) && await storeWriteOk()) {
    await storeRpc('update_game', { p_game: g.id, p_name: g.name, p_desc: g.description, p_hue: g.hue, p_max: g.max_players, p_mode: g.mode, p_config: g.config ?? {}, p_script: g.script ?? '' })
    return syncRules(g.id, g.mode, g.config)
  }
  return rpc('update_game', { p_game: g.id, p_name: g.name, p_desc: g.description, p_hue: g.hue, p_max: g.max_players, p_mode: g.mode, p_config: g.config ?? {}, p_script: g.script ?? '' })
}
export const deleteGameRow = async id => {
  if (HAS_STORE && !fbIds().includes(id) && await storeWriteOk()) { await storeRpc('delete_game', { p_game: id }); return rpc('delete_game_data', { p_game: id }) }
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
  if (await storeReadOk()) { const { data } = await storeDb.from('games').select('*').eq('id', id).maybeSingle(); if (data) return data }
  const { data } = await gameDb.from('games').select('*').eq('id', id).maybeSingle()
  return data
}
export async function listGames() {
  if (!(await storeReadOk())) { const { data } = await gameDb.from('games').select('*').order('created_at'); return data ?? [] }
  const { data } = await storeDb.from('games').select('*').order('created_at')
  const out = data ?? [], ids = fbIds().filter(i => !out.some(g => g.id === i))
  if (ids.length) { const r = await gameDb.from('games').select('*').in('id', ids); out.push(...(r.data ?? [])) }      // creados en modo de emergencia
  return out
}
// { game_id: nº de jugadores activos }
export async function playerCounts() {
  const since = new Date(Date.now() - 15_000).toISOString()
  const { data } = await gameDb.from('player_state').select('game_id').gt('updated_at', since)
  const out = {}
  for (const r of data ?? []) out[r.game_id] = (out[r.game_id] ?? 0) + 1
  return out
}

// Eventos de partida (recoger fragmentos, ser atrapado...) y NPC anfitrión (GAME v4.sql)
export const gameEvent = (game, kind, payload = {}) => rpc('game_event', { p_game: game, p_kind: kind, p_payload: payload })
export async function npcTick(game, id, p) {
  if (!session) await openGameSession()
  const { data, error } = await gameDb.rpc('npc_tick', { p_secret: session.secret, p_game: game, p_id: id, p_x: p.x, p_y: p.y, p_z: p.z, p_ry: p.ry, p_anim: p.anim ?? 'idle' })
  if (error) throw error
  return data === true
}
export const npcRelease = (game, id) => rpc('npc_release', { p_game: game, p_id: id })
