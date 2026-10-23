// Fiesta: chat de grupo sin base de datos (canal de difusión de Supabase Realtime). Los mensajes no se guardan.
import { authDb } from './supabase.js'
import { t } from './i18n.js'

let ch = null, code = '', name = '', listeners = new Set(), log = [], members = new Map()
const emit = () => listeners.forEach(f => f({ code, log, members: [...members.values()] }))
export const onParty = f => { listeners.add(f); return () => listeners.delete(f) }
export const partyCode = () => code
export const newCode = () => Math.random().toString(36).slice(2, 8).toUpperCase()
export function joinParty(c, me) {
  leaveParty(); code = String(c).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10); name = me; log = []; members = new Map()
  ch = authDb.channel(`party:${code}`, { config: { broadcast: { self: true }, presence: { key: me } } })
    .on('broadcast', { event: 'msg' }, ({ payload }) => { log.push({ name: String(payload.name).slice(0, 24), text: String(payload.text).slice(0, 300) }); if (log.length > 80) log.shift(); emit() })
    .on('presence', { event: 'sync' }, () => { members = new Map(Object.keys(ch.presenceState()).map(k => [k, k])); emit() })
    .subscribe(st => { if (st === 'SUBSCRIBED') ch.track({ at: Date.now() }) })
  emit()
}
export const sendParty = text => { const x = String(text).trim().slice(0, 300); if (x && ch) ch.send({ type: 'broadcast', event: 'msg', payload: { name, text: x } }) }
export function leaveParty() { if (ch) authDb.removeChannel(ch); ch = null; code = ''; log = []; members = new Map(); emit() }
