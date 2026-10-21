import '../src/style.css'
import { applyIcons } from '../src/icons.js'
import { startGame } from '../src/game.js'
applyIcons()
document.getElementById('game').classList.remove('hidden')
window.__stop = startGame({ game: { id: 'g', name: 'Spawn Plaza' }, profile: { id: 'me', username: 'Iker', avatar_color: '#ff9f43' }, canvas: document.getElementById('view'), onExit() {} })
