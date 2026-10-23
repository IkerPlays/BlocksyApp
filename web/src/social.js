// Amigos, solicitudes, chat privado, notificaciones e invitaciones (proyecto AUTH)
import { authDb, storeDb, HAS_STORE } from './supabase.js'
import { storeRpc } from './api.js'

const rpc = async (fn, args) => { const { data, error } = await authDb.rpc(fn, args); if (error) throw error; return data }
const ERR = { 'user not found': 'user_not_found', 'cannot add yourself': 'cant_self' }
export const errKey = e => ERR[(e.message || '').toLowerCase()] ?? null

export const sendRequest = async name => { const r = await rpc('send_friend_request', { p_username: name }); if (r === 'sent' || r === 'accepted') missionAdd('friend_1'); return r }      // 'sent' | 'accepted' | 'already_friends' | 'already_sent'
export const respondRequest = (id, accept) => rpc('respond_friend_request', { p_id: id, p_accept: accept })
export const cancelRequest = id => rpc('cancel_friend_request', { p_id: id })
export const removeFriend = id => rpc('remove_friend', { p_friend: id })
export const myRequests = async () => (await rpc('my_requests')) ?? []
export const unreadCounts = async () => (await rpc('unread_counts')) ?? {}
export const editMessage = (id, body) => rpc('edit_message', { p_id: id, p_body: body })
export const deleteMessage = id => rpc('delete_message', { p_id: id })
export const markRead = from => rpc('mark_read', { p_from: from })
export const sendMessage = (to, body) => rpc('send_message', { p_to: to, p_body: body })
export const inviteFriend = (friend, game, name) => rpc('invite_friend', { p_friend: friend, p_game: game, p_game_name: name })
export const readNotifications = () => rpc('read_notifications')
export const clearNotifications = () => rpc('clear_notifications')

export async function listFriends(myId) {
  const { data: rows } = await authDb.from('friendships').select('friend_id').eq('user_id', myId)
  const ids = (rows ?? []).map(r => r.friend_id)
  if (!ids.length) return []
  const { data } = await authDb.from('profiles_public').select('*').in('id', ids).order('is_online', { ascending: false }).order('username')
  return data ?? []
}
export async function conversation(myId, friendId, limit = 80) {
  const { data } = await authDb.from('messages').select('*')
    .or(`and(from_id.eq.${myId},to_id.eq.${friendId}),and(from_id.eq.${friendId},to_id.eq.${myId})`).order('id', { ascending: false }).limit(limit)
  return (data ?? []).reverse()
}
export async function notifications() {
  const { data } = await authDb.from('notifications').select('*').order('id', { ascending: false }).limit(40)
  return data ?? []
}

// Suscripción en tiempo real + sondeo de respaldo. cb(kind, row)
export function watch(myId, cb) {
  let lastMsg = 0, lastNot = 0, stop = false
  const seen = { m: new Set(), n: new Set() }
  const fire = (k, row, set) => { if (set.has(row.id)) return; set.add(row.id); cb(k, row) }
  const ch = authDb.channel(`social:${myId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `to_id=eq.${myId}` }, p => { lastMsg = Math.max(lastMsg, p.new.id); fire('message', p.new, seen.m) })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${myId}` }, p => { lastNot = Math.max(lastNot, p.new.id); fire('notification', p.new, seen.n) })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, () => cb('requests'))
    .subscribe()
  ;(async () => {                                              // punto de partida: lo ya existente no avisa
    const [{ data: m }, { data: n }] = await Promise.all([
      authDb.from('messages').select('id').eq('to_id', myId).order('id', { ascending: false }).limit(1),
      authDb.from('notifications').select('id').eq('user_id', myId).order('id', { ascending: false }).limit(1)])
    lastMsg = Math.max(lastMsg, m?.[0]?.id ?? 0); lastNot = Math.max(lastNot, n?.[0]?.id ?? 0)
  })()
  const poll = setInterval(async () => {
    if (stop || document.hidden) return
    try {
      const { data: m } = await authDb.from('messages').select('*').eq('to_id', myId).gt('id', lastMsg).order('id').limit(20)
      for (const r of m ?? []) { lastMsg = Math.max(lastMsg, r.id); fire('message', r, seen.m) }
      const { data: n } = await authDb.from('notifications').select('*').eq('user_id', myId).gt('id', lastNot).order('id').limit(20)
      for (const r of n ?? []) { lastNot = Math.max(lastNot, r.id); fire('notification', r, seen.n) }
    } catch {}
  }, 6000)
  return () => { stop = true; clearInterval(poll); authDb.removeChannel(ch) }
}

