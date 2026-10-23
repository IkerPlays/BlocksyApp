// Primeros pasos: tutorial interactivo en la primera partida, bienvenida para cuentas nuevas y huevos de pascua
import { t } from './i18n.js'

const TUT_KEY = 'blocksy.tut2', WEL_KEY = 'blocksy.welcomed'
const get = k => { try { return localStorage.getItem(k) } catch { return '1' } }
const set = k => { try { localStorage.setItem(k, '1') } catch {} }

// Tutorial: cada paso se completa al hacer la acción que enseña
const STEPS = [
  { text: 'tut_move', done: c => ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c) },
  { text: 'tut_jump', done: c => c === 'Space' },
  { text: 'tut_look', done: c => c === 'look' },
  { text: 'tut_chat', done: c => c === 'Enter' || c === 'Slash' },
  { text: 'tut_emote', done: c => c === 'KeyG' },
]
export function createTutorial(host, enabled = true) {
  if (!enabled || get(TUT_KEY)) return { key() {}, look() {}, dispose() {} }
  const box = document.createElement('div'); box.id = 'tutorial'; host.append(box)
  let i = 0
  const paint = () => { box.textContent = i < STEPS.length ? `${i + 1}/${STEPS.length}  ${t(STEPS[i].text)}` : t('tut_done'); if (i >= STEPS.length) { set(TUT_KEY); setTimeout(() => box.remove(), 2500) } }
  paint()
  const advance = c => { if (i < STEPS.length && STEPS[i].done(c)) { i++; paint() } }
  return { key: advance, look: () => advance('look'), dispose() { box.remove() } }
}

// Bienvenida para cuentas nuevas (una vez por dispositivo)
export const needsWelcome = () => !get(WEL_KEY)
export const markWelcomed = () => set(WEL_KEY)

// Huevo de pascua: código Konami (↑↑↓↓←→←→BA) = arcoíris durante 8 s
export function installEasterEggs(toast) {
  const seq = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA']; let n = 0
  addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? '')) return
    n = e.code === seq[n] ? n + 1 : e.code === seq[0] ? 1 : 0
    if (n === seq.length) { n = 0; document.documentElement.classList.add('rainbow'); toast(t('egg_konami')); setTimeout(() => document.documentElement.classList.remove('rainbow'), 8000) }
  })
}
