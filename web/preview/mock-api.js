const ok = () => Promise.resolve()
export const move = ok, placeBlock = ok, breakBlock = ok, say = ok, leave = ok, linkApprove = ok, createGameRow = ok, deleteGameRow = ok
export const canCreate = () => true
export const listGames = () => Promise.resolve([
  { id: 'g1', name: 'Spawn Plaza', description: 'Mundo abierto', owner_name: 'Blocksy', hue: 205, max_players: 20, owner_id: 'x' },
  { id: 'g2', name: 'Parkour Tower', description: '', owner_name: 'Blocksy', hue: 20, max_players: 20, owner_id: 'x' },
  { id: 'g3', name: 'Lava Escape', description: '', owner_name: 'Iker', hue: 350, max_players: 20, owner_id: 'x' }])
export const playerCounts = () => Promise.resolve({ g1: 3, g2: 5 })
export const clearGameSession = () => {}, openGameSession = () => Promise.resolve({}), leaveBeacon = () => {}