// Perfil por nombre exacto. Si get_profile aún no está en la base de datos (falta ejecutar social.sql), se reconstruye con lo que sí hay.
export async function getProfile(name, me) {
  const r = await authDb.rpc('get_profile', { p_username: name })
  if (!r.error) return { data: r.data, error: null }
  const miss = /get_profile|schema cache|does not exist|Could not find/i.test(r.error.message || '')
  if (!miss) return { data: null, error: r.error }
  let row = (await authDb.from('profiles_public').select('*').ilike('username', name).limit(1)).data?.[0]
  if (!row) { const f = await authDb.rpc('find_user', { p_username: name }); if (f.data) row = { id: f.data.id, username: f.data.username, avatar_color: f.data.avatar_color } }
  if (!row) return { data: null, error: null }
  const friends = row.id === me ? [] : (await authDb.from('friendships').select('friend_id').eq('user_id', me).eq('friend_id', row.id)).data ?? []
  const rel = row.id === me ? 'self' : friends.length ? 'friends' : 'none'
  return { data: { id: row.id, username: row.username, avatar_color: row.avatar_color, bio: '', created_at: row.created_at ?? new Date().toISOString(), relation: rel, request_id: null, friend_count: 0,
    is_online: row.is_online ?? null, current_game: row.current_game ?? null, legacy: true }, error: null }
}
export const setBio = (myId, bio) => authDb.from('profiles').update({ bio }).eq('id', myId)

// ---------- BCoins y tienda ----------
let wallet = null, shopCache = null; const wsubs = new Set()
export const getWallet = () => wallet
export const onWallet = f => { wsubs.add(f); return () => wsubs.delete(f) }
const setWallet = w => { wallet = { ...(wallet ?? {}), ...w }; wsubs.forEach(f => f(wallet)) }
export async function loadWallet() { const w = await rpc('my_wallet'); if (w) setWallet(w); return wallet }
export async function claimDaily() { const r = await rpc('claim_daily'); await loadWallet(); return r }
export async function earnCoins(amount, reason) { try { const n = await rpc('earn_coins', { p_amount: amount, p_reason: reason }); if (n > 0) await loadWallet(); return n } catch { return 0 } }
export async function listShop() {
  if (shopCache) return shopCache
  const { data } = await (HAS_STORE ? storeDb : authDb).from('shop_items').select('*').order('sort')
  return (shopCache = data ?? [])
}
// Con STORE: se pide allí un presupuesto firmado (precio y, en un cofre, el objeto que toca) y se canjea en AUTH, que comprueba la firma
const redeem = q => rpc('shop_redeem', { p_op: q.op, p_item: q.item, p_kind: q.kind, p_price: q.price, p_refund: q.refund, p_exp: q.exp, p_nonce: q.nonce, p_sig: q.sig })
export async function buyItem(id) {
  const r = HAS_STORE ? await redeem(await storeRpc('shop_quote', { p_item: id })) : await rpc('buy_item', { p_item: id })
  await loadWallet(); return r
}
export async function openCrate(id) {
  const r = HAS_STORE ? await redeem(await storeRpc('shop_quote', { p_item: id })) : await rpc('open_crate', { p_crate: id })
  await loadWallet(); return r
}
export async function equipItem(id) { const r = await rpc('equip_item', { p_item: id }); setWallet({ equipped: r }); return r }
export async function unequipSlot(kind) { const r = await rpc('unequip_slot', { p_kind: kind }); setWallet({ equipped: r }); return r }

// ---------- Moderación y misiones (AUTH extras.sql) ----------
let blockedCache = null
export async function myBlocked(force = false) { if (!blockedCache || force) { try { blockedCache = (await rpc('my_blocked')) ?? [] } catch { blockedCache = [] } } return blockedCache }
export const blockUser = async name => { const r = await rpc('block_user', { p_username: name }); await myBlocked(true); return r }
export const unblockUser = async name => { const r = await rpc('unblock_user', { p_username: name }); await myBlocked(true); return r }
export const reportUser = (name, reason, details = '') => rpc('report_user', { p_username: name, p_reason: reason, p_details: details })
export const isBlockedName = name => !!blockedCache?.some(b => b.username.toLowerCase() === String(name).toLowerCase())
export const getMissions = async () => (await rpc('my_missions')) ?? []
export const claimMission = async key => { const r = await rpc('mission_claim', { p_key: key }); await loadWallet(); return r }
// Suma progreso a una misión (en lotes pequeños para no saturar el servidor)
const pend = {}
// Tiempo jugado, insignias, última conexión y favoritos (AUTH v12). Si el SQL aún no está, todo falla en silencio.
export const addPlaytime = sec => rpc('add_playtime', { p_seconds: sec }).catch(() => {})
export const profileExtra = name => rpc('profile_extra', { p_username: name }).catch(() => null)
let favs = null
export async function myFavorites() { if (!favs) favs = new Set(await rpc('my_favorites', {}).catch(() => [])); return favs }
export async function toggleFavorite(id) { const on = await rpc('toggle_favorite', { p_game: id }); const s = await myFavorites(); on ? s.add(id) : s.delete(id); return on }
export function missionAdd(key, n = 1) {
  pend[key] = (pend[key] ?? 0) + n
  clearTimeout(missionAdd.t); missionAdd.t = setTimeout(async () => { const p = { ...pend }; for (const k in pend) delete pend[k]; for (const [k, v] of Object.entries(p)) { try { await rpc('mission_add', { p_key: k, p_add: v }) } catch {} } }, 4000)
}
