const ok = () => Promise.resolve()
export const move = ok, placeBlock = ok, breakBlock = ok, say = ok, leave = ok, linkApprove = ok, createGameRow = () => Promise.resolve('g9'), updateGameRow = ok, deleteGameRow = ok
export const canCreate = () => true
const games = [
  { id: 'g1', name: 'Spawn Plaza', description: 'Mundo abierto', owner_name: 'Blocksy', hue: 205, max_players: 20, owner_id: 'x', mode: 'build', config: {}, script: '' },
  { id: 'g2', name: 'Plaza Social', description: 'Charla y emotes', owner_name: 'Blocksy', hue: 285, max_players: 20, owner_id: 'x', mode: 'social', config: { world: 'plaza' }, script: '' },
  { id: 'g3', name: 'Carrera de Obstaculos', description: '', owner_name: 'Iker', hue: 15, max_players: 20, owner_id: 'me', mode: 'obby', config: { world: 'obby', allow_build: false }, script: "on('join', () => title('Hola'))" }]
export const listGames = () => Promise.resolve(games)
export const getGame = id => Promise.resolve(games.find(g => g.id === id) ?? games[0])
export const playerCounts = () => Promise.resolve({ g1: 3, g2: 5 })
export const clearGameSession = () => {}, openGameSession = () => Promise.resolve({}), leaveBeacon = () => {}
export const placeBlocks = ok, submitTime = () => Promise.resolve(null)
export const npcTick = () => Promise.resolve(true), npcRelease = ok, gameEvent = ok
export const storeRpc = () => Promise.resolve(null), openStoreSession = () => Promise.resolve({})
export const storeReadOk = () => Promise.resolve(false), storeWriteOk = () => Promise.resolve(false), storeStatus = () => ({ read: false, write: false, why: '' })
