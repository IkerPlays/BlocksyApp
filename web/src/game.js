import * as THREE from 'three'
import { gameDb } from './supabase.js'
import * as api from './api.js'
import { settings, saveSettings } from './settings.js'

export const PALETTE = ['#e8e8e8', '#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6']
const SEND_MS = 100        // 10 Hz de posición
const STALE_MS = 15_000    // jugador sin actualizar = desconectado
const key = (x, y, z) => `${x},${y},${z}`
const $ = id => document.getElementById(id)

export function startGame({ game, profile, canvas, onExit }) {
  // ---------- escena ----------
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#87c8ff')
  scene.fog = new THREE.Fog('#87c8ff', settings.viewDistance * 0.35, settings.viewDistance)
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  scene.add(new THREE.HemisphereLight('#ffffff', '#6a8a5a', 1.1))
  const sun = new THREE.DirectionalLight('#ffffff', 1.4); sun.position.set(30, 50, 20); scene.add(sun)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: '#5fae5a' }))
  floor.rotation.x = -Math.PI / 2; scene.add(floor)
  const grid = new THREE.GridHelper(600, 600, '#4a994a', '#4a994a'); grid.position.y = 0.01; scene.add(grid)

  // ---------- bloques ----------
  const blockGeo = new THREE.BoxGeometry(1, 1, 1)
  const mats = PALETTE.map(c => new THREE.MeshLambertMaterial({ color: c }))
  const blocks = new Map()
  const solid = (x, y, z) => blocks.has(key(x, y, z))
  function setBlock(x, y, z, kind) {
    removeBlock(x, y, z)
    const m = new THREE.Mesh(blockGeo, mats[kind % mats.length])
    m.position.set(x + 0.5, y + 0.5, z + 0.5); m.userData.cell = [x, y, z]
    scene.add(m); blocks.set(key(x, y, z), m)
  }
  function removeBlock(x, y, z) {
    const m = blocks.get(key(x, y, z)); if (m) { scene.remove(m); blocks.delete(key(x, y, z)) }
  }

  // ---------- avatares ----------
  const tagSprites = []
  function makeAvatar(color, name) {
    const g = new THREE.Group()
    const part = (w, h, d, c, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c })); m.position.y = y; g.add(m) }
    part(0.7, 0.9, 0.4, color, 0.85); part(0.5, 0.5, 0.5, '#ffd9a8', 1.55); part(0.6, 0.4, 0.35, '#34495e', 0.2)
    const c = document.createElement('canvas'); c.width = 256; c.height = 64
    const ctx = c.getContext('2d'); ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'
    ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(name, 128, 44); ctx.fillStyle = '#fff'; ctx.fillText(name, 128, 44)
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }))
    tag.scale.set(2, 0.5, 1); tag.position.y = 2.2; tag.visible = settings.names; g.add(tag); tagSprites.push(tag)
    scene.add(g); return g
  }
  const me = { pos: new THREE.Vector3(0.5, 3, 0.5), vel: new THREE.Vector3(), ry: 0, grounded: false, anim: 'idle', kind: 1 }
  const meAvatar = makeAvatar(profile.avatar_color, profile.username)
  const others = new Map() // player_id -> { avatar, target, ry, seen, name, platform, color }

  function upsertOther(row) {
    if (row.player_id === profile.id || row.game_id !== game.id) return
    let o = others.get(row.player_id)
    if (!o) {
      o = { avatar: makeAvatar(row.color, row.username), target: new THREE.Vector3(row.x, row.y, row.z), ry: row.ry, name: row.username, color: row.color }
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
  const cam = { yaw: 0, pitch: 0.4, dist: 8 }
  const keys = {}
  let paused = false
  const typing = () => document.activeElement === $('chat-input')
  function step(dt) {
    const active = !paused && !typing()
    const f = active ? (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) : 0
    const s = active ? (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) : 0
    let mx = -Math.sin(cam.yaw) * f + Math.cos(cam.yaw) * s
    let mz = -Math.cos(cam.yaw) * f - Math.sin(cam.yaw) * s
    const len = Math.hypot(mx, mz)
    if (len > 0) { mx /= len; mz /= len; me.ry = Math.atan2(mx, mz) }
    const p = me.pos
    for (const [ax, d] of [['x', mx * 6 * dt], ['z', mz * 6 * dt]]) {
      const old = p[ax]; p[ax] += d
      if (collides(p.x, p.y, p.z)) p[ax] = old
    }
    if (active && keys.Space && me.grounded) { me.vel.y = 8.5; me.grounded = false }
    me.vel.y -= 24 * dt
    const oy = p.y; p.y += me.vel.y * dt
    me.grounded = false
    if (collides(p.x, p.y, p.z)) { p.y = oy; if (me.vel.y < 0) me.grounded = true; me.vel.y = 0 }
    if (p.y < 0) { p.y = 0; me.vel.y = 0; me.grounded = true }
    me.anim = !me.grounded ? 'jump' : len > 0 ? 'walk' : 'idle'
  }

  // ---------- UI ----------
  const hotbar = $('hotbar'), log = $('chat-log'), roster = $('roster')
  function drawHotbar() {
    hotbar.replaceChildren(...PALETTE.map((c, i) => {
      const s = document.createElement('div'); s.className = 'slot' + (i === me.kind ? ' sel' : ''); s.style.setProperty('--c', c)
      s.innerHTML = `<span>${i + 1}</span>`; s.onclick = () => { me.kind = i; drawHotbar() }; return s
    }))
  }
  drawHotbar()
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
      const li = document.createElement('li'); const a = document.createElement('span'); a.className = 'avatar'; a.style.setProperty('--c', o.color)
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
  $('players-btn').onclick = () => { drawRoster(); roster.classList.toggle('hidden') }
  $('chat-form').onsubmit = e => {
    e.preventDefault()
    const t = $('chat-input').value.trim(); $('chat-input').value = ''; $('chat-input').blur()
    if (t) api.say(game.id, t).catch(err => sys(err.message))
  }

  // ---------- entrada ----------
  const down = e => {
    if (typing()) { if (e.code === 'Escape') $('chat-input').blur(); return }
    if (e.code === 'Escape') return setPaused(!paused)
    if (paused) return
    if (e.code === 'Slash' || e.code === 'Enter') { e.preventDefault(); $('chat-input').focus(); return }
    if (e.code === 'Tab') { e.preventDefault(); drawRoster(); roster.classList.toggle('hidden'); return }
    if (e.code.startsWith('Digit')) { const n = Number(e.code.slice(5)) - 1; if (n >= 0 && n < PALETTE.length) { me.kind = n; drawHotbar() } }
    if (e.code === 'Space') e.preventDefault()
    keys[e.code] = true
  }
  const up = e => { keys[e.code] = false }
  let drag = null
  const pdown = e => { drag = { x: e.clientX, y: e.clientY, moved: false } }
  const pmove = e => {
    if (!drag || paused) return
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true
    cam.yaw -= dx * 0.005 * settings.sensitivity; cam.pitch = Math.min(1.4, Math.max(-0.2, cam.pitch + dy * 0.005 * settings.sensitivity))
    drag.x = e.clientX; drag.y = e.clientY
  }
  const pup = e => { if (drag && !drag.moved && !paused && e.target === canvas) interact(e); drag = null }
  const wheel = e => { cam.dist = Math.min(20, Math.max(3, cam.dist + e.deltaY * 0.01)) }
  const noMenu = e => e.preventDefault()
  window.addEventListener('keydown', down); window.addEventListener('keyup', up)
  canvas.addEventListener('pointerdown', pdown); window.addEventListener('pointermove', pmove); window.addEventListener('pointerup', pup)
  canvas.addEventListener('wheel', wheel); canvas.addEventListener('contextmenu', noMenu)

  const ray = new THREE.Raycaster(); ray.far = 14
  function interact(e) {
    const r = canvas.getBoundingClientRect()
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
    const hit = ray.intersectObjects([...blocks.values(), floor], false)[0]
    if (!hit) return
    if (e.button === 2) {
      if (hit.object === floor) return
      const [x, y, z] = hit.object.userData.cell
      removeBlock(x, y, z)
      api.breakBlock(game.id, x, y, z).catch(err => sys(err.message))
    } else {
      const p = hit.point.clone().addScaledVector(hit.face.normal, 0.01)
      const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z)
      if (y < 0 || solid(x, y, z)) return
      if (Math.abs(me.pos.x - (x + 0.5)) < 0.8 && Math.abs(me.pos.z - (z + 0.5)) < 0.8 && me.pos.y < y + 1 && me.pos.y + 1.8 > y) return
      setBlock(x, y, z, me.kind)
      api.placeBlock(game.id, x, y, z, me.kind).catch(err => sys(err.message))
    }
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
    for (const b of data) { seen.add(key(b.x, b.y, b.z)); const m = blocks.get(key(b.x, b.y, b.z)); if (!m || m.material !== mats[b.kind % mats.length]) setBlock(b.x, b.y, b.z, b.kind) }
    for (const k of [...blocks.keys()]) if (!seen.has(k)) { const [x, y, z] = k.split(',').map(Number); removeBlock(x, y, z) }
  }, 5000)
  const rosterTimer = setInterval(() => { if (!roster.classList.contains('hidden') || paused) drawRoster() }, 1500)

  // ---------- bucle ----------
  const clock = new THREE.Clock(); let raf, t = 0
  function frame() {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(clock.getDelta(), 0.05); t += dt
    const w = canvas.clientWidth, h = canvas.clientHeight
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() }
    step(dt)
    meAvatar.position.copy(me.pos); meAvatar.rotation.y = me.ry
    if (me.anim === 'walk') meAvatar.position.y += Math.abs(Math.sin(t * 12)) * 0.08
    for (const o of others.values()) {
      o.avatar.position.lerp(o.target, Math.min(1, dt * 12))
      o.avatar.rotation.y += (((o.ry - o.avatar.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 12)
      if (o.anim === 'walk') o.avatar.position.y += Math.abs(Math.sin(t * 12)) * 0.08
    }
    const c = me.pos
    camera.position.set(c.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist, c.y + 1.5 + Math.sin(cam.pitch) * cam.dist, c.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist)
    camera.lookAt(c.x, c.y + 1.2, c.z)
    renderer.render(scene, camera)
    $('stats').innerHTML = ''
    const sp = document.createElement('span'); sp.textContent = `${others.size + 1} jugando · (${c.x.toFixed(0)}, ${c.y.toFixed(0)}, ${c.z.toFixed(0)})`; $('stats').append(sp)
  }
  frame()
  sys(`Bienvenido a ${game.name}`)

  return function stop() {
    cancelAnimationFrame(raf); clearInterval(sendTimer); clearInterval(pruneTimer); clearInterval(syncTimer); clearInterval(rosterTimer)
    window.removeEventListener('keydown', down); window.removeEventListener('keyup', up)
    window.removeEventListener('pointermove', pmove); window.removeEventListener('pointerup', pup)
    canvas.removeEventListener('pointerdown', pdown); canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('contextmenu', noMenu)
    $('pause').classList.add('hidden'); roster.classList.add('hidden'); log.replaceChildren()
    api.leave().catch(() => {}); gameDb.removeChannel(channel)
    scene.traverse(o => o.geometry?.dispose?.()); renderer.dispose()
  }
}
