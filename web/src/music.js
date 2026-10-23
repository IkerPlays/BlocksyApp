// Música de los juegos: lee web/public/playlist (playlist.json lo genera Vite) y la reproduce en bucle.
import { settings, onSettings } from './settings.js'
import { t } from './i18n.js'

let list = null, order = [], idx = 0, audio = null, listeners = new Set(), userPaused = false
const base = () => (import.meta.env?.BASE_URL ?? '/') + 'playlist/'
const nice = f => decodeURIComponent(f).replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/^\d+\s*[-.]\s*/, '')

async function load() {
  if (list) return list
  try { const r = await fetch(base() + 'playlist.json', { cache: 'no-cache' }); list = r.ok ? (await r.json()).files ?? [] : [] } catch { list = [] }
  return list
}
function makeOrder(keep) {
  order = list.map((_, i) => i)
  if (settings.shuffle) for (let i = order.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [order[i], order[j]] = [order[j], order[i]] }
  if (keep != null) { const p = order.indexOf(keep); if (p > 0) [order[0], order[p]] = [order[p], order[0]] }
  idx = 0
}
const emit = () => listeners.forEach(f => f(state()))
export const state = () => ({ tracks: list?.length ?? 0, title: list?.length && audio ? nice(list[order[idx]] ?? '') : '', playing: !!audio && !audio.paused, enabled: settings.music && !userPaused })
export const onMusic = f => { listeners.add(f); return () => listeners.delete(f) }

function playCurrent() {
  if (!list?.length) return
  const f = list[order[idx]]
  if (!audio) {
    audio = new Audio(); audio.preload = 'auto'
    audio.addEventListener('ended', () => next())
    audio.addEventListener('error', () => { if (list.length > 1) setTimeout(next, 300) })
    audio.addEventListener('play', emit); audio.addEventListener('pause', emit)
  }
  audio.src = base() + encodeURIComponent(f)
  audio.volume = Math.min(1, Math.max(0, settings.musicVol))
  audio.play().then(emit).catch(() => emit())          // si el navegador bloquea el autoplay, se reanuda con el siguiente toque
  if ('mediaSession' in navigator) { try { navigator.mediaSession.metadata = new MediaMetadata({ title: nice(f), artist: 'Blocksy' }); navigator.mediaSession.setActionHandler('nexttrack', next); navigator.mediaSession.setActionHandler('previoustrack', prev) } catch {} }
  emit()
}
export async function listTracks() { await load(); return list.map(f => ({ file: f, title: nice(f) })) }
export async function start(preferred) {
  if (!settings.music) return
  userPaused = false
  await load(); if (!list.length) return emit()
  const want = preferred ? list.findIndex(f => f === preferred || nice(f) === preferred) : -1
  if (want >= 0) makeOrder(want); else if (!order.length) makeOrder()
  playCurrent()
  const resume = () => { if (audio && audio.paused && settings.music && !userPaused) audio.play().catch(() => {}); removeEventListener('pointerdown', resume) }
  addEventListener('pointerdown', resume)
}
export function stop() { if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load() } emit() }
export function next() { if (!list?.length) return; idx = (idx + 1) % order.length; if (idx === 0 && settings.shuffle) makeOrder(order[order.length - 1]); playCurrent() }
export function prev() { if (!list?.length) return; if (audio && audio.currentTime > 4) { audio.currentTime = 0; return } idx = (idx - 1 + order.length) % order.length; playCurrent() }
export function toggle() {
  if (!list?.length) return
  if (audio && !audio.paused) { userPaused = true; audio.pause() } else { userPaused = false; if (audio?.src) audio.play().catch(() => {}); else playCurrent() }
  emit()
}
onSettings(() => {
  if (audio) { audio.volume = Math.min(1, Math.max(0, settings.musicVol)); if (!settings.music && !audio.paused) audio.pause(); else if (settings.music && audio.paused && !userPaused && audio.src) audio.play().catch(() => {}) }
  emit()
})
export const noMusicText = () => t('no_music')
