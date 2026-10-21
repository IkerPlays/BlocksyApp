import * as THREE from 'three'
import { gameDb } from './supabase.js'
import * as api from './api.js'
import { settings, saveSettings } from './settings.js'
import { buildAvatar, poseAvatar, styleFor, EMOTES, isEmote, headshot } from './avatar.js'
import { icon } from './icons.js'

export const PALETTE = ['#e8e8e8', '#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6']
const SEND_MS = 100        // 10 Hz de posición
const STALE_MS = 15_000    // jugador sin actualizar = desconectado
const CAP = 6000           // bloques máximos por color
const key = (x, y, z) => `${x},${y},${z}`
const $ = id => document.getElementById(id)
const IS_TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

// ---------- texturas generadas (sin imágenes externas) ----------
function canvasTex(size, draw, { repeat = null, nearest = true } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size
  draw(c.getContext('2d'), size)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  if (nearest) t.magFilter = THREE.NearestFilter
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 4 }
  return t
}
const blockTexture = () => canvasTex(32, (g, s) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, s, s)
  for (let i = 0; i < 120; i++) { const v = 226 + (Math.random() * 29 | 0); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * s | 0, Math.random() * s | 0, 2, 2) }
  g.strokeStyle = 'rgba(0,0,0,.30)'; g.lineWidth = 2; g.strokeRect(1, 1, s - 2, s - 2)
  g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(2, 2, s - 4, 2); g.fillRect(2, 2, 2, s - 4)   // brillo arriba/izquierda
})
const groundTexture = repeat => canvasTex(64, (g, s) => {
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#58a553' : '#62b05c'; g.fillRect(x * s / 2, y * s / 2, s / 2, s / 2) }
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,40,0'},.07)`; g.fillRect(Math.random() * s | 0, Math.random() * s | 0, 2, 2) }
}, { repeat })
const skyTexture = () => canvasTex(256, (g, s) => {
  const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#4f9fe8'); gr.addColorStop(.55, '#9ccdf6'); gr.addColorStop(1, '#d8ecff')
  g.fillStyle = gr; g.fillRect(0, 0, s, s)
}, { nearest: false })

