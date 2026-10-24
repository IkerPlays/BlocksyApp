// Componentes reutilizables: una pieza (o varias, agrupadas) o un script guardados para usarlos en cualquier juego.
// Viven en este navegador (localStorage); para pasarlos a otro navegador u otra persona se exportan e importan como un archivo .json.
const KEY = 'blocksy.components'
const MAX = 60
const read = () => { try { const l = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(l) ? l.filter(c => c && typeof c.id === 'string' && ['parts', 'script'].includes(c.kind)) : [] } catch { return [] } }
const write = l => { try { localStorage.setItem(KEY, JSON.stringify(l.slice(0, MAX))); return true } catch { return false } }
export const listComponents = () => read()
export function addComponent(kind, name, data, meta = {}) {
  const l = read(); name = String(name || '').trim().slice(0, 24) || (kind === 'parts' ? 'Pieza' : 'Script')
  const c = { id: Math.random().toString(36).slice(2, 10), kind, name, data, at: Date.now(), ...(meta.lang ? { lang: meta.lang === 'lua' ? 'lua' : 'js' } : {}) }
  l.unshift(c); return write(l) ? c : null
}
export function removeComponent(id) { write(read().filter(c => c.id !== id)) }
export function renameComponent(id, name) { const l = read(), c = l.find(x => x.id === id); if (c) { c.name = String(name).trim().slice(0, 24) || c.name; write(l) } }

// Guarda las piezas relativas a su centro (x, z) y a su base (y), para colocarlas donde se quiera
export function packParts(parts) {
  if (!parts.length) return []
  const cx = parts.reduce((s, p) => s + p.x, 0) / parts.length, cz = parts.reduce((s, p) => s + p.z, 0) / parts.length
  const base = Math.min(...parts.map(p => p.y - (p.sy ?? 1) / 2))
  return parts.map(p => { const q = { ...p, x: +(p.x - cx).toFixed(3), y: +(p.y - base).toFixed(3), z: +(p.z - cz).toFixed(3) }; delete q.locked; return q })
}
// Devuelve piezas nuevas colocadas en `at` ([x, y, z] del suelo), con nombres y grupos que no chocan con los existentes
export function unpackParts(data, at, existing) {
  const taken = new Set(existing.map(p => p.name)), groups = new Set(existing.map(p => p.group).filter(Boolean)), gmap = {}
  const uniq = (name, set) => { const base = String(name).replace(/\d*$/, '') || 'Part'; let n = 1; while (set.has(base + n)) n++; set.add(base + n); return base + n }
  return data.map(p => {
    const q = { ...p, x: +(at[0] + 0.5 + p.x).toFixed(3), y: +(at[1] + p.y).toFixed(3), z: +(at[2] + 0.5 + p.z).toFixed(3), name: uniq(p.name, taken) }
    if (p.group) { gmap[p.group] ??= uniq(p.group, groups); q.group = gmap[p.group] }
    return q
  })
}
export function exportComponents() {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ format: 'blocksy-components-1', components: read() })], { type: 'application/json' })); a.download = 'blocksy-componentes.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
// Devuelve cuántos componentes nuevos se añadieron
export function importComponents(text) {
  const d = JSON.parse(text); if (d?.format !== 'blocksy-components-1' || !Array.isArray(d.components)) throw new Error('format')
  const l = read(), have = new Set(l.map(c => c.id)); let n = 0
  for (const c of d.components) { if (!c || typeof c.id !== 'string' || !['parts', 'script'].includes(c.kind) || have.has(c.id) || typeof c.name !== 'string') continue; if (c.kind === 'parts' ? !Array.isArray(c.data) : typeof c.data !== 'string') continue; l.push({ id: c.id, kind: c.kind, name: c.name.slice(0, 24), data: c.data, at: c.at ?? Date.now(), ...(c.lang ? { lang: c.lang === 'lua' ? 'lua' : 'js' } : {}) }); n++ }
  write(l); return n
}
