// Mejoras pequeñas de la partida agrupadas aquí para no engordar game.js (carga, atajos, modo foto...).
import { t } from './i18n.js'

const $ = id => document.getElementById(id)
const tipKeys = ['tip_1', 'tip_2', 'tip_3', 'tip_4', 'tip_5', 'tip_6', 'tip_7', 'tip_8']

// 1. Pantalla de carga con un consejo al azar
export function loadingScreen(name) {
  const el = document.createElement('div'); el.id = 'game-loading'
  const h = document.createElement('b'); h.textContent = name
  const p = document.createElement('p'); p.textContent = t(tipKeys[Math.floor(Math.random() * tipKeys.length)])
  const bar = document.createElement('i'); el.append(h, p, bar); $('game').append(el)
  setTimeout(() => el.classList.add('out'), 1300); setTimeout(() => el.remove(), 1900)
}

// 2. Panel de atajos (tecla ? o F1)
const SHORTCUTS = [['W A S D', 'sc_move'], ['Shift', 'sc_sprint'], ['Space', 'sc_jump'], ['F', 'sc_fly'], ['G', 'sc_emotes'], ['/ · Enter', 'sc_chat'], ['Tab', 'sc_players'], ['M', 'sc_music'], ['V', 'sc_voice'], ['P', 'sc_shot'], ['H', 'sc_photo'], ['? · F1', 'sc_help'], ['Esc', 'sc_menu']]
export function createShortcuts() {
  const box = document.createElement('div'); box.id = 'shortcuts'; box.className = 'hidden'
  const render = () => { box.replaceChildren(Object.assign(document.createElement('b'), { textContent: t('sc_title') }), ...SHORTCUTS.map(([k, l]) => { const r = document.createElement('div'); const kb = document.createElement('kbd'); kb.textContent = k; const s = document.createElement('span'); s.textContent = t(l); r.append(kb, s); return r })) }
  render(); $('game').append(box)
  return { toggle() { render(); box.classList.toggle('hidden') }, hide() { box.classList.add('hidden') }, dispose() { box.remove() } }
}

// 4. Modo foto: H oculta todo el HUD
export function togglePhoto() {
  const on = $('game').classList.toggle('photo')
  if (on) { const m = document.createElement('div'); m.id = 'photo-hint'; m.textContent = t('photo_hint'); $('game').append(m); setTimeout(() => m.remove(), 2200) }
  return on
}
