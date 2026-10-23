// Avatares de Blocksy: modelo 3D (three.js), poses/emotes y foto de perfil (cabeza del avatar).
// El aspecto sale del nombre de usuario + el color de camiseta, con el MISMO algoritmo que la app de 3DS (hash FNV-1a),
// así cada jugador se ve igual en la web y en la consola.
import * as THREE from 'three'

const SKIN = ['#ffd9a8', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffe0bd']
const HAIR = ['#2b1b10', '#5a3a1e', '#a0522d', '#d4a017', '#1c1c1c', '#8b0000', '#b0b0b0', '#3b6fb6']
const PANTS = ['#34495e', '#2c3e50', '#4b3a2a', '#3d3d3d', '#264653', '#5b2a86']

export const EMOTES = [
  { id: 'wave', label: 'Saludar' },
  { id: 'dance', label: 'Bailar' },
  { id: 'cheer', label: 'Celebrar' },
  { id: 'clap', label: 'Aplaudir' },
  { id: 'sit', label: 'Sentarse' },
  { id: 'jumpjoy', label: 'Saltar de alegria' },
  { id: 'cry', label: 'Llorar' },
  { id: 'point', label: 'Senalar' },
  { id: 'flex', label: 'Presumir' },
]
export const isEmote = a => EMOTES.some(e => e.id === a)

export function hash32(s) {                    // FNV-1a de 32 bits sobre los bytes UTF-8
  let h = 0x811c9dc5
  for (const b of new TextEncoder().encode(s)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0 }
  return h >>> 0
}
export function styleFor(name, shirt) {
  const h = hash32(String(name || ''))
  return { shirt, skin: SKIN[h % SKIN.length], hair: HAIR[(h >>> 8) % HAIR.length], pants: PANTS[(h >>> 16) % PANTS.length], hairStyle: (h >>> 24) % 3 }
}

// ---------- modelo 3D ----------
const lambert = c => new THREE.MeshLambertMaterial({ color: c })
function box(w, h, d, color, x, y, z, mats) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats ?? lambert(color))
  m.position.set(x, y, z); m.castShadow = true; return m
}
function limb(x, y, w, h, d, color) { const p = new THREE.Group(); p.position.set(x, y, 0); p.add(box(w, h, d, color, 0, -h / 2, 0)); return p }