export function startGame({ game, profile, canvas, onExit }) {
  // ---------- escena ----------
  const scene = new THREE.Scene()
  scene.background = skyTexture()
  scene.fog = new THREE.Fog('#d8ecff', settings.viewDistance * 0.35, settings.viewDistance)
  const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 400)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap

  scene.add(new THREE.HemisphereLight('#ffffff', '#6f8f62', 1.25))
  const sun = new THREE.DirectionalLight('#fff4e0', 1.9)
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 })
  scene.add(sun, sun.target)

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ map: groundTexture(300) }))
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor)

  // ---------- bloques (un InstancedMesh por color: miles de bloques sin perder fps) ----------
  const geo = new THREE.BoxGeometry(1, 1, 1)
  const tex = blockTexture()
  const meshes = PALETTE.map(c => {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: c, map: tex }), CAP)
    m.count = 0; m.castShadow = m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m
  })
  const cells = PALETTE.map(() => [])     // por color: lista de claves "x,y,z" (posición = índice de instancia)
  const index = new Map()                 // "x,y,z" -> { kind, i }
  const tmp = new THREE.Matrix4()
  let bboxDirty = false
  const solid = (x, y, z) => index.has(key(x, y, z))
  function setBlock(x, y, z, kind) {
    kind = ((kind % PALETTE.length) + PALETTE.length) % PALETTE.length
    const k = key(x, y, z), old = index.get(k)
    if (old) { if (old.kind === kind) return; removeBlock(x, y, z) }
    const m = meshes[kind]; if (m.count >= CAP) return
    const i = m.count++
    tmp.makeTranslation(x + 0.5, y + 0.5, z + 0.5); m.setMatrixAt(i, tmp); m.instanceMatrix.needsUpdate = true
    cells[kind][i] = k; index.set(k, { kind, i }); bboxDirty = true
  }
  function removeBlock(x, y, z) {
    const k = key(x, y, z), e = index.get(k); if (!e) return
    const m = meshes[e.kind], last = m.count - 1
    if (e.i !== last) {                    // el último ocupa el hueco
      m.getMatrixAt(last, tmp); m.setMatrixAt(e.i, tmp)
      const lk = cells[e.kind][last]; cells[e.kind][e.i] = lk; index.get(lk).i = e.i
    }
    cells[e.kind].length = last; m.count = last; m.instanceMatrix.needsUpdate = true
    index.delete(k); bboxDirty = true
  }

  // ---------- avatares (modelo 3D de avatar.js + cartel con el nombre) ----------
  const tagSprites = []
  function makeAvatar(color, name) {
    const g = buildAvatar(styleFor(name, color))
    const c = document.createElement('canvas'); c.width = 256; c.height = 64
    const ctx = c.getContext('2d'); ctx.font = 'bold 34px system-ui, sans-serif'; ctx.textAlign = 'center'
    ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(name, 128, 44); ctx.fillStyle = '#fff'; ctx.fillText(name, 128, 44)
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }))
    tag.scale.set(2, 0.5, 1); tag.position.y = 2.5; tag.renderOrder = 10; tag.visible = settings.names; g.add(tag); tagSprites.push(tag)
    scene.add(g); return g
  }
  const animateAvatar = poseAvatar

  const me = { pos: new THREE.Vector3(0.5, 3, 0.5), vel: new THREE.Vector3(), ry: 0, grounded: false, anim: 'idle', kind: 1, emote: null }
  const meAvatar = makeAvatar(profile.avatar_color, profile.username)
  const others = new Map() // player_id -> { avatar, target, ry, seen, name, platform, color, anim }

  function upsertOther(row) {
    if (row.player_id === profile.id || row.game_id !== game.id) return
    let o = others.get(row.player_id)
    if (!o) {
      o = { avatar: makeAvatar(row.color, row.username), target: new THREE.Vector3(row.x, row.y, row.z), ry: row.ry, name: row.username, color: row.color, anim: 'idle' }
      o.avatar.position.copy(o.target); others.set(row.player_id, o)
      sys(`${row.username} se unió`)
    }
    o.target.set(row.x, row.y, row.z); o.ry = row.ry; o.seen = Date.now(); o.platform = row.platform; o.anim = row.anim
  }
  function dropOther(id) {
    const o = others.get(id); if (!o) return
    scene.remove(o.avatar); others.delete(id); sys(`${o.name} salió`)
  }

  // ---------- física ----------
  const R = 0.3
  function collides(px, py, pz) {
    for (const dx of [-R, R]) for (const dz of [-R, R]) for (const h of [0.05, 0.9, 1.7])
      if (solid(Math.floor(px + dx), Math.floor(py + h), Math.floor(pz + dz))) return true
    return false
  }
  const cam = { yaw: 0, pitch: 0.42, dist: 8 }
  const keys = {}
  const joy = { x: 0, y: 0 }                      // joystick táctil (-1..1)
  let jumpHeld = false
  let paused = false
  const typing = () => document.activeElement === $('chat-input')
  function step(dt) {
    const active = !paused && !typing()
    let f = active ? (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) : 0
    let s = active ? (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) : 0
    if (active && (joy.x || joy.y)) { s += joy.x; f += -joy.y }
    const mag = Math.min(1, Math.hypot(f, s))
    let mx = -Math.sin(cam.yaw) * f + Math.cos(cam.yaw) * s
    let mz = -Math.cos(cam.yaw) * f - Math.sin(cam.yaw) * s
    const len = Math.hypot(mx, mz)
    if (len > 0.001) { mx /= len; mz /= len; me.ry = Math.atan2(mx, mz) }
    const speed = (active && (keys.ShiftLeft || keys.ShiftRight) ? 9 : 6) * mag
    const p = me.pos
    for (const [ax, d] of [['x', mx * speed * dt], ['z', mz * speed * dt]]) {
      const old = p[ax]; p[ax] += d
      if (collides(p.x, p.y, p.z)) {
        // sube escalones de 1 bloque sin tener que saltar
        if (me.grounded && !collides(p.x, p.y + 1.01, p.z)) p.y += 1.01
        else p[ax] = old
      }
    }
    if (active && (keys.Space || jumpHeld) && me.grounded) { me.vel.y = 8.6; me.grounded = false }
    me.vel.y -= 24 * dt
    const oy = p.y; p.y += me.vel.y * dt
    me.grounded = false
    if (collides(p.x, p.y, p.z)) { p.y = oy; if (me.vel.y < 0) me.grounded = true; me.vel.y = 0 }
    if (p.y < 0) { p.y = 0; me.vel.y = 0; me.grounded = true }
    const moving = len > 0.001 && mag > 0.05
    if (me.emote && (moving || !me.grounded)) me.emote = null          // moverte o saltar corta el emote
    me.anim = !me.grounded ? 'jump' : moving ? 'walk' : (me.emote ?? 'idle')
  }

  // ---------- UI ----------
  const hotbar = $('hotbar'), log = $('chat-log'), roster = $('roster')
  function drawHotbar() {
    hotbar.replaceChildren(...PALETTE.map((c, i) => {
      const s = document.createElement('div'); s.className = 'slot' + (i === me.kind ? ' sel' : ''); s.style.setProperty('--c', c)
      s.innerHTML = `<span>${i + 1}</span>`; s.onclick = () => { me.kind = i; drawHotbar(); ghostMat.color.set(PALETTE[me.kind]) }; return s
    }))
  }
  function addChat(html, cls = '') {
    const li = document.createElement('li'); if (cls) li.className = cls
    if (typeof html === 'string') li.textContent = html; else li.append(...html)
    log.append(li); while (log.children.length > 8) log.firstChild.remove()
    clearTimeout(li._t); li._t = setTimeout(() => li.remove(), 20000)
  }
  const sys = t => addChat(t, 'sys')
  function chatLine(name, text) { const b = document.createElement('b'); b.textContent = name + ': '; addChat([b, document.createTextNode(text)]) }
  function drawRoster() {
    const all = [{ name: profile.username, color: profile.avatar_color, platform: 'web', me: true }, ...[...others.values()]]
    roster.replaceChildren(...all.map(o => {
      const li = document.createElement('li'); const a = document.createElement('span'); a.className = 'avatar'; a.style.setProperty('--c', o.color); a.style.setProperty('--img', `url(${headshot(o.name, o.color)})`)
      const n = document.createElement('span'); n.textContent = o.name + (o.me ? ' (tú)' : ''); li.append(a, n)
      if (o.platform === '3ds') { const t = document.createElement('span'); t.className = 'tag'; t.textContent = '3DS'; li.append(t) }
      return li
    }))
  }
  $('pause-title').textContent = game.name
  const sens = $('set-sens'), dist = $('set-dist'), names = $('set-names')
  sens.value = settings.sensitivity; dist.value = settings.viewDistance; names.checked = settings.names
  const applySettings = () => {
    settings.sensitivity = +sens.value; settings.viewDistance = +dist.value; settings.names = names.checked; saveSettings()
    scene.fog.far = settings.viewDistance; scene.fog.near = settings.viewDistance * 0.35
    tagSprites.forEach(t => (t.visible = settings.names))
  }
  sens.oninput = dist.oninput = names.onchange = applySettings
  function setPaused(v) {
    paused = v; $('pause').classList.toggle('hidden', !v)
    if (v) { drawRoster(); document.activeElement?.blur?.() }
  }
  $('menu-btn').onclick = () => setPaused(!paused)
  $('resume').onclick = () => setPaused(false)
  $('leave').onclick = () => onExit()
  // ---------- emotes: botón / tecla G ----------
  const emotePanel = $('emote-panel')
  emotePanel.replaceChildren(...EMOTES.map(e => { const b = document.createElement('button'); b.className = 'emote'; b.textContent = e.label; b.onclick = () => { if (me.grounded) me.emote = e.id; emotePanel.classList.add('hidden') }; return b }))
  $('emote-btn').onclick = () => emotePanel.classList.toggle('hidden')
  $('players-btn').onclick = () => { drawRoster(); roster.classList.toggle('hidden') }
  $('chat-form').onsubmit = e => {
    e.preventDefault()
    const t = $('chat-input').value.trim(); $('chat-input').value = ''; $('chat-input').blur()
    if (t) api.say(game.id, t).catch(err => sys(err.message))
  }

  // ---------- resaltado del bloque apuntado y vista previa de dónde se pondrá ----------
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.012, 1.012, 1.012)), new THREE.LineBasicMaterial({ color: 0xffffff }))
  outline.visible = false; scene.add(outline)
  const ghostMat = new THREE.MeshBasicMaterial({ color: PALETTE[me.kind], transparent: true, opacity: 0.35, depthWrite: false })
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ghostMat); ghost.visible = false; scene.add(ghost)
  drawHotbar()

  const ray = new THREE.Raycaster(); ray.far = 16
  const ndc = new THREE.Vector2()
  function pick(clientX, clientY) {
    const r = canvas.getBoundingClientRect()
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    if (bboxDirty) { for (const m of meshes) { m.boundingSphere = null; m.boundingBox = null } bboxDirty = false }
    const hit = ray.intersectObjects([...meshes, floor], false)[0]
    if (!hit) return null
    const n = hit.face.normal.clone()
    if (hit.object === floor) {
      const p = hit.point; return { floor: true, place: [Math.floor(p.x), 0, Math.floor(p.z)] }
    }
    const kind = meshes.indexOf(hit.object), cellKey = cells[kind][hit.instanceId]
    if (!cellKey) return null
    const cell = cellKey.split(',').map(Number)
    n.transformDirection(hit.object.matrixWorld)           // la normal viene en espacio local
    return { floor: false, cell, place: [cell[0] + Math.round(n.x), cell[1] + Math.round(n.y), cell[2] + Math.round(n.z)] }
  }
  let hoverPt = null
  function updateHover() {
    if (!hoverPt || paused || IS_TOUCH) { outline.visible = ghost.visible = false; return }
    const h = pick(hoverPt.x, hoverPt.y)
    if (!h) { outline.visible = ghost.visible = false; return }
    outline.visible = !h.floor; if (!h.floor) outline.position.set(h.cell[0] + 0.5, h.cell[1] + 0.5, h.cell[2] + 0.5)
    const [x, y, z] = h.place
    ghost.visible = y >= 0 && !solid(x, y, z) && !overlapsMe(x, y, z)
    if (ghost.visible) ghost.position.set(x + 0.5, y + 0.5, z + 0.5)
  }
  const overlapsMe = (x, y, z) => Math.abs(me.pos.x - (x + 0.5)) < 0.8 && Math.abs(me.pos.z - (z + 0.5)) < 0.8 && me.pos.y < y + 1 && me.pos.y + 1.8 > y

  function interact(e, breakMode) {
    const h = pick(e.clientX, e.clientY); if (!h) return
    if (breakMode) {
      if (h.floor) return
      const [x, y, z] = h.cell
      removeBlock(x, y, z)
      api.breakBlock(game.id, x, y, z).catch(err => sys(err.message))
    } else {
      const [x, y, z] = h.place
      if (y < 0 || solid(x, y, z) || overlapsMe(x, y, z)) return
      setBlock(x, y, z, me.kind)
      api.placeBlock(game.id, x, y, z, me.kind).catch(err => sys(err.message))
    }
  }

  // ---------- entrada: teclado y ratón ----------
  const down = e => {
    if (typing()) { if (e.code === 'Escape') $('chat-input').blur(); return }
    if (e.code === 'Escape') return setPaused(!paused)
    if (paused) return
    if (e.code === 'Slash' || e.code === 'Enter') { e.preventDefault(); $('chat-input').focus(); return }
    if (e.code === 'KeyG') { emotePanel.classList.toggle('hidden'); return }
    if (e.code === 'Tab') { e.preventDefault(); drawRoster(); roster.classList.toggle('hidden'); return }
    if (e.code.startsWith('Digit')) { const n = Number(e.code.slice(5)) - 1; if (n >= 0 && n < PALETTE.length) { me.kind = n; drawHotbar(); ghostMat.color.set(PALETTE[n]) } }
    if (e.code === 'KeyQ' || e.code === 'KeyE') { me.kind = (me.kind + (e.code === 'KeyE' ? 1 : PALETTE.length - 1)) % PALETTE.length; drawHotbar(); ghostMat.color.set(PALETTE[me.kind]) }
    if (e.code === 'Space') e.preventDefault()
    keys[e.code] = true
  }
  const up = e => { keys[e.code] = false }
  let drag = null
  let touchBreak = false                             // táctil: el modo del botón "Poner / Romper"
  const pdown = e => { if (drag) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false }; try { canvas.setPointerCapture(e.pointerId) } catch {} }
  const pmove = e => {
    hoverPt = { x: e.clientX, y: e.clientY }
    if (!drag || drag.id !== e.pointerId || paused) return
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true
    cam.yaw -= dx * 0.005 * settings.sensitivity; cam.pitch = Math.min(1.45, Math.max(-0.25, cam.pitch + dy * 0.005 * settings.sensitivity))
    drag.x = e.clientX; drag.y = e.clientY
  }
  const pup = e => {
    if (!drag || drag.id !== e.pointerId) return
    if (!drag.moved && !paused) interact(e, IS_TOUCH ? touchBreak : e.button === 2)
    drag = null
  }
  const pleave = () => { hoverPt = null }
  const wheel = e => { e.preventDefault(); cam.dist = Math.min(22, Math.max(3, cam.dist + e.deltaY * 0.01)) }
  const noMenu = e => e.preventDefault()
  window.addEventListener('keydown', down); window.addEventListener('keyup', up)
  canvas.addEventListener('pointerdown', pdown); window.addEventListener('pointermove', pmove); window.addEventListener('pointerup', pup); window.addEventListener('pointercancel', pup)
  canvas.addEventListener('pointerleave', pleave)
  canvas.addEventListener('wheel', wheel, { passive: false }); canvas.addEventListener('contextmenu', noMenu)

  // ---------- controles táctiles: joystick, saltar, poner/romper ----------
  let touchUi = null
  if (IS_TOUCH) {
    touchUi = document.createElement('div'); touchUi.id = 'touch-ui'
    touchUi.innerHTML = '<div id="joy"><div id="joy-knob"></div></div><div id="touch-btns"><button id="t-mode" class="t-btn">Poner</button><button id="t-jump" class="t-btn big">Saltar</button></div>'
    $('game').append(touchUi)
    const base = touchUi.querySelector('#joy'), knob = touchUi.querySelector('#joy-knob'); let jid = null
    const setJoy = e => {
      const r = base.getBoundingClientRect(), R2 = r.width / 2
      let dx = e.clientX - (r.left + R2), dy = e.clientY - (r.top + R2); const d = Math.hypot(dx, dy)
      if (d > R2) { dx *= R2 / d; dy *= R2 / d }
      knob.style.transform = `translate(${dx}px, ${dy}px)`; joy.x = dx / R2; joy.y = dy / R2
      if (Math.hypot(joy.x, joy.y) < 0.15) { joy.x = joy.y = 0 }
    }
    const endJoy = () => { jid = null; joy.x = joy.y = 0; knob.style.transform = '' }
    base.addEventListener('pointerdown', e => { jid = e.pointerId; base.setPointerCapture(e.pointerId); setJoy(e); e.stopPropagation() })
    base.addEventListener('pointermove', e => { if (e.pointerId === jid) setJoy(e) })
    base.addEventListener('pointerup', endJoy); base.addEventListener('pointercancel', endJoy)
    const jump = touchUi.querySelector('#t-jump')
    jump.addEventListener('pointerdown', e => { jumpHeld = true; e.stopPropagation() }); jump.addEventListener('pointerup', () => (jumpHeld = false)); jump.addEventListener('pointercancel', () => (jumpHeld = false))
    const mode = touchUi.querySelector('#t-mode')
    mode.addEventListener('click', () => { touchBreak = !touchBreak; mode.textContent = touchBreak ? 'Romper' : 'Poner'; mode.classList.toggle('on', touchBreak) })
  }

  // ---------- red ----------
  let sending = false, lastSent = 0, last = { x: NaN, y: NaN, z: NaN, ry: NaN, anim: '' }
  function send() {
    const now = Date.now()
    const changed = last.x !== me.pos.x || last.y !== me.pos.y || last.z !== me.pos.z || last.ry !== me.ry || last.anim !== me.anim
    if (sending || (!changed && now - lastSent < 1000)) return
    sending = true; lastSent = now
    last = { x: me.pos.x, y: me.pos.y, z: me.pos.z, ry: me.ry, anim: me.anim }
    api.move(game.id, last).catch(() => {}).finally(() => (sending = false))
  }

  const channel = gameDb.channel(`game:${game.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'player_state', filter: `game_id=eq.${game.id}` }, p => {
      if (p.eventType === 'DELETE') dropOther(p.old.player_id); else upsertOther(p.new)
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks', filter: `game_id=eq.${game.id}` }, p => {
      if (p.eventType === 'DELETE') removeBlock(p.old.x, p.old.y, p.old.z); else setBlock(p.new.x, p.new.y, p.new.z, p.new.kind)
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'interactions', filter: `game_id=eq.${game.id}` }, p => {
      if (p.new.kind === 'chat') chatLine(p.new.username, p.new.payload?.text ?? '')
    })
    .subscribe()

  ;(async () => {
    const { data: bl } = await gameDb.from('blocks').select('x,y,z,kind').eq('game_id', game.id).limit(5000)
    for (const b of bl ?? []) setBlock(b.x, b.y, b.z, b.kind)
    const since = new Date(Date.now() - STALE_MS).toISOString()
    const { data: pl } = await gameDb.from('player_state').select('*').eq('game_id', game.id).gt('updated_at', since)
    for (const p of pl ?? []) upsertOther(p)
  })()

  const sendTimer = setInterval(send, SEND_MS)
  const pruneTimer = setInterval(() => { for (const [id, o] of others) if (Date.now() - o.seen > STALE_MS) dropOther(id) }, 2000)
  // Refresco de bloques por si se pierde algún evento Realtime
  const syncTimer = setInterval(async () => {
    const { data } = await gameDb.from('blocks').select('x,y,z,kind').eq('game_id', game.id).limit(5000)
    if (!data) return
    const seen = new Set()
    for (const b of data) { seen.add(key(b.x, b.y, b.z)); const e = index.get(key(b.x, b.y, b.z)); if (!e || e.kind !== ((b.kind % PALETTE.length) + PALETTE.length) % PALETTE.length) setBlock(b.x, b.y, b.z, b.kind) }
    for (const k of [...index.keys()]) if (!seen.has(k)) { const [x, y, z] = k.split(',').map(Number); removeBlock(x, y, z) }
  }, 5000)
  const rosterTimer = setInterval(() => { if (!roster.classList.contains('hidden') || paused) drawRoster() }, 1500)

  // ---------- bucle ----------
  const clock = new THREE.Clock(); let raf, t = 0, fps = 60, frames = 0, fpsAt = performance.now()
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), want = new THREE.Vector3()
  camPos.set(0, 6, 9)
  function frame() {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(clock.getDelta(), 0.05); t += dt
    const w = canvas.clientWidth, h = canvas.clientHeight
    if (w && h && (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio()))) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() }
    step(dt)
    meAvatar.position.copy(me.pos)
    let dy = me.ry - meAvatar.rotation.y; dy = ((dy + Math.PI * 3) % (Math.PI * 2)) - Math.PI
    meAvatar.rotation.y += dy * Math.min(1, dt * 16)
    animateAvatar(meAvatar, me.anim, dt, t)
    for (const o of others.values()) {
      o.avatar.position.lerp(o.target, Math.min(1, dt * 12))
      let d = o.ry - o.avatar.rotation.y; d = ((d + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      o.avatar.rotation.y += d * Math.min(1, dt * 12)
      animateAvatar(o.avatar, o.anim, dt, t)
    }
    // cámara suave detrás del jugador
    const c = me.pos
    want.set(c.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist, c.y + 1.6 + Math.sin(cam.pitch) * cam.dist, c.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist)
    if (want.y < 0.4) want.y = 0.4
    // la cámara no atraviesa bloques: se acerca al jugador hasta el primer bloque que la tape
    { const ox = c.x, oy = c.y + 1.5, oz = c.z, dx = want.x - ox, dy = want.y - oy, dz = want.z - oz, len = Math.hypot(dx, dy, dz)
      for (let d = 0.5; d <= len; d += 0.25) {
        const f = d / len
        if (solid(Math.floor(ox + dx * f), Math.floor(oy + dy * f), Math.floor(oz + dz * f))) { const k = Math.max(0.12, (d - 0.5) / len); want.set(ox + dx * k, oy + dy * k, oz + dz * k); break }
      } }
    camPos.lerp(want, Math.min(1, dt * 14)); camera.position.copy(camPos)
    camLook.lerp(new THREE.Vector3(c.x, c.y + 1.3, c.z), Math.min(1, dt * 18)); camera.lookAt(camLook)
    // la luz y su sombra siguen al jugador
    sun.position.set(c.x + 22, c.y + 40, c.z + 14); sun.target.position.set(c.x, c.y, c.z)
    updateHover()
    renderer.render(scene, camera)
    frames++; const now = performance.now()
    if (now - fpsAt > 700) { fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now
      $('stats').innerHTML = ''; const sp = document.createElement('span'); sp.textContent = `${others.size + 1} jugando · ${fps} fps · (${c.x.toFixed(0)}, ${c.y.toFixed(0)}, ${c.z.toFixed(0)})`; $('stats').append(sp) }
  }
  frame()
  sys(`Bienvenido a ${game.name}`)

  return function stop() {
    cancelAnimationFrame(raf); clearInterval(sendTimer); clearInterval(pruneTimer); clearInterval(syncTimer); clearInterval(rosterTimer)
    window.removeEventListener('keydown', down); window.removeEventListener('keyup', up)
    window.removeEventListener('pointermove', pmove); window.removeEventListener('pointerup', pup); window.removeEventListener('pointercancel', pup)
    canvas.removeEventListener('pointerdown', pdown); canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('contextmenu', noMenu); canvas.removeEventListener('pointerleave', pleave)
    touchUi?.remove(); emotePanel.classList.add('hidden')
    $('pause').classList.add('hidden'); roster.classList.add('hidden'); log.replaceChildren()
    api.leave().catch(() => {}); gameDb.removeChannel(channel)
    scene.traverse(o => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach(m => { m.map?.dispose?.(); m.dispose?.() }) })
    renderer.dispose()
  }
}
