// Accesibilidad: modo daltónico, tamaño de texto, subtítulos de sonidos y teclas redefinibles
import { settings } from './settings.js'
import { t } from './i18n.js'

// ---- Teclas redefinibles: acción -> tecla por defecto ----
export const KEY_ACTIONS = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', crouch: 'KeyC', fly: 'KeyF', emotes: 'KeyG', ping: 'KeyB', photo: 'KeyH', voice: 'KeyV', players: 'Tab' }
export const keyLabel = c => c.replace(/^Key/, '').replace(/^Digit/, '').replace('Arrow', '')
// Convierte la tecla física en la tecla "por defecto" que entiende el juego (o null si está ocupada por otra acción)
export function remapCode(code) {
  const km = settings.keymap; if (!km || !Object.keys(km).length) return code
  for (const [a, c] of Object.entries(km)) if (c === code && KEY_ACTIONS[a]) return KEY_ACTIONS[a]
  for (const [a, c] of Object.entries(km)) if (KEY_ACTIONS[a] === code && c !== code) return null          // la tecla original ya no hace esa acción
  return code
}
export function remapEvent(ev) {
  const c = remapCode(ev.code); if (c === ev.code) return ev
  if (c === null) return null
  return { code: c, key: ev.key, repeat: ev.repeat, altKey: ev.altKey, preventDefault: () => ev.preventDefault() }
}

// ---- Modo daltónico (filtros SVG sobre la imagen del juego) ----
const MATS = {
  protanopia: '0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0',
  deuteranopia: '0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0',
  tritanopia: '0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0',
}
function ensureFilters() {
  if (document.getElementById('cb-filters')) return
  const d = document.createElement('div'); d.id = 'cb-filters'; d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'
  d.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg">' + Object.entries(MATS).map(([k, v]) => `<filter id="cb-${k}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${v}"/></filter>`).join('') + '</svg>'
  document.body.append(d)
}
export function applyAccess() {
  const r = document.documentElement
  ensureFilters()
  const cb = settings.colorblind
  r.style.setProperty('--cb-filter', cb && cb !== 'none' && MATS[cb] ? `url(#cb-${cb})` : 'none')
  r.style.setProperty('--text-scale', String(settings.textScale || 1))
  r.classList.toggle('big-text', (settings.textScale || 1) > 1.01)
  r.classList.toggle('hc', settings.theme === 'contrast')
}

// ---- Subtítulos de sonidos ----
let subBox = null, subTimer = 0
export function caption(name) {
  if (!settings.subtitles) return
  if (!subBox) { subBox = document.createElement('div'); subBox.id = 'subtitles'; document.body.append(subBox) }
  const text = t('snd_' + name); if (text === 'snd_' + name) return
  const row = document.createElement('span'); row.textContent = `[${text}]`; subBox.append(row)
  while (subBox.children.length > 3) subBox.firstChild.remove()
  setTimeout(() => row.remove(), 2200)
}
