import '../src/style.css'
import { installPalette, openPalette } from '../src/palette.js'
window.__went = []
installPalette(() => ({ go: p => window.__went.push(p), play: g => window.__went.push('play:' + g.name), canCreate: () => true, games: async () => [{ name: 'Spawn Plaza' }, { name: 'Obby' }], setTheme: v => window.__went.push('theme:' + v) }))
