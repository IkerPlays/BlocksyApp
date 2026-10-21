const DEFAULTS = { sensitivity: 1, viewDistance: 120, names: true }
let cur
try { cur = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('blocksy.settings') ?? '{}') } } catch { cur = { ...DEFAULTS } }
export const settings = cur
export function saveSettings() { try { localStorage.setItem('blocksy.settings', JSON.stringify(settings)) } catch {} }
export function lastPlayed() { try { return localStorage.getItem('blocksy.last') } catch { return null } }
export function setLastPlayed(id) { try { localStorage.setItem('blocksy.last', id) } catch {} }
