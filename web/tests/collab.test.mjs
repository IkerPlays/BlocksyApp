import test from 'node:test'
import assert from 'node:assert/strict'
Object.defineProperty(globalThis, 'crypto', { value: globalThis.crypto, configurable: true })
const { startCollab, genCode, cleanCode } = await import('../src/collab.js')

// Canal falso: todos los clientes con el mismo tema se ven entre sí
const buses = new Map()
const fakeDb = () => ({
  channel(topic, cfg) {
    const bus = buses.get(topic) ?? buses.set(topic, new Set()).get(topic), key = cfg.config.presence.key, handlers = [], me = { key, handlers, meta: null }
    const ch = {
      on(type, f, cb) { handlers.push({ type, event: f.event, cb }); return ch },
      subscribe(cb) { bus.add(me); setTimeout(() => cb('SUBSCRIBED'), 0); return ch },
      async track(meta) { me.meta = meta; setTimeout(() => { for (const c of bus) { c.handlers.filter(h => h.type === 'presence' && h.event === 'sync').forEach(h => h.cb()); if (c !== me) c.handlers.filter(h => h.type === 'presence' && h.event === 'join').forEach(h => h.cb({ key })) } }, 0) },
      untrack() { me.meta = null }, presenceState() { return Object.fromEntries([...bus].filter(c => c.meta).map(c => [c.key, [c.meta]])) },
      send({ event, payload }) { setTimeout(() => { for (const c of bus) if (c !== me) c.handlers.filter(h => h.type === 'broadcast' && h.event === event).forEach(h => h.cb({ payload })) }, 0) },
    }
    ch._bus = bus; ch._me = me; return ch
  },
  removeChannel(ch) { ch._bus.delete(ch._me) },
})
const wait = ms => new Promise(r => setTimeout(r, ms))
const client = (name, isOwner, parts, script, db) => {
  const st = { script, lang: 'lua', parts, peers: [], refreshed: 0 }
  return startCollab({ db, gameId: 'g1', code: 'ABC234', name, isOwner, parts, getScript: () => ({ script: st.script, lang: st.lang }), setScript: (s, l) => { st.script = s; st.lang = l }, getSel: () => [], onParts: () => st.refreshed++, onPeers: l => { st.peers = l }, onSelections() {}, onStatus() {} }).then(c => ({ c, st }))
}

test('el invitado recibe el estado del dueño y los cambios viajan en los dos sentidos', async () => {
  const db = fakeDb()
  const ownerParts = [{ name: 'A', x: 1 }, { name: 'B', x: 2 }]
  const o = await client('Dueño', true, ownerParts, 'print(1)', db)
  const g = await client('Ana', false, [], '', db)
  await wait(900)
  assert.deepEqual(g.st.parts.map(p => p.name).sort(), ['A', 'B']); assert.equal(g.st.script, 'print(1)')
  assert.equal(o.st.peers[0]?.name, 'Ana')
  g.st.parts[0].x = 9; g.st.parts.push({ name: 'C', x: 3 }); await wait(900)          // el invitado mueve A y crea C
  assert.equal(ownerParts.find(p => p.name === 'A').x, 9); assert.ok(ownerParts.some(p => p.name === 'C'))
  ownerParts.splice(ownerParts.findIndex(p => p.name === 'B'), 1); o.st.script = 'print(2)'; await wait(900)       // el dueño borra B y cambia el script
  assert.ok(!g.st.parts.some(p => p.name === 'B')); assert.equal(g.st.script, 'print(2)')
  o.c.stop(); g.c.stop()
})
test('un código distinto no comparte nada y el código se limpia', async () => {
  const db = fakeDb(); const a = await client('X', true, [{ name: 'P' }], 's', db)
  const other = await startCollab({ db, gameId: 'g1', code: 'ZZZZZZ', name: 'Y', isOwner: false, parts: [], getScript: () => ({ script: '', lang: 'js' }), setScript() {}, getSel: () => [], onParts() {}, onPeers() {}, onSelections() {}, onStatus() {} })
  await wait(600); assert.equal(a.st.peers.length, 0); a.c.stop(); other.stop()
  assert.equal(genCode().length, 6); assert.equal(cleanCode(' ab-c1 2345xyz'), 'ABC123')
})
