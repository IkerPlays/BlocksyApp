import * as THREE from 'three'
import { gameDb } from './supabase.js'

export const PALETTE = ['#e8e8e8', '#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6']
const SEND_MS = 100        // 10 Hz de posición
const STALE_MS = 15_000    // jugador sin actualizar = desconectado
const key = (x, y, z) => `${x},${y},${z}`

export function startGame({ game, profile, canvas, onStats }) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#87c8ff')
  scene.fog = new THREE.Fog('#87c8ff', 40, 120)
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 300)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  scene.add(new THREE.HemisphereLight('#ffffff', '#6a8a5a', 1.1))
  const sun = new THREE.DirectionalLight('#ffffff', 1.4); sun.position.set(30, 50, 20); scene.add(sun)

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: '#5fae5a' }))
  floor.rotation.x = -Math.PI / 2; scene.add(floor)
  const grid = new THREE.GridHelper(400, 400, '#4a994a', '#4a994a'); grid.position.y = 0.01; scene.add(grid)

  // ---------- Bloques ----------
  const blockGeo = new THREE.BoxGeometry(1, 1, 1)
  const mats = PALETTE.map(c => new THREE.MeshLambertMaterial({ color: c }))
  const blocks = new Map() // "x,y,z" -> mesh
  const solid = (x, y, z) => blocks.has(key(x, y, z))
  function setBlock(x, y, z, kind) {
    removeBlock(x, y, z)
    const m = new THREE.Mesh(blockGeo, mats[kind % mats.length])
    m.position.set(x + 0.5, y + 0.5, z + 0.5); m.userData.cell = [x, y, z]
    scene.add(m); blocks.set(key(x, y, z), m)
  }
  function removeBlock(x, y, z) {
    const m = blocks.get(key(x, y, z))
    if (m) { scene.remove(m); blocks.delete(key(x, y, z)) }
  }

  // ---------- Avatares ----------
  function makeAvatar(color, name) {
    const g = new THREE.Group()
    const mat = new THREE.MeshLambertMaterial({ color })
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), mat); body.position.y = 0.85
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshLambertMaterial({ color: '#ffd9a8' })); head.position.y = 1.55
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.35), new THREE.MeshLambertMaterial({ color: '#34495e' })); legs.position.y = 0.2
    g.add(body, head, legs)
    const c = document.createElement('canvas'); c.width = 256; c.height = 64
    const ctx = c.getContext('2d'); ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'
    ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(name, 128, 44); ctx.fillStyle = '#fff'; ctx.fillText(name, 128, 44)
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }))
    tag.scale.set(2, 0.5, 1); tag.position.y = 2.2; g.add(tag)
    scene.add(g); return g
  }

  const me = { pos: new THREE.Vector3(0.5, 3, 0.5), vel: new THREE.Vector3(), ry: 0, grounded: false, anim: 'idle', kind: 1 }
  const meAvatar = makeAvatar(profile.avatar_color, profile.username)
  const others = new Map() // player_id -> { avatar, target, ry, seen }

  function upsertOther(row) {
    if (row.player_id === profile.id || row.game_id !== game.id) return
    let o = others.get(row.player_id)
    if (!o) {
      o = { avatar: makeAvatar(row.color, row.username), target: new THREE.Vector3(row.x, row.y, row.z), ry: row.ry, seen: 0 }
      o.avatar.position.copy(o.target); others.set(row.player_id, o)
    }
    o.target.set(row.x, row.y, row.z); o.ry = row.ry; o.seen = Date.now()
    o.platform = row.platform
  }
  function dropOther(id) {
    const o = others.get(id); if (o) { scene.remove(o.avatar); others.delete(id) }
  }

  // ---------- Física simple ----------
  const R = 0.3
  function collides(px, py, pz) {
    for (const dx of [-R, R]) for (const dz of [-R, R]) for (const h of [0.05, 0.9, 1.7])
      if (solid(Math.floor(px + dx), Math.floor(py + h), Math.floor(pz + dz))) return true
    return false
  }
  function step(dt) {
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0)
    const yaw = cam.yaw
    let mx = -Math.sin(yaw) * f + Math.cos(yaw) * s
    let mz = -Math.cos(yaw) * f - Math.sin(yaw) * s
    const len = Math.hypot(mx, mz)
    if (len > 0) { mx /= len; mz /= len; me.ry = Math.atan2(mx, mz) }
    const speed = 6
    const p = me.pos
    for (const [ax, d] of [['x', mx * speed * dt], ['z', mz * speed * dt]]) {
      const old = p[ax]; p[ax] += d
      if (collides(p.x, p.y, p.z)) {
        p[ax] = old
        if (me.grounded && !collides(p.x, p.y + 1, p.z)) { /* escalón: solo salto manual */ }
      }
    }
    if (keys.Space && me.grounded) { me.vel.y = 8.5; me.grounded = false }
    me.vel.y -= 24 * dt
    const oy = p.y; p.y += me.vel.y * dt
    me.grounded = false
    if (collides(p.x, p.y, p.z)) { p.y = oy; if (me.vel.y < 0) me.grounded = true; me.vel.y = 0 }
    if (p.y < 0) { p.y = 0; me.vel.y = 0; me.grounded = true }
    if (p.y < -20) p.set(0.5, 3, 0.5)
    me.anim = !me.grounded ? 'jump' : len > 0 ? 'walk' : 'idle'
  }

  // ---------- Cámara / entrada ----------
  const cam = { yaw: 0, pitch: 0.4, dist: 8 }
  const keys = {}
  const down = e => {
    keys[e.code] = true
    if (e.code >= 'Digit1' && e.code <= 'Digit6') me.kind = Number(e.code.slice(5)) - 1
  }
  const up = e => { keys[e.code] = false }
  let drag = null
  const pdown = e => { drag = { x: e.clientX, y: e.clientY, moved: false } }
  const pmove = e => {
    if (!drag) return
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
    cam.yaw -= dx * 0.005; cam.pitch = Math.min(1.4, Math.max(-0.2, cam.pitch + dy * 0.005))
    drag.x = e.clientX; drag.y = e.clientY
  }
  const pup = e => { if (drag && !drag.moved) interact(e) ; drag = null }
  const wheel = e => { cam.dist = Math.min(20, Math.max(3, cam.dist + e.deltaY * 0.01)) }
  window.addEventListener('keydown', down); window.addEventListener('keyup', up)
  canvas.addEventListener('pointerdown', pdown); window.addEventListener('pointermove', pmove); window.addEventListener('pointerup', pup)
  canvas.addEventListener('wheel', wheel); canvas.addEventListener('contextmenu', e => e.preventDefault())

  const ray = new THREE.Raycaster(); ray.far = 12
  function interact(e) {
    const r = canvas.getBoundingClientRect()
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
    const hit = ray.intersectObjects([...blocks.values(), floor], false)[0]
    if (!hit) return
    const n = hit.face.normal.clone()
    if (e.button === 2) {
      if (hit.object === floor) return
      const [x, y, z] = hit.object.userData.cell
      removeBlock(x, y, z)
      gameDb.from('blocks').delete().match({ game_id: game.id, x, y, z }).then(() => {})
      log('break', x, y, z)
    } else {
      const p = hit.point.clone().addScaledVector(n, 0.01)
      const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z)
      if (y < 0 || solid(x, y, z)) return
      // no ahogarse dentro del bloque
      if (Math.abs(me.pos.x - (x + 0.5)) < 0.8 && Math.abs(me.pos.z - (z + 0.5)) < 0.8 && me.pos.y < y + 1 && me.pos.y + 1.8 > y) return
      setBlock(x, y, z, me.kind)
      gameDb.from('blocks').upsert({ game_id: game.id, x, y, z, kind: me.kind, placed_by: profile.id }).then(() => {})
      log('place', x, y, z)
    }
  }
  const log = (kind, x, y, z) =>
    gameDb.from('interactions').insert({ game_id: game.id, player_id: profile.id, kind, x, y, z, payload: { kind: me.kind } }).then(() => {})

  // ---------- Red ----------
  let sendTimer, pruneTimer
  const send = () => gameDb.from('player_state').upsert({
    player_id: profile.id, game_id: game.id, username: profile.username, color: profile.avatar_color,
    x: me.pos.x, y: me.pos.y, z: me.pos.z, ry: me.ry, anim: me.anim, platform: 'web',
  }).then(() => {})

  const channel = gameDb.channel(`game:${game.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'player_state', filter: `game_id=eq.${game.id}` }, p => {
      if (p.eventType === 'DELETE') dropOther(p.old.player_id); else upsertOther(p.new)
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks', filter: `game_id=eq.${game.id}` }, p => {
      if (p.eventType === 'DELETE') removeBlock(p.old.x, p.old.y, p.old.z)
      else if (p.new.placed_by !== profile.id || !solid(p.new.x, p.new.y, p.new.z)) setBlock(p.new.x, p.new.y, p.new.z, p.new.kind)
    })
    .subscribe()

  ;(async () => {
    const { data: bl } = await gameDb.from('blocks').select('x,y,z,kind').eq('game_id', game.id).limit(5000)
    for (const b of bl ?? []) setBlock(b.x, b.y, b.z, b.kind)
    const since = new Date(Date.now() - STALE_MS).toISOString()
    const { data: pl } = await gameDb.from('player_state').select('*').eq('game_id', game.id).gt('updated_at', since)
    for (const p of pl ?? []) upsertOther(p)
  })()

  sendTimer = setInterval(send, SEND_MS)
  pruneTimer = setInterval(() => {
    for (const [id, o] of others) if (Date.now() - o.seen > STALE_MS) dropOther(id)
  }, 2000)
  const bye = () => { gameDb.from('player_state').delete().eq('player_id', profile.id).then(() => {}) }
  window.addEventListener('beforeunload', bye)

  // ---------- Bucle ----------
  const clock = new THREE.Clock(); let raf, t = 0
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight
    if (canvas.width !== w || canvas.height !== h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() }
  }
  function frame() {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(clock.getDelta(), 0.05); t += dt
    resize(); step(dt)
    meAvatar.position.copy(me.pos); meAvatar.rotation.y = me.ry
    meAvatar.position.y += me.anim === 'walk' ? Math.abs(Math.sin(t * 12)) * 0.08 : 0
    for (const o of others.values()) {
      o.avatar.position.lerp(o.target, Math.min(1, dt * 12))
      o.avatar.rotation.y += (((o.ry - o.avatar.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 12)
    }
    const c = me.pos
    camera.position.set(
      c.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
      c.y + 1.5 + Math.sin(cam.pitch) * cam.dist,
      c.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist)
    camera.lookAt(c.x, c.y + 1.2, c.z)
    renderer.render(scene, camera)
    onStats?.(`${game.name} · ${others.size + 1} jugador(es) · bloque ${me.kind + 1}/${PALETTE.length} · (${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)})`)
  }
  frame()

  return function stop() {
    cancelAnimationFrame(raf); clearInterval(sendTimer); clearInterval(pruneTimer)
    window.removeEventListener('keydown', down); window.removeEventListener('keyup', up)
    window.removeEventListener('pointermove', pmove); window.removeEventListener('pointerup', pup)
    window.removeEventListener('beforeunload', bye)
    canvas.removeEventListener('pointerdown', pdown); canvas.removeEventListener('wheel', wheel)
    bye(); gameDb.removeChannel(channel); renderer.dispose()
    // limpiar escena
    scene.traverse(o => { o.geometry?.dispose?.() })
  }
}
