// Servidor simulado: un pequeño mundo de bloques y dos jugadores remotos
const blocks = []
for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) blocks.push({ x, y: 0, z, kind: (x + z) % 2 ? 0 : 4 })
for (let y = 1; y <= 3; y++) for (let i = -4; i <= 4; i++) { blocks.push({ x: i, y, z: -4, kind: 1 }, { x: -4, y, z: i, kind: 2 }); if (y < 3 || i % 2) blocks.push({ x: i, y, z: 4, kind: 3 }) }
for (let y = 1; y <= 6; y++) blocks.push({ x: 6, y, z: -2, kind: 5 })
for (let i = 0; i < 4; i++) blocks.push({ x: 2 + i, y: 1 + i, z: 1, kind: 0 })
const players = [
  { player_id: 'p1', game_id: 'g', username: 'Marta', color: '#2ecc71', x: 2, y: 1, z: -1, ry: 2.2, anim: 'walk', platform: 'web' },
  { player_id: 'p2', game_id: 'g', username: 'Dani', color: '#9b59b6', x: -2, y: 1, z: 1, ry: -1, anim: 'idle', platform: '3ds' },
]
function query(table) {
  const q = { select: () => q, eq: () => q, gt: () => q, limit: () => q, then: r => r({ data: table === 'blocks' ? blocks : players }) }
  return q
}
const chan = { on: () => chan, subscribe: () => chan }
export const gameDb = { from: query, channel: () => chan, removeChannel: () => {} }
export const authDb = {}
export const GAME_URL = '', GAME_KEY = ''
