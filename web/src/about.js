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
  'Plantillas nuevas: Memoria, Zonas, Cazatesoros, Torre, Laberinto, Reflejos, Piso que cae y Preguntas, con filtros y búsqueda.',
  'Estudio: castillo, cúpula, escalera de caracol y columna; aviso si pasas de 160 piezas (límite de la 3DS).',
  'La 3DS dibuja las piezas del Estudio, cielos y horas del día, y muestra tu clan, temporada y próxima quedada.',
  'Actualizador de la 3DS nuevo: descargas verificadas, reanudables y con vuelta atrás.',
  'Seis logros nuevos y clanes, quedadas, temporadas y moderación.',
], en: [
  'New templates: Memory, Zones, Treasure hunt, Tower, Maze, Reflexes, Crumbling floor and Quiz, with filters and search.',
  'Studio: castle, dome, spiral staircase and pillar; a warning above 160 parts (the 3DS limit).',
  'The 3DS draws Studio parts, skies and times of day, and shows your clan, season and next meetup.',
  'New 3DS updater: verified, resumable downloads with rollback.',
  'Six new achievements, plus clans, meetups, seasons and moderation.',
] }
export function whatsNew() { return (NEWS[document.documentElement.lang] ?? NEWS.en).slice() }
export const isNewVersion = () => { try { return localStorage.getItem(SEEN_KEY) !== APP_VERSION } catch { return false } }
export const markSeen = () => { try { localStorage.setItem(SEEN_KEY, APP_VERSION) } catch {} }

export const CREDITS = [['Blocksy', 'IkerPlays'], ['three.js', 'three.js authors (MIT)'], ['Supabase', 'supabase-js (MIT)'], ['fengari', 'Lua 5.3 in JavaScript (MIT)'], ['Vite', 'Evan You and contributors (MIT)'], ['citro2d / libctru', 'devkitPro (zlib)']]
