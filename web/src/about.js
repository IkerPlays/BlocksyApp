// Acerca de: novedades dentro de la app, créditos, registro de errores e informe de fallos
import { t } from './i18n.js'
import { BUILD } from './pwa.js'

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
const LOG_KEY = 'blocksy.errors', SEEN_KEY = 'blocksy.seenVersion'

// ---- Registro de errores (últimos 20, solo en este dispositivo) ----
const read = () => { try { const l = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); return Array.isArray(l) ? l : [] } catch { return [] } }
function push(msg) {
  const l = read(); l.push({ at: new Date().toISOString(), msg: String(msg).slice(0, 300) })
  try { localStorage.setItem(LOG_KEY, JSON.stringify(l.slice(-20))) } catch {}
}
export const errorLog = read
export const clearErrors = () => { try { localStorage.removeItem(LOG_KEY) } catch {} }
export function installErrorLog() {
  addEventListener('error', e => push(`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno ?? 0})`))
  addEventListener('unhandledrejection', e => push(`Promise: ${e.reason?.message ?? e.reason}`))
}

// ---- Informar de un fallo: abre un issue de GitHub con los datos útiles ----
export function reportUrl(extra = '') {
  const errs = read().slice(-5).map(e => `- ${e.at} ${e.msg}`).join('\n') || '-'
  const body = `${extra}\n\n**Version:** ${APP_VERSION} (${BUILD})\n**Browser:** ${navigator.userAgent}\n**Screen:** ${innerWidth}x${innerHeight}\n\n**Recent errors:**\n${errs}\n`
  return `https://github.com/IkerPlays/BlocksyApp/issues/new?title=${encodeURIComponent('[Bug] ')}&body=${encodeURIComponent(body)}`
}

// ---- Novedades (se muestran una vez tras cada actualización) ----
const NEWS = { es: [
  'Nuevos accesorios: caras, mochilas, estelas y mascotas, con aspecto de avatar editable.',
  'Estudio 2: herramientas de bloques, partes, símbolos, explorador y scripts Lua estilo Roblox.',
  'Modos de juego: tag, capturar la bandera, oleadas y escondite, además del Bosque Oscuro.',
  'Salas privadas, favoritos, votos, logros y ranking de BCoins.',
  'Accesibilidad: modo daltónico, tamaño de texto, subtítulos y teclas redefinibles.',
], en: [
  'New accessories: faces, backpacks, trails and pets, with an editable avatar look.',
  'Studio 2: block tools, parts, prefabs, explorer and Roblox-style Lua scripts.',
  'Game modes: tag, capture the flag, waves and hide and seek, plus the Dark Forest.',
  'Private rooms, favorites, votes, achievements and a BCoins ranking.',
  'Accessibility: colorblind mode, text size, sound captions and rebindable keys.',
] }
export function whatsNew() { return (NEWS[document.documentElement.lang] ?? NEWS.en).slice() }
export const isNewVersion = () => { try { return localStorage.getItem(SEEN_KEY) !== APP_VERSION } catch { return false } }
export const markSeen = () => { try { localStorage.setItem(SEEN_KEY, APP_VERSION) } catch {} }

export const CREDITS = [['Blocksy', 'IkerPlays'], ['three.js', 'three.js authors (MIT)'], ['Supabase', 'supabase-js (MIT)'], ['fengari', 'Lua 5.3 in JavaScript (MIT)'], ['Vite', 'Evan You and contributors (MIT)'], ['citro2d / libctru', 'devkitPro (zlib)']]
