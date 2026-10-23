// Moderación en el cliente: filtro de palabras, silenciar jugadores en la partida y límite anti-spam del chat
import { settings } from './settings.js'

// Lista corta de insultos habituales (es/en/pt/fr/de); se tapan con asteriscos si el filtro está activo
const BAD = ['puta', 'puto', 'mierda', 'cabron', 'cabrón', 'gilipollas', 'pendejo', 'idiota', 'imbecil', 'imbécil', 'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'cunt', 'nigger', 'faggot', 'merde', 'connard', 'salope', 'scheisse', 'scheiße', 'arschloch', 'porra', 'caralho', 'foda']
const RE = new RegExp(`(?<![\\p{L}])(${BAD.join('|')})(?![\\p{L}])`, 'giu')
export const filterWords = text => (settings.chatFilter === false ? text : text.replace(RE, m => '*'.repeat(m.length)))

const muted = new Set()
export const isMuted = name => muted.has(String(name).toLowerCase())
export const toggleMute = name => { const k = String(name).toLowerCase(); if (muted.delete(k)) return false; muted.add(k); return true }

// Máximo 5 mensajes cada 8 s y no repetir el mismo mensaje en 4 s
export function createLimiter() {
  const sent = []; let last = '', lastAt = 0
  return text => {
    const now = Date.now()
    while (sent.length && now - sent[0] > 8000) sent.shift()
    if (sent.length >= 5) return 'slow'
    if (text === last && now - lastAt < 4000) return 'dup'
    sent.push(now); last = text; lastAt = now; return null
  }
}
