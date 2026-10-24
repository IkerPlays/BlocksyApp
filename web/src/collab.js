// Edición compartida del Studio: varias personas editan las piezas y el script del mismo juego a la vez.
// El dueño abre una sesión y comparte el código; el canal de Realtime lleva el código en el nombre (quien no lo conozca no puede entrar).
// El dueño es la fuente de verdad: solo su Studio guarda en el servidor (cada minuto y con Guardar). Quien edita como invitado no guarda nada.
// Se sincronizan piezas (por nombre), script y selección. Los bloques ya son compartidos por las reglas del juego; el entorno y los ajustes no.

const enc = new TextEncoder()
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('')
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const genCode = () => { const a = new Uint8Array(6); crypto.getRandomValues(a); return [...a].map(b => ALPHA[b % ALPHA.length]).join('') }
export const cleanCode = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
const hue = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360 }
const snap = parts => new Map(parts.map(p => [p.name, JSON.stringify(p)]))
const CHUNK = 40

export async function startCollab(o) {
  const { gameId, code, name, isOwner, parts, getScript, setScript, getSel, onParts, onPeers, onSelections, onStatus } = o
  const gameDb = o.db ?? (await import('./supabase.js')).gameDb          // (la prueba pasa un canal falso)
  const topic = `collab:${gameId}:${(await sha(gameId + '|' + code)).slice(0, 24)}`
  const me = Math.random().toString(36).slice(2, 9), color = `hsl(${hue(name)} 85% 60%)`
  let last = snap(parts), lastScript = getScript().script, lastSel = '', alive = true, timer = 0
  const sels = {}
  const ch = gameDb.channel(topic, { config: { broadcast: { self: false }, presence: { key: me } } })
  const send = (event, payload = {}) => { if (alive) ch.send({ type: 'broadcast', event, payload: { from: me, ...payload } }) }
  const sendParts = (set, del) => { for (let i = 0; i < Math.max(1, Math.ceil(set.length / CHUNK)); i++) send('ops', { set: set.slice(i * CHUNK, (i + 1) * CHUNK), del: i === 0 ? del : [] }) }
  const sendFull = () => { const s = getScript(); send('reset', { script: s.script, lang: s.lang }); sendParts(parts.map(p => ({ ...p })), []) }
  const applyOps = ({ set = [], del = [] }) => {
    for (const p of set) { if (!p || typeof p.name !== 'string') continue; const i = parts.findIndex(x => x.name === p.name); if (i >= 0) parts[i] = p; else if (parts.length < 400) parts.push(p) }
    for (const n of del) { const i = parts.findIndex(x => x.name === n); if (i >= 0) parts.splice(i, 1) }
    last = snap(parts); onParts()
  }
  ch.on('broadcast', { event: 'ops' }, ({ payload }) => { if (payload.from !== me) applyOps(payload) })
  ch.on('broadcast', { event: 'reset' }, ({ payload }) => { if (payload.from === me || isOwner) return; parts.length = 0; setScript(String(payload.script ?? ''), payload.lang === 'lua' ? 'lua' : 'js'); lastScript = getScript().script; last = snap(parts); onParts() })
  ch.on('broadcast', { event: 'script' }, ({ payload }) => { if (payload.from === me) return; setScript(String(payload.script ?? ''), payload.lang === 'lua' ? 'lua' : 'js'); lastScript = getScript().script })
  ch.on('broadcast', { event: 'need' }, () => { if (isOwner) sendFull() })
  ch.on('broadcast', { event: 'sel' }, ({ payload }) => { if (payload.from === me) return; sels[payload.from] = { name: String(payload.name ?? '?'), color: String(payload.color ?? '#fff'), names: Array.isArray(payload.names) ? payload.names.slice(0, 40) : [] }; onSelections({ ...sels }) })
  ch.on('presence', { event: 'sync' }, () => {
    const st = ch.presenceState(), list = Object.entries(st).map(([id, v]) => ({ id, ...(v[0] ?? {}) }))
    for (const id of Object.keys(sels)) if (!st[id]) delete sels[id]
    onPeers(list.filter(p => p.id !== me)); onSelections({ ...sels })
  })
  ch.on('presence', { event: 'join' }, ({ key }) => { if (isOwner && key !== me) setTimeout(sendFull, 300) })
  ch.subscribe(async status => {
    if (status === 'SUBSCRIBED') { await ch.track({ name, color, owner: isOwner }); if (!isOwner) send('need'); onStatus('on') }
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onStatus('error')
  })
  timer = setInterval(() => {
    if (!alive) return
    const cur = snap(parts), set = [], del = []
    for (const [n, j] of cur) if (last.get(n) !== j) set.push(JSON.parse(j))
    for (const n of last.keys()) if (!cur.has(n)) del.push(n)
    if (set.length || del.length) { sendParts(set, del); last = cur }
    const s = getScript()
    if (s.script !== lastScript) { send('script', { script: s.script, lang: s.lang }); lastScript = s.script }
    const names = getSel(), key = names.join('|')
    if (key !== lastSel) { send('sel', { names, name, color }); lastSel = key }
  }, 400)
  return { code, color, stop() { alive = false; clearInterval(timer); try { ch.untrack() } catch {} gameDb.removeChannel(ch) } }
}