function faceTexture(skin) {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d')
  g.fillStyle = skin; g.fillRect(0, 0, 64, 64)
  g.fillStyle = '#1b1b1b'; g.fillRect(14, 26, 9, 11); g.fillRect(41, 26, 9, 11)          // ojos
  g.fillStyle = '#fff'; g.fillRect(14, 26, 4, 4); g.fillRect(41, 26, 4, 4)               // brillo
  g.strokeStyle = '#5b2d1a'; g.lineWidth = 3; g.lineCap = 'round'
  g.beginPath(); g.arc(32, 40, 10, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke()            // sonrisa
  g.fillStyle = 'rgba(255,120,120,.25)'; g.fillRect(8, 38, 8, 5); g.fillRect(48, 38, 8, 5)   // mejillas
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter
  return t
}

// ---------- sombreros de la tienda ----------
export const HAT_COLORS = { hat_cap: '#e74c3c', hat_antenna: '#7ed6ff', hat_party: '#ff6b9d', hat_halo: '#f5c542', hat_top: '#2b2f36', hat_crown: '#f1c40f', hat_wizard: '#6c3fb5', hat_cowboy: '#a0522d', hat_chef: '#f5f5f5', hat_beanie: '#e67e22', hat_helmet: '#7f8c8d', hat_flower: '#ff7eb6' }
export const hatStyle = id => (id && HAT_COLORS[id] ? { id, color: HAT_COLORS[id] } : null)
// Otros accesorios de la tienda: gafas (face), espalda (back), estelas (trail) y mascotas (pet)
export const COS_COLORS = { face_shades: '#1b1b1b', face_round: '#f5c542', face_visor: '#4dd0ff', face_mask: '#ffffff', back_cape: '#c0392b', back_wings: '#ecf0f1', back_backpack: '#2d6a4f',
  trail_spark: '#ffe066', trail_fire: '#ff6b2b', trail_rainbow: 'rainbow', trail_bubbles: '#7ed6ff', pet_cube: '#4d8dff', pet_slime: '#4cd964', pet_bot: '#aab4c0', pet_ghost: '#f0f0ff' }
export const cosStyle = id => (id && COS_COLORS[id] ? { id, color: COS_COLORS[id] } : null)
export const SLOTS = ['hat', 'face', 'back', 'trail', 'pet']
// Lo que llevas puesto viaja como "gorro|gafas|espalda|estela|mascota" (los vacíos quedan en blanco)
export const packLoadout = eq => SLOTS.map(k => eq?.[k] ?? '').join('|')
export const parseLoadout = s => { const a = String(s ?? '').split('|'); return Object.fromEntries(SLOTS.map((k, i) => [k, a[i] || ''])) }
export const loadoutStyle = (base, lo) => ({ ...base, hat: hatStyle(lo.hat), face: cosStyle(lo.face), back: cosStyle(lo.back) })
function addFace(head, f) {
  const m = lambert(f.color), add = (...o) => head.add(...o)
  switch (f.id) {
    case 'face_shades': add(box(0.5, 0.11, 0.03, null, 0, 0.04, 0.27, m), box(0.5, 0.03, 0.03, null, 0, 0.1, 0.27, m)); break
    case 'face_round': add(box(0.17, 0.17, 0.03, null, -0.12, 0.04, 0.27, m), box(0.17, 0.17, 0.03, null, 0.12, 0.04, 0.27, m), box(0.06, 0.03, 0.03, null, 0, 0.07, 0.27, m)); break
    case 'face_visor': add(box(0.56, 0.16, 0.05, null, 0, 0.05, 0.28, new THREE.MeshBasicMaterial({ color: f.color, transparent: true, opacity: 0.75 }))); break
    case 'face_mask': add(box(0.52, 0.24, 0.03, null, 0, -0.12, 0.27, m)); break
  }
}
function addBack(torso, b) {
  const m = lambert(b.color), add = (...o) => torso.add(...o)
  switch (b.id) {
    case 'back_cape': add(box(0.62, 0.95, 0.05, null, 0, -0.1, -0.21, m)); break
    case 'back_wings': for (const s of [-1, 1]) { const w = box(0.55, 0.7, 0.04, null, s * 0.38, 0.05, -0.24, m); w.rotation.z = -s * 0.35; add(w) } break
    case 'back_backpack': add(box(0.42, 0.52, 0.2, null, 0, 0, -0.28, m), box(0.3, 0.14, 0.04, null, 0, -0.05, -0.4, lambert('#1b4332'))); break
  }
}
// Mascota: un muñeco pequeño que sigue a su dueño
export function buildPet(id) {
  const c = COS_COLORS[id] ?? '#4d8dff', g = new THREE.Group(), m = lambert(c)
  switch (id) {
    case 'pet_slime': g.add(box(0.5, 0.36, 0.5, null, 0, 0.18, 0, new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: 0.85 })), box(0.06, 0.06, 0.02, '#1b1b1b', -0.1, 0.24, 0.26), box(0.06, 0.06, 0.02, '#1b1b1b', 0.1, 0.24, 0.26)); break
    case 'pet_bot': g.add(box(0.36, 0.3, 0.3, null, 0, 0.3, 0, m), box(0.26, 0.26, 0.26, null, 0, 0.58, 0, m), box(0.06, 0.06, 0.02, '#ff4d4d', -0.07, 0.6, 0.14), box(0.06, 0.06, 0.02, '#ff4d4d', 0.07, 0.6, 0.14), box(0.03, 0.14, 0.03, null, 0, 0.78, 0, lambert('#7f8c8d'))); break
    case 'pet_ghost': g.add(box(0.4, 0.5, 0.3, null, 0, 0.4, 0, new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: 0.8, emissive: '#444466' })), box(0.07, 0.09, 0.02, '#1b1b1b', -0.09, 0.5, 0.16), box(0.07, 0.09, 0.02, '#1b1b1b', 0.09, 0.5, 0.16)); break
    default: g.add(box(0.4, 0.4, 0.4, null, 0, 0.3, 0, m), box(0.07, 0.07, 0.02, '#fff', -0.09, 0.34, 0.21), box(0.07, 0.07, 0.02, '#fff', 0.09, 0.34, 0.21))
  }
  return g
}
export function trailColor(id, t = 0) { const c = COS_COLORS[id]; return c === 'rainbow' ? `hsl(${(t * 360) % 360},90%,60%)` : c }
function addHat(head, hat) {
  const c = hat.color, m = lambert(c), add = (...o) => head.add(...o)
  switch (hat.id) {
    case 'hat_cap': add(box(0.58, 0.14, 0.58, null, 0, 0.37, -0.01, m), box(0.5, 0.04, 0.3, null, 0, 0.31, 0.4, lambert('#c0392b'))); break
    case 'hat_antenna': add(box(0.04, 0.34, 0.04, null, 0, 0.5, 0, lambert('#9aa0a8')), box(0.12, 0.12, 0.12, null, 0, 0.74, 0, m)); break
    case 'hat_party': { const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.48, 4), m); cone.position.set(0, 0.57, 0); cone.rotation.y = Math.PI / 4; cone.castShadow = true; add(cone, box(0.08, 0.08, 0.08, null, 0, 0.84, 0, lambert('#ffffff'))); break }
    case 'hat_halo': { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 28), new THREE.MeshBasicMaterial({ color: c })); ring.position.set(0, 0.62, 0); ring.rotation.x = Math.PI / 2; add(ring); break }
    case 'hat_top': add(box(0.68, 0.05, 0.68, null, 0, 0.34, 0, m), box(0.4, 0.42, 0.4, null, 0, 0.58, 0, m), box(0.42, 0.07, 0.42, null, 0, 0.45, 0, lambert('#c0392b'))); break
    case 'hat_wizard': { add(box(0.7, 0.05, 0.7, null, 0, 0.34, 0, m)); const cone = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.7, 4), m); cone.position.set(0, 0.7, 0); cone.rotation.y = Math.PI / 4; cone.castShadow = true; add(cone, box(0.54, 0.05, 0.54, null, 0, 0.4, 0, lambert('#f5c542'))); break }
    case 'hat_cowboy': add(box(0.78, 0.05, 0.62, null, 0, 0.34, 0, m), box(0.42, 0.22, 0.42, null, 0, 0.47, 0, m), box(0.44, 0.05, 0.44, null, 0, 0.4, 0, lambert('#5b3a1a'))); break
    case 'hat_chef': add(box(0.5, 0.12, 0.5, null, 0, 0.35, 0, m), box(0.6, 0.34, 0.6, null, 0, 0.58, 0, m)); break
    case 'hat_beanie': add(box(0.58, 0.16, 0.58, null, 0, 0.35, 0, m), box(0.44, 0.12, 0.44, null, 0, 0.5, 0, m), box(0.12, 0.12, 0.12, null, 0, 0.62, 0, lambert('#ffffff'))); break
    case 'hat_helmet': add(box(0.6, 0.3, 0.6, null, 0, 0.38, 0, m), box(0.08, 0.2, 0.64, null, 0, 0.58, 0, lambert('#c0392b'))); break
    case 'hat_flower': add(box(0.1, 0.22, 0.1, null, 0, 0.42, 0, lambert('#2ecc71')), box(0.28, 0.1, 0.28, null, 0, 0.58, 0, m), box(0.1, 0.12, 0.1, null, 0, 0.6, 0, lambert('#f1c40f'))); break
    case 'hat_crown': add(box(0.52, 0.12, 0.52, null, 0, 0.4, 0, m)); for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2], [0, 0]]) add(box(0.1, 0.16, 0.1, null, x, 0.54, z, m)); break
  }
}

