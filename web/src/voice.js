// Chat de voz por proximidad (WebRTC entre jugadores). La señalización va por Supabase Realtime (broadcast);
// el audio va directo entre navegadores. Sin servidor TURN: en redes muy restrictivas puede no conectar.
import { gameDb } from './supabase.js'
import { settings } from './settings.js'

const ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] }
const MAX_PEERS = 7
const NEAR = 4, FAR = 26       // volumen completo hasta NEAR bloques; silencio a partir de FAR

export function createVoice({ gameId, selfId, name, getPos, onChange }) {
  let ch = null, stream = null, ac = null, active = false, muted = false
  const peers = new Map()       // id -> { name, pc, gain, src, analyser, audioEl, speaking, pos: () => {x,y,z} }
  let selfAnalyser = null, selfSpeaking = false, raf = 0

  const send = (to, type, data) => ch?.send({ type: 'broadcast', event: 'sig', payload: { from: selfId, to, type, data, name } })
  const notify = () => onChange?.({ active, muted, members: [...peers.entries()].map(([id, p]) => ({ id, name: p.name, speaking: p.speaking })), selfSpeaking })

  function makePeer(id, peerName) {
    if (peers.has(id)) return peers.get(id)
    if (peers.size >= MAX_PEERS) return null
    const pc = new RTCPeerConnection(ICE)
    const p = { name: peerName || '?', pc, gain: null, analyser: null, speaking: false, level: 0 }
    peers.set(id, p)
    stream?.getTracks().forEach(t => pc.addTrack(t, stream))
    pc.onicecandidate = e => { if (e.candidate) send(id, 'ice', e.candidate.toJSON()) }
    pc.ontrack = e => {
      const rs = e.streams[0]; if (!rs || p.gain) return
      const a = new Audio(); a.srcObject = rs; a.muted = true; a.play?.().catch(() => {})            // (Chrome necesita el stream enganchado a un elemento)
      const src = ac.createMediaStreamSource(rs), gain = ac.createGain(), an = ac.createAnalyser(); an.fftSize = 512
      src.connect(an); src.connect(gain); gain.connect(ac.destination); gain.gain.value = 0
      p.gain = gain; p.analyser = an; p.audioEl = a
    }
    pc.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) setTimeout(() => { if (peers.get(id) === p && pc.connectionState !== 'connected') drop(id) }, 4000) }
    notify(); return p
  }
  function drop(id) {
    const p = peers.get(id); if (!p) return
    try { p.pc.close() } catch {}
    try { p.gain?.disconnect() } catch {}
    p.audioEl?.pause?.(); peers.delete(id); notify()
  }

  async function onSignal({ payload: m }) {
    if (!active || !m || m.from === selfId || (m.to && m.to !== selfId)) return
    if (m.type === 'hello') {                                  // alguien entró a la voz: el de id menor ofrece
      const p = makePeer(m.from, m.name); if (!p) return
      if (!m.reply) send(m.from, 'hello', { reply: true })
      if (selfId < m.from) { const o = await p.pc.createOffer(); await p.pc.setLocalDescription(o); send(m.from, 'offer', o) }
    } else if (m.type === 'offer') {
      const p = makePeer(m.from, m.name); if (!p) return
      await p.pc.setRemoteDescription(m.data); const a = await p.pc.createAnswer(); await p.pc.setLocalDescription(a); send(m.from, 'answer', a)
    } else if (m.type === 'answer') {
      const p = peers.get(m.from); if (p && p.pc.signalingState === 'have-local-offer') await p.pc.setRemoteDescription(m.data)
    } else if (m.type === 'ice') {
      const p = peers.get(m.from); if (p) { try { await p.pc.addIceCandidate(m.data) } catch {} }
    } else if (m.type === 'bye') drop(m.from)
  }

  // volumen por distancia + indicadores de "hablando"
  const buf = new Uint8Array(256)
  const level = an => { an.getByteTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v } return Math.sqrt(s / buf.length) }
  function loop() {
    raf = requestAnimationFrame(loop); if (!active) return
    const me = getPos?.(selfId)
    let changed = false
    for (const [id, p] of peers) {
      if (p.gain) {
        let g = 1
        if (settings.voiceProximity) { const o = getPos?.(id); if (me && o) { const d = Math.hypot(me.x - o.x, me.y - o.y, me.z - o.z); g = d <= NEAR ? 1 : d >= FAR ? 0 : 1 - (d - NEAR) / (FAR - NEAR); g *= g } }
        p.gain.gain.value += (g * settings.voiceVol - p.gain.gain.value) * 0.2
        const sp = level(p.analyser) > 0.02; if (sp !== p.speaking) { p.speaking = sp; changed = true }
      }
    }
    if (selfAnalyser) { const sp = !muted && level(selfAnalyser) > 0.02; if (sp !== selfSpeaking) { selfSpeaking = sp; changed = true } }
    if (changed) notify()
  }

  return {
    get active() { return active }, get muted() { return muted },
    async start() {
      if (active) return
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error('voice unsupported')
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
      ac = new (window.AudioContext || window.webkitAudioContext)(); await ac.resume().catch(() => {})
      selfAnalyser = ac.createAnalyser(); selfAnalyser.fftSize = 512; ac.createMediaStreamSource(stream).connect(selfAnalyser)
      active = true; muted = settings.voiceMode === 'ptt'; stream.getAudioTracks().forEach(t => (t.enabled = !muted))
      ch = gameDb.channel(`voice:${gameId}`, { config: { broadcast: { self: false } } }).on('broadcast', { event: 'sig' }, onSignal)
      await new Promise(res => ch.subscribe(st => { if (st === 'SUBSCRIBED') res() }))
      send(null, 'hello', {}); loop(); notify()
    },
    setMuted(v) { muted = v; stream?.getAudioTracks().forEach(t => (t.enabled = !v)); notify() },
    toggleMute() { this.setMuted(!muted) },
    stop() {
      if (!active && !ch) return
      send(null, 'bye', {}); active = false; cancelAnimationFrame(raf)
      for (const id of [...peers.keys()]) drop(id)
      stream?.getTracks().forEach(t => t.stop()); stream = null
      try { ac?.close() } catch {} ac = null; selfAnalyser = null
      if (ch) { gameDb.removeChannel(ch); ch = null }
      selfSpeaking = false; notify()
    },
  }
}
