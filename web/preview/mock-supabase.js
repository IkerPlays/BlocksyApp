// Servidor simulado: un pequeño mundo de bloques y dos jugadores remotos
const blocks = []
for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) blocks.push({ x, y: 0, z, kind: (x + z) % 2 ? 0 : 4 })
for (let y = 1; y <= 3; y++) for (let i = -4; i <= 4; i++) { blocks.push({ x: i, y, z: -4, kind: 1 }, { x: -4, y, z: i, kind: 2 }); if (y < 3 || i % 2) blocks.push({ x: i, y, z: 4, kind: 3 }) }
for (let y = 1; y <= 6; y++) blocks.push({ x: 6, y, z: -2, kind: 5 })
for (let i = 0; i < 4; i++) blocks.push({ x: 2 + i, y: 1 + i, z: 1, kind: 0 })
const players = [
  { player_id: 'p1', game_id: 'g', username: 'Marta', color: '#2ecc71', x: 2, y: 1, z: -1, ry: 2.2, anim: 'wave', platform: 'web' },
  { player_id: 'p2', game_id: 'g', username: 'Dani', color: '#9b59b6', x: -2, y: 1, z: 1, ry: -1, anim: 'dance', platform: '3ds' },
]
const chats = [{ id: 1, player_id: 'p1', username: 'Marta', kind: 'chat', payload: { text: 'Hola Iker, mira mi casa!' }, created_at: new Date(Date.now() + 1500).toISOString() }]
function query(table) {
  const q = { select: () => q, eq: () => q, gt: () => q, order: () => q, limit: () => q, then: r => r({ data: table === 'blocks' ? blocks : table === 'interactions' ? chats : players }) }
  return q
}
const chan = { on: () => chan, subscribe: () => chan }
export const gameDb = { from: query, channel: () => chan, removeChannel: () => {} }
const friends = [['Marta', '#2ecc71', true], ['Dani', '#9b59b6', true], ['Lucia', '#e74c3c', false], ['Pablo', '#f1c40f', false]].map(([u, c, o], i) => ({ id: 'f' + i, username: u, avatar_color: c, is_online: o, current_game: o && i === 0 ? 'g1' : null }))
const msgs = [{ id: 1, from_id: 'f0', to_id: 'me', body: 'Ven al juego!', created_at: new Date().toISOString() }, { id: 2, from_id: 'me', to_id: 'f0', body: 'Voy!', created_at: new Date().toISOString() }]
const reqs = [{ id: 7, dir: 'in', user_id: 'z', username: 'Carlos', avatar_color: '#1abc9c', created_at: '' }, { id: 8, dir: 'out', user_id: 'y', username: 'Sofia', avatar_color: '#ff6b9d', created_at: '' }]
const notifs = [{ id: 1, kind: 'friend_request', from_name: 'Carlos', payload: {}, read: false, created_at: new Date().toISOString() }, { id: 2, kind: 'invite', from_name: 'Marta', payload: { game_id: 'g1', game_name: 'Spawn Plaza' }, read: false, created_at: new Date().toISOString() }]
function aq(table) {
  const q = { select: () => q, eq: () => q, in: () => q, or: () => q, order: () => q, limit: () => q, gt: () => q, ilike: () => q, single: () => q,
    then: r => r({ data: table === 'friendships' ? friends.map(f => ({ friend_id: f.id })) : table === 'messages' ? msgs : table === 'notifications' ? notifs : friends }) }
  return q
}
const rpcs = { my_requests: reqs, unread_counts: { f0: 2 }, get_profile: { id: 'f0', username: 'Marta', avatar_color: '#2ecc71', bio: 'Me gusta construir castillos.', created_at: '2026-01-05T00:00:00Z', relation: 'friends', request_id: null, friend_count: 12, is_online: true, current_game: 'g1' } }
const ch = { on: () => ch, subscribe: () => ch }
export const authDb = { from: aq, rpc: n => Promise.resolve({ data: rpcs[n] ?? null, error: null }), channel: () => ch, removeChannel: () => {}, auth: {} }
export const GAME_URL = '', GAME_KEY = ''