// Devuelve un Group con el avatar de pie sobre y=0, mirando a +z. userData guarda las articulaciones para animar.
export function buildAvatar(style) {
  const g = new THREE.Group()
  const torso = box(0.64, 0.72, 0.36, style.shirt, 0, 1.1, 0)
  const head = new THREE.Group(); head.position.set(0, 1.78, 0)
  const skinMat = lambert(style.skin)
  head.add(box(0.52, 0.52, 0.52, style.skin, 0, 0, 0, [skinMat, skinMat, skinMat, skinMat, new THREE.MeshLambertMaterial({ map: faceTexture(style.skin) }), skinMat]))
  // peinado: 0 corto, 1 flequillo largo, 2 pinchos
  const hairMat = lambert(style.hair)
  head.add(box(0.56, 0.14, 0.56, null, 0, 0.26, -0.01, hairMat))
  if (style.hairStyle === 1) { head.add(box(0.56, 0.22, 0.1, null, 0, 0.12, -0.23, hairMat), box(0.1, 0.3, 0.5, null, -0.27, 0.05, -0.02, hairMat), box(0.1, 0.3, 0.5, null, 0.27, 0.05, -0.02, hairMat)) }
  else if (style.hairStyle === 2) { for (const x of [-0.18, 0, 0.18]) head.add(box(0.1, 0.18, 0.1, null, x, 0.4, 0, hairMat)) }
  else head.add(box(0.56, 0.12, 0.1, null, 0, 0.18, 0.24, hairMat))
  if (style.hat) addHat(head, style.hat)
  if (style.face) addFace(head, style.face)
  if (style.back) addBack(torso, style.back)
  const legL = limb(-0.16, 0.74, 0.3, 0.74, 0.32, style.pants), legR = limb(0.16, 0.74, 0.3, 0.74, 0.32, style.pants)
  const armL = limb(-0.44, 1.42, 0.22, 0.68, 0.26, style.skin), armR = limb(0.44, 1.42, 0.22, 0.68, 0.26, style.skin)
  const sleeveL = box(0.24, 0.26, 0.28, style.shirt, 0, -0.13, 0), sleeveR = box(0.24, 0.26, 0.28, style.shirt, 0, -0.13, 0)
  armL.add(sleeveL); armR.add(sleeveR)
  const body = new THREE.Group(); body.add(torso, head, armL, armR)        // el cuerpo sube y baja al bailar / sentarse
  g.add(body, legL, legR)
  g.userData = { body, head, legL, legR, armL, armR, phase: 0, style }
  return g
}

