export const DEFAULTS = {
  sensitivity: 1, syncMs: 100, voiceVol: 1, voiceProximity: true, voiceMode: 'toggle', viewDistance: 120, names: true, fov: 68, quality: 'high', dynRes: true, shadows: true, bloom: false, clouds: true,
  music: true, musicVol: 0.4, sfx: true, sfxVol: 0.6, shuffle: true,
  bubbles: true, minimap: true, compass: true, showFps: true, notifPopups: true, invertY: false, reduceMotion: false, touchSize: 1, leftHanded: false,
  theme: 'dark', accent: '#3b6bff', colorblind: 'none', textScale: 1, subtitles: false, keymap: {},
}
let cur
try { cur = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('blocksy.settings') ?? '{}') } } catch { cur = { ...DEFAULTS } }
export const settings = cur
const subs = new Set()
export const onSettings = f => { subs.add(f); return () => subs.delete(f) }
export function saveSettings() { try { localStorage.setItem('blocksy.settings', JSON.stringify(settings)) } catch {} ; subs.forEach(f => f()) }
export function resetSettings() { Object.assign(settings, DEFAULTS); saveSettings() }
export function lastPlayed() { try { return localStorage.getItem('blocksy.last') } catch { return null } }
export function setLastPlayed(id) { try { localStorage.setItem('blocksy.last', id); const r = [id, ...recentGames().filter(x => x !== id)].slice(0, 8); localStorage.setItem('blocksy.recent', JSON.stringify(r)) } catch {} }
export function recentGames() { try { const r = JSON.parse(localStorage.getItem('blocksy.recent') || '[]'); return Array.isArray(r) ? r : [] } catch { return [] } }

// Tema y color de acento
export function applyTheme() {
  const r = document.documentElement
  r.dataset.theme = settings.theme
  r.style.setProperty('--accent', settings.accent); r.style.setProperty('--accent2', settings.accent)
  r.classList.toggle('reduce-motion', !!settings.reduceMotion)
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', settings.theme === 'light' ? '#f2f4f7' : '#232527')
}

// Estadísticas locales
const SK = 'blocksy.stats'
let stats = { time: 0, placed: 0, broken: 0, msgs: 0, games: [] }
try { stats = { ...stats, ...JSON.parse(localStorage.getItem(SK) ?? '{}') } } catch {}
export const getStats = () => { if (!Array.isArray(stats.games)) stats.games = []; return stats }
const saveStats = () => { try { localStorage.setItem(SK, JSON.stringify(stats)) } catch {} }
export function bump(k, n = 1) { stats[k] = (Number(stats[k]) || 0) + n; saveStats() }
export function visited(id) {
  if (!Array.isArray(stats.games)) stats.games = []            // estadísticas guardadas por una versión con el fallo: se repara solas
  if (!stats.games.includes(id)) { stats.games.push(id); saveStats() }
}

// Mejores tiempos de carreras (por juego)
export function bestTime(gameId, t) {
  const k = `blocksy.best.${gameId}`
  try { const old = Number(localStorage.getItem(k)); if (t != null && (!old || t < old)) { localStorage.setItem(k, String(t)); return t } return old || null } catch { return null }
}
