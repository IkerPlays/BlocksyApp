// Logros locales: se calculan con las estadísticas del dispositivo y la cartera de BCoins
import { getStats } from './settings.js'
import { getWallet } from './social.js'

export const ACHIEVEMENTS = [
  { id: 'first_block', goal: 1, val: s => s.placed }, { id: 'builder', goal: 500, val: s => s.placed }, { id: 'architect', goal: 5000, val: s => s.placed },
  { id: 'destroyer', goal: 200, val: s => s.broken }, { id: 'chatter', goal: 25, val: s => s.msgs }, { id: 'social', goal: 250, val: s => s.msgs },
  { id: 'explorer', goal: 3, val: s => s.games.length }, { id: 'globetrotter', goal: 10, val: s => s.games.length },
  { id: 'hour', goal: 3600, val: s => s.time, fmt: v => Math.floor(v / 60) + ' min' }, { id: 'veteran', goal: 36000, val: s => s.time, fmt: v => Math.floor(v / 3600) + ' h' },
  { id: 'collector', goal: 5, val: (s, w) => (w?.inventory ?? []).length }, { id: 'rich', goal: 1000, val: (s, w) => w?.bcoins ?? 0 },
]
const KEY = 'blocksy.ach'
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }
export const unlockedIds = () => new Set(load())
export const progress = a => { const v = a.val(getStats(), getWallet()); return Math.min(a.goal, v) }
// Devuelve los logros recién conseguidos (y los guarda)
export function checkAchievements() {
  const have = unlockedIds(), fresh = []
  for (const a of ACHIEVEMENTS) if (!have.has(a.id) && progress(a) >= a.goal) { have.add(a.id); fresh.push(a) }
  if (fresh.length) { try { localStorage.setItem(KEY, JSON.stringify([...have])) } catch {} }
  return fresh
}

// Lista de deseos de la tienda
const WK = 'blocksy.wish'
export const wishlist = () => { try { const w = JSON.parse(localStorage.getItem(WK) || '[]'); return Array.isArray(w) ? w : [] } catch { return [] } }
export function toggleWish(id) { const w = wishlist(), i = w.indexOf(id); if (i >= 0) w.splice(i, 1); else w.push(id); try { localStorage.setItem(WK, JSON.stringify(w)) } catch {} ; return i < 0 }