// Pose según el estado: idle / walk / jump o un emote. dt en segundos, t = tiempo total. Suaviza hacia la pose objetivo.
export function poseAvatar(g, anim, dt, t) {
  const u = g.userData
  if (anim === 'walk') u.phase += dt * 11
  else if (isEmote(anim)) u.phase += dt * (anim === 'dance' ? 9 : anim === 'clap' ? 14 : anim === 'jumpjoy' ? 8 : anim === 'cry' ? 10 : anim === 'flex' ? 5 : 7)
  const k = Math.min(1, dt * 14)
  const lerp = (o, p, v) => { o.rotation[p] += (v - o.rotation[p]) * k }
  const s = Math.sin(u.phase)
  let legL = 0, legR = 0, armLx = 0, armRx = 0, armLz = 0, armRz = 0, bodyY = 0, headX = 0
  switch (anim) {
    case 'walk': legL = s * 0.85; legR = -s * 0.85; armLx = -s * 0.8; armRx = s * 0.8; break
    case 'jump': legL = 0.35; legR = -0.25; armLx = -2.5; armRx = -2.5; break
    case 'wave': armRz = 2.6 + Math.sin(u.phase * 1.6) * 0.35; armLx = Math.sin(t * 1.6) * 0.04; break          // brazo derecho arriba saludando
    case 'dance': legL = s * 0.5; legR = -s * 0.5; armLz = -2.4 - Math.sin(u.phase * 2) * 0.4; armRz = 2.4 + Math.sin(u.phase * 2 + 1) * 0.4; bodyY = Math.abs(Math.sin(u.phase)) * 0.16; headX = Math.sin(u.phase * 2) * 0.12; break
    case 'cheer': armLx = -3.0; armRx = -3.0; armLz = -0.35; armRz = 0.35; bodyY = Math.abs(Math.sin(u.phase)) * 0.22; break
    case 'clap': armLx = -1.45; armRx = -1.45; armLz = 0.55 - (Math.sin(u.phase) + 1) * 0.28; armRz = -0.55 + (Math.sin(u.phase) + 1) * 0.28; break
    case 'jumpjoy': armLx = -3; armRx = -3; legL = Math.abs(s) * 0.4; legR = -Math.abs(s) * 0.3; bodyY = Math.abs(Math.sin(u.phase)) * 0.38; break
    case 'cry': armLx = -1.35; armRx = -1.35; armLz = 0.5; armRz = -0.5; headX = 0.4 + Math.sin(u.phase) * 0.05; bodyY = -0.04 + Math.sin(u.phase * 1.4) * 0.02; break
    case 'point': armRx = -1.55; armLx = Math.sin(t * 1.6) * 0.04; headX = -0.05; break
    case 'flex': armLz = -1.55 + Math.sin(u.phase) * 0.1; armRz = 1.55 - Math.sin(u.phase) * 0.1; armLx = -0.4; armRx = -0.4; bodyY = Math.abs(Math.sin(u.phase)) * 0.05; break
    case 'sit': legL = -1.5; legR = -1.5; armLx = -0.5; armRx = -0.5; bodyY = -0.36; break
    default: armLx = Math.sin(t * 1.6) * 0.05; armRx = -Math.sin(t * 1.6) * 0.05; headX = Math.sin(t * 1.2) * 0.03
  }
  lerp(u.legL, 'x', legL); lerp(u.legR, 'x', legR); lerp(u.armL, 'x', armLx); lerp(u.armR, 'x', armRx)
  lerp(u.armL, 'z', armLz); lerp(u.armR, 'z', armRz); lerp(u.head, 'x', headX)
  u.body.position.y += (bodyY - u.body.position.y) * k
  if (anim === 'sit') { u.legL.position.y += (0.38 - u.legL.position.y) * k; u.legR.position.y += (0.38 - u.legR.position.y) * k }
  else { u.legL.position.y += (0.74 - u.legL.position.y) * k; u.legR.position.y += (0.74 - u.legR.position.y) * k }
}

