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
const SHORTCUTS = [['W A S D', 'sc_move'], ['Shift', 'sc_sprint'], ['Space', 'sc_jump'], ['C', 'sc_crouch'], ['F', 'sc_fly'], ['G', 'sc_emotes'], ['/ · Enter', 'sc_chat'], ['Tab', 'sc_players'], ['M', 'sc_music'], ['V', 'sc_voice'], ['P', 'sc_shot'], ['H', 'sc_photo'], ['B', 'sc_ping'], ['? · F1', 'sc_help'], ['Esc', 'sc_menu']]
export function createShortcuts() {
  const box = document.createElement('div'); box.id = 'shortcuts'; box.className = 'hidden'
  const render = () => { box.replaceChildren(Object.assign(document.createElement('b'), { textContent: t('sc_title') }), ...SHORTCUTS.map(([k, l]) => { const r = document.createElement('div'); const kb = document.createElement('kbd'); kb.textContent = k; const s = document.createElement('span'); s.textContent = t(l); r.append(kb, s); return r })) }
  render(); $('game').append(box)
  return { toggle() { render(); box.classList.toggle('hidden') }, hide() { box.classList.add('hidden') }, dispose() { box.remove() } }
}

// 6. Reacciones rápidas: Alt + 1..4 muestran una burbuja sobre tu avatar (viajan como mensaje de chat con un prefijo invisible)
export const REACT_PREFIX = '\u2063r'
export const REACTIONS = ['+1', 'GG', 'LOL', '!']
export const isReaction = text => typeof text === 'string' && text.startsWith(REACT_PREFIX) ? text.slice(REACT_PREFIX.length) : null

// 7. Rueda de emotes: reparte los botones del panel en círculo
export function layoutWheel(panel) {
  const btns = [...panel.querySelectorAll('.emote')], n = btns.length, R = 155
  panel.classList.add('wheel')
  btns.forEach((b, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; b.style.left = `calc(50% + ${Math.cos(a) * R}px)`; b.style.top = `calc(50% + ${Math.sin(a) * R}px)` })
}

// 4. Modo foto: H oculta todo el HUD
export function togglePhoto() {
  const on = $('game').classList.toggle('photo')
  if (on) { const m = document.createElement('div'); m.id = 'photo-hint'; m.textContent = t('photo_hint'); $('game').append(m); setTimeout(() => m.remove(), 2200) }
  return on
}

// Aviso de orientación: en móvil vertical el juego se ve mejor girado
export function orientationHint(root) {
  const d = document.createElement('div'); d.id = 'rotate-hint'; d.textContent = t('rotate_hint'); root.append(d)
  const mq = matchMedia('(pointer: coarse) and (orientation: portrait)'); let hide = 0
  const upd = () => { if (mq.matches && !hide) { d.classList.add('show'); hide = setTimeout(() => d.classList.remove('show'), 5000) } else if (!mq.matches) { d.classList.remove('show'); clearTimeout(hide); hide = 0 } }
  mq.addEventListener?.('change', upd); upd()
  return { dispose() { mq.removeEventListener?.('change', upd); clearTimeout(hide); d.remove() } }
}
