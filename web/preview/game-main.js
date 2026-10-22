import '../src/style.css'
import { applyIcons } from '../src/icons.js'
import { applyStatic } from '../src/i18n.js'
import { startGame } from '../src/game.js'
const q = new URLSearchParams(location.search)
const config = {}
for (const k of ['world', 'sky']) if (q.get(k)) config[k] = q.get(k)
if (q.get('time')) config.time = Number(q.get('time'))
if (q.get('build') === '0') config.allow_build = false
if (q.get('lang')) config.script_lang = q.get('lang')
if (q.get('ui')) config.ui = JSON.parse(q.get('ui'))
const game = { id: 'g', name: 'Spawn Plaza', owner_id: q.get('studio') ? 'me' : 'x', mode: q.get('mode') || 'build', config, script: q.get('script') || '' }
applyStatic(); applyIcons()
document.getElementById('game').classList.remove('hidden')
if (q.get('quality')) localStorage.setItem('blocksy.settings', JSON.stringify({ quality: q.get('quality') }))
window.__stop = startGame({ game, profile: { id: 'me', username: 'Iker', avatar_color: '#ff9f43' }, canvas: document.getElementById('view'), onExit() {}, studio: q.get('studio') ? { save: async () => {}, openScript: async () => {} } : undefined })
