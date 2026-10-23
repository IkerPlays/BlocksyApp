// Efectos de sonido sintetizados con WebAudio (sin archivos)
import { settings } from './settings.js'
let ac = null
const ctx = () => { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)() } catch { return null } } if (ac.state === 'suspended') ac.resume().catch(() => {}); return ac }
function tone(freq, dur, { type = 'sine', gain = 0.2, slide = 0, delay = 0 } = {}) {
  if (!settings.sfx) return
  const a = ctx(); if (!a) return
  const t0 = a.currentTime + delay, o = a.createOscillator(), g = a.createGain()
  o.type = type; o.frequency.setValueAtTime(freq, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur)
  const v = gain * settings.sfxVol
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02)
}
function noise(dur, { gain = 0.15, freq = 800 } = {}) {
  if (!settings.sfx) return
  const a = ctx(); if (!a) return
  const n = a.sampleRate * dur | 0, buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain()
  s.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = gain * settings.sfxVol
  s.connect(f).connect(g).connect(a.destination); s.start()
}
export const sfx = {
  place: () => { tone(300, 0.09, { type: 'square', gain: 0.1, slide: 120 }); noise(0.05, { gain: 0.08, freq: 1500 }) },
  break: () => { noise(0.14, { gain: 0.22, freq: 900 }); tone(160, 0.1, { type: 'sawtooth', gain: 0.08, slide: -70 }) },
  jump: () => tone(260, 0.14, { type: 'sine', gain: 0.1, slide: 260 }),
  land: () => noise(0.06, { gain: 0.1, freq: 500 }),
  chat: () => tone(880, 0.07, { gain: 0.07 }),
  notify: () => { tone(660, 0.12, { gain: 0.12 }); tone(990, 0.16, { gain: 0.12, delay: 0.1 }) },
  join: () => { tone(520, 0.1, { gain: 0.08 }); tone(780, 0.12, { gain: 0.08, delay: 0.08 }) },
  checkpoint: () => { tone(700, 0.1, { gain: 0.1 }); tone(1050, 0.18, { gain: 0.1, delay: 0.09 }) },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, { gain: 0.12, delay: i * 0.12 })),
  fall: () => tone(400, 0.4, { type: 'triangle', gain: 0.1, slide: -300 }),
  step: () => noise(0.04, { gain: 0.045, freq: 700 + Math.random() * 300 }),
  click: () => tone(500, 0.04, { type: 'square', gain: 0.05 }),
}