// ---------- foto de perfil: cabeza del avatar (2D, con caché) ----------
const cache = new Map()
export function headshot(name, shirt, size = 96) {
  const key = `${name}|${shirt}|${size}`
  if (cache.has(key)) return cache.get(key)
  const st = styleFor(name, shirt), c = document.createElement('canvas'); c.width = c.height = size
  const g = c.getContext('2d'), s = size / 96
  const bg = g.createLinearGradient(0, 0, 0, size); bg.addColorStop(0, '#3a4f6b'); bg.addColorStop(1, '#222c3c')
  g.fillStyle = bg; g.fillRect(0, 0, size, size)
  const sh = (col, a) => { const k = new THREE.Color(col).multiplyScalar(a); return '#' + k.getHexString() }
  g.fillStyle = st.shirt; g.fillRect(14 * s, 74 * s, 68 * s, 30 * s)                                  // hombros
  g.fillStyle = sh(st.shirt, 0.78); g.fillRect(14 * s, 74 * s, 10 * s, 30 * s); g.fillRect(72 * s, 74 * s, 10 * s, 30 * s)
  g.fillStyle = sh(st.skin, 0.82); g.fillRect(38 * s, 66 * s, 20 * s, 12 * s)                         // cuello
  g.fillStyle = st.skin; g.fillRect(24 * s, 18 * s, 48 * s, 52 * s)                                   // cabeza
  g.fillStyle = sh(st.skin, 0.9); g.fillRect(24 * s, 18 * s, 6 * s, 52 * s)
  g.fillStyle = st.hair; g.fillRect(22 * s, 12 * s, 52 * s, 16 * s)                                   // pelo
  if (st.hairStyle === 1) { g.fillRect(22 * s, 12 * s, 8 * s, 40 * s); g.fillRect(66 * s, 12 * s, 8 * s, 40 * s); g.fillRect(24 * s, 24 * s, 48 * s, 8 * s) }
  else if (st.hairStyle === 2) { for (const x of [26, 42, 58]) g.fillRect(x * s, 4 * s, 12 * s, 12 * s) }
  else g.fillRect(24 * s, 26 * s, 48 * s, 5 * s)
  g.fillStyle = '#1b1b1b'; g.fillRect(34 * s, 40 * s, 8 * s, 10 * s); g.fillRect(54 * s, 40 * s, 8 * s, 10 * s)   // ojos
  g.fillStyle = '#fff'; g.fillRect(34 * s, 40 * s, 3 * s, 3 * s); g.fillRect(54 * s, 40 * s, 3 * s, 3 * s)
  g.strokeStyle = '#5b2d1a'; g.lineWidth = 3 * s; g.lineCap = 'round'
  g.beginPath(); g.arc(48 * s, 54 * s, 8 * s, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke()               // sonrisa
  const url = c.toDataURL('image/png'); cache.set(key, url); return url
}

// ---------- vista previa 3D (editor de avatar): gira sola y se puede arrastrar ----------
export function createPreview(canvas, style) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.shadowMap.enabled = true
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight('#ffffff', '#556070', 1.5))
  const sun = new THREE.DirectionalLight('#ffffff', 2); sun.position.set(2, 4, 3); sun.castShadow = true; scene.add(sun)
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), new THREE.ShadowMaterial({ opacity: 0.35 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground)
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50); camera.position.set(0, 1.35, 5.2); camera.lookAt(0, 1.05, 0)
  let model = null, anim = 'idle', yaw = 0.5, dragging = false, lastX = 0, raf = 0, t = 0, last = performance.now(), alive = true
  const mount = st => { if (model) scene.remove(model); model = buildAvatar(st); scene.add(model) }
  mount(style)
  const down = e => { dragging = true; lastX = e.clientX; canvas.setPointerCapture?.(e.pointerId) }
  const move = e => { if (dragging) { yaw += (e.clientX - lastX) * 0.012; lastX = e.clientX } }
  const up = () => { dragging = false }
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up)
  function frame(now) {
    if (!alive) return
    if (!canvas.isConnected) { api.destroy(); return }          // la página cambió: se libera sola
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt
    const w = canvas.clientWidth, h = canvas.clientHeight
    if (w && h && (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio()))) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() }
    if (!dragging) yaw += dt * 0.5
    model.rotation.y = yaw; poseAvatar(model, anim, dt, t)
    renderer.render(scene, camera)
  }
  raf = requestAnimationFrame(frame)
  const api = {
    setStyle: mount, setAnim: a => { anim = a },
    destroy() { alive = false; cancelAnimationFrame(raf); renderer.dispose() },
  }
  return api
}
