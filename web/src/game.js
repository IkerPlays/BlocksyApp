import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { gameDb } from './supabase.js'
import * as api from './api.js'
import { settings, saveSettings, onSettings, bump, visited, bestTime } from './settings.js'
import { buildAvatar, poseAvatar, styleFor, EMOTES, headshot, packLoadout, parseLoadout, loadoutStyle, buildPet, trailColor } from './avatar.js'
import { t, onLang } from './i18n.js'
import { createSky } from './sky.js'
import { buildWorld } from './world.js'
import { loadDataStore, saveDataStore, createRunner } from './script.js'
import { sfx } from './sfx.js'
import * as music from './music.js'
import { icon } from './icons.js'
import * as social from './social.js'
import { createVoice } from './voice.js'
import { createHorror } from './horror.js'
import { createScripted } from './scene-parts.js'
import { createStudio } from './studio-tools.js'
import { createWeather } from './weather.js'
import { loadingScreen, createShortcuts, togglePhoto, REACT_PREFIX, REACTIONS, isReaction, layoutWheel } from './extras.js'

// 12 colores: la 3DS usa los mismos (3ds/source/main.c)
export const PALETTE = ['#e8e8e8', '#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6', '#f1c40f', '#1abc9c', '#ff6b9d', '#8b5e34', '#4b4f57', '#7ed6ff']
const STALE_MS = 15_000    // jugador sin actualizar = desconectado
const CAP = 6000           // bloques máximos por color
const key = (x, y, z) => `${x},${y},${z}`
const $ = id => document.getElementById(id)
const IS_TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

// ---------- texturas generadas (sin imágenes externas) ----------
function canvasTex(size, draw, { repeat = null, nearest = true } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size
  draw(c.getContext('2d'), size)
  const tx = new THREE.CanvasTexture(c)
  tx.colorSpace = THREE.SRGBColorSpace
  if (nearest) tx.magFilter = THREE.NearestFilter
  if (repeat) { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(repeat, repeat); tx.anisotropy = 8 }
  return tx
}
const blockTexture = () => canvasTex(64, (g, s) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, s, s)
  for (let i = 0; i < 260; i++) { const v = 222 + (Math.random() * 33 | 0); g.fillStyle = `rgb(${v},${v},${v})`; const w = 2 + (Math.random() * 3 | 0); g.fillRect(Math.random() * s | 0, Math.random() * s | 0, w, w) }
  const edge = g.createLinearGradient(0, 0, 0, s); edge.addColorStop(0, 'rgba(255,255,255,.28)'); edge.addColorStop(.12, 'rgba(255,255,255,0)'); edge.addColorStop(.85, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,.2)')
  g.fillStyle = edge; g.fillRect(0, 0, s, s)
  g.strokeStyle = 'rgba(0,0,0,.34)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, s - 3, s - 3)
  g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2; g.strokeRect(4, 4, s - 8, s - 8)
})
const groundTexture = repeat => canvasTex(128, (g, s) => {
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#58a553' : '#62b05c'; g.fillRect(x * s / 4, y * s / 4, s / 4, s / 4) }
  for (let i = 0; i < 520; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,40,0'},.07)`; g.fillRect(Math.random() * s | 0, Math.random() * s | 0, 2, 3) }
}, { repeat })

export function startGame({ game, profile, canvas, onExit, onInvite, studio }) {
  const ST = !!studio                              // modo Studio (editor del dueño): vuelo libre, herramientas y texto de interfaz
  let testing = false
  const editing = () => ST && !testing
  const cfg = { allow_chat: true, allow_emotes: true, gravity: 24, speed: 6, jump: 8.6, ...(game.config ?? {}) }
  const mode = game.mode ?? 'build'
  const isOwner = game.owner_id === profile.id
  const canBuild = ST || isOwner || (cfg.allow_build ?? mode === 'build')
  const canFly = mode === 'build' || cfg.allow_fly === true
  const phys = { gravity: Number(cfg.gravity) || 24, speed: Number(cfg.speed) || 6, jump: Number(cfg.jump) || 8.6 }
  visited(game.id)

  // ---------- escena ----------
  const scene = new THREE.Scene()
  const fogMul = () => Math.min(2, Math.max(0.25, Number(cfg.fog) || 1))
  scene.fog = new THREE.Fog('#c4e2ff', settings.viewDistance * 0.35 * fogMul(), settings.viewDistance * fogMul())
  const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.1, 500)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const sky = createSky(scene, renderer)
  const sun = sky.sun
  sun.castShadow = true; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 170 })
  if (cfg.sky === 'space') sky.setPreset('space')
  else if (cfg.time != null && Number(cfg.time) !== 12 && cfg.sky == null) sky.setHour(Number(cfg.time))
  else if (cfg.sky && cfg.sky !== 'day') sky.setPreset(cfg.sky)
  else if (cfg.time === 0) sky.setHour(0)

  // ---------- mundo base (bloques fijos) ----------
  const world = buildWorld(cfg.world ?? 'flat', cfg.seed ?? 1337)
  if (Array.isArray(cfg.spawn) && cfg.spawn.length === 3) world.spawn = cfg.spawn.map(Number)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshLambertMaterial({ map: groundTexture(450) }))
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.visible = world.floor; if (world.groundTint) floor.material.color.set(world.groundTint); scene.add(floor)

  const geo = new THREE.BoxGeometry(1, 1, 1)
  const tex = blockTexture(); tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  // bloques fijos del mundo: una sola malla con color por instancia
  const statics = new Map()
  const staticMesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: '#ffffff', map: tex }), Math.max(1, world.cells.length))
  { const col = new THREE.Color(), m = new THREE.Matrix4(); let i = 0
    for (const [x, y, z, c] of world.cells) { if (statics.has(key(x, y, z))) continue; m.makeTranslation(x + 0.5, y + 0.5, z + 0.5); staticMesh.setMatrixAt(i, m); staticMesh.setColorAt(i, col.set(c)); statics.set(key(x, y, z), c); i++ }
    staticMesh.count = i; staticMesh.castShadow = staticMesh.receiveShadow = true; staticMesh.frustumCulled = false; scene.add(staticMesh) }

  // ---------- bloques de los jugadores (un InstancedMesh por color) ----------
  const meshes = PALETTE.map(c => {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: c, map: tex }), CAP)
    m.count = 0; m.castShadow = m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m
  })
  const cells = PALETTE.map(() => [])
  const index = new Map()
  const tmp = new THREE.Matrix4(), tmpC = new THREE.Color()
  const jit = (x, y, z) => { const h = Math.imul(x * 73856093 ^ y * 19349663 ^ z * 83492791, 2654435761) >>> 0; const v = 0.9 + (h % 1000) / 1000 * 0.1; return tmpC.setRGB(v, v, v) }
  const solid = (x, y, z) => index.has(key(x, y, z)) || statics.has(key(x, y, z))
  function setBlock(x, y, z, kind) {
    kind = ((kind % PALETTE.length) + PALETTE.length) % PALETTE.length
    const k = key(x, y, z), old = index.get(k)
    if (old) { if (old.kind === kind) return; removeBlock(x, y, z) }
    if (statics.has(k)) return
    const m = meshes[kind]; if (m.count >= CAP) return
    const i = m.count++
    tmp.makeTranslation(x + 0.5, y + 0.5, z + 0.5); m.setMatrixAt(i, tmp); m.setColorAt(i, jit(x, y, z)); m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true
    cells[kind][i] = k; index.set(k, { kind, i })
  }
  function removeBlock(x, y, z) {
    const k = key(x, y, z), e = index.get(k); if (!e) return
    const m = meshes[e.kind], last = m.count - 1
    if (e.i !== last) {
      m.getMatrixAt(last, tmp); m.setMatrixAt(e.i, tmp); m.getColorAt(last, tmpC); m.setColorAt(e.i, tmpC); if (m.instanceColor) m.instanceColor.needsUpdate = true
      const lk = cells[e.kind][last]; cells[e.kind][e.i] = lk; index.get(lk).i = e.i
    }
    cells[e.kind].length = last; m.count = last; m.instanceMatrix.needsUpdate = true
    index.delete(k)
  }

  // ---------- partículas (restos al romper) ----------
  const DEB = 160, debris = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), new THREE.MeshLambertMaterial({ color: '#ffffff' }), DEB)
  debris.frustumCulled = false; debris.count = 0; scene.add(debris)
  const parts = []
  function burst(x, y, z, color, n = 9) {
    if (settings.reduceMotion) return
    for (let i = 0; i < n && parts.length < DEB; i++) parts.push({ p: new THREE.Vector3(x + 0.5 + (Math.random() - .5) * .6, y + 0.5 + (Math.random() - .5) * .6, z + 0.5 + (Math.random() - .5) * .6), v: new THREE.Vector3((Math.random() - .5) * 4, 2 + Math.random() * 3, (Math.random() - .5) * 4), life: 0.7 + Math.random() * 0.4, c: new THREE.Color(color) })
  }
  const dm = new THREE.Matrix4(), dq = new THREE.Quaternion(), ds = new THREE.Vector3()
  function stepParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) { const o = parts[i]; o.life -= dt; if (o.life <= 0) { parts.splice(i, 1); continue } o.v.y -= 16 * dt; o.p.addScaledVector(o.v, dt); if (o.p.y < 0.1 && world.floor) { o.p.y = 0.1; o.v.multiplyScalar(0.4) } }
    parts.forEach((o, i) => { const s = Math.min(1, o.life * 2.5); dm.compose(o.p, dq, ds.set(s, s, s)); debris.setMatrixAt(i, dm); debris.setColorAt(i, o.c) })
    debris.count = parts.length; debris.instanceMatrix.needsUpdate = true; if (debris.instanceColor) debris.instanceColor.needsUpdate = true
  }

  // ---------- avatares (modelo 3D + cartel con el nombre + burbuja de chat) ----------
  const tagSprites = [], teamColors = new Map(), scriptCmds = new Set()
  const setTeam = (name, color) => { color ? teamColors.set(name, color) : teamColors.delete(name); const av = name === profile.username ? meAvatar : [...others.values()].find(o => o.name === name)?.avatar; av?.userData.tag?.userData.redraw(color || '#fff') }
  function makeAvatar(color, name, hat = '') {
    const g = buildAvatar(loadoutStyle(styleFor(name, color), parseLoadout(hat)))
    const c = document.createElement('canvas'); c.width = 256; c.height = 64
    const ctx = c.getContext('2d'); ctx.font = 'bold 34px system-ui, sans-serif'; ctx.textAlign = 'center'
    ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(name, 128, 44); ctx.fillStyle = '#fff'; ctx.fillText(name, 128, 44)
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }))
    tag.userData.redraw = col => { ctx.clearRect(0, 0, 256, 64); ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(name, 128, 44); ctx.fillStyle = col || '#fff'; ctx.fillText(name, 128, 44); tag.material.map.needsUpdate = true }; g.userData.tag = tag; if (teamColors.has(name)) tag.userData.redraw(teamColors.get(name))
    tag.scale.set(2, 0.5, 1); tag.position.y = 2.5; tag.renderOrder = 10; tag.visible = settings.names; g.add(tag); tagSprites.push(tag)
    scene.add(g); return g
  }
  function bubble(avatar, text) {
    if (!settings.bubbles || !avatar) return
    if (avatar.userData.bubble) { avatar.remove(avatar.userData.bubble); avatar.userData.bubble.material.map.dispose(); avatar.userData.bubble.material.dispose() }
    const c = document.createElement('canvas'), g = c.getContext('2d'); const font = 'bold 30px system-ui, sans-serif'; g.font = font
    const words = text.split(' '), lines = []; let line = ''
    for (const w of words) { const tr = line ? line + ' ' + w : w; if (g.measureText(tr).width > 380 && line) { lines.push(line); line = w } else line = tr }
    lines.push(line); const L = lines.slice(0, 3)
    c.width = 420; c.height = 24 + L.length * 38 + 16; g.font = font; g.textAlign = 'center'
    g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.roundRect(4, 4, c.width - 8, c.height - 22, 16); g.fill()
    g.beginPath(); g.moveTo(c.width / 2 - 12, c.height - 18); g.lineTo(c.width / 2, c.height - 2); g.lineTo(c.width / 2 + 12, c.height - 18); g.fill()
    g.fillStyle = '#15171a'; L.forEach((l, i) => g.fillText(l, c.width / 2, 40 + i * 38))
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }))
    const h = c.height / 140; sp.scale.set(420 / 140, h, 1); sp.position.y = 2.95 + h / 2; sp.renderOrder = 11
    avatar.add(sp); avatar.userData.bubble = sp; clearTimeout(avatar.userData.bt)
    avatar.userData.bt = setTimeout(() => { if (avatar.userData.bubble === sp) { avatar.remove(sp); sp.material.map.dispose(); sp.material.dispose(); avatar.userData.bubble = null } }, 5000)
  }
  const animateAvatar = poseAvatar

  const me = { pos: new THREE.Vector3(...world.spawn), vel: new THREE.Vector3(), ry: 0, grounded: false, anim: 'idle', kind: 1, emote: null, fly: false }
  social.myBlocked()
  const myHat = () => packLoadout(social.getWallet()?.equipped, social.getLook())      // sombrero|gafas|espalda|estela|mascota
  let meAvatar = makeAvatar(profile.avatar_color, profile.username, myHat()), meLoadout = myHat()
  // mascotas (siguen a su dueño) y estelas (chispas al caminar)
  const pets = new Map(), trailAcc = new Map()
  function syncPet(key, avatar, lo) {
    const want = parseLoadout(lo).pet, p = pets.get(key)
    if (p && p.id === want) { p.owner = avatar; return }
    if (p) { scene.remove(p.mesh); pets.delete(key) }
    if (!want) return
    const mesh = buildPet(want); mesh.position.copy(avatar.position); scene.add(mesh); pets.set(key, { id: want, mesh, owner: avatar })
  }
  syncPet('me', meAvatar, meLoadout)
  social.loadWallet().catch(() => {}); social.loadLook(profile.username).catch(() => {})                                // la cartera trae lo que llevas puesto
  const loadoutTimer = setInterval(() => {                           // si cambias de accesorios (o termina de cargar la cartera), tu avatar se rehace
    const now = myHat(); if (now === meLoadout) return; meLoadout = now
    const pos = meAvatar.position.clone(), rot = meAvatar.rotation.y; scene.remove(meAvatar)
    meAvatar = makeAvatar(profile.avatar_color, profile.username, now); meAvatar.position.copy(pos); meAvatar.rotation.y = rot; syncPet('me', meAvatar, now)
  }, 1500)
  const others = new Map()          // player_id -> { avatar, target, ry, seen, name, platform, color, anim }

  function upsertOther(row) {
    if (row.player_id === profile.id || row.game_id !== game.id) return
    let o = others.get(row.player_id)
    if (!o) {
      o = { hat: row.hat || '', avatar: makeAvatar(row.color, row.username, row.hat || ''), target: new THREE.Vector3(row.x, row.y, row.z), ry: row.ry, name: row.username, color: row.color, anim: 'idle', id: row.player_id }
      o.avatar.position.copy(o.target); others.set(row.player_id, o); syncPet(row.player_id, o.avatar, row.hat || '')
      sys(t('joined', { name: row.username })); sfx.join()
      runner.fire('playerjoin', { data: { name: row.username }, who: row.username })
    }
    if ((row.hat || '') !== o.hat) { const pos = o.avatar.position.clone(), rot = o.avatar.rotation.y; scene.remove(o.avatar); o.hat = row.hat || ''; o.avatar = makeAvatar(row.color, row.username, o.hat); o.avatar.position.copy(pos); o.avatar.rotation.y = rot; syncPet(row.player_id, o.avatar, o.hat) }       // cambió de accesorios
    o.target.set(row.x, row.y, row.z); o.ry = row.ry; o.seen = Date.now(); o.platform = row.platform; o.anim = row.anim || 'idle'
  }
  function dropOther(id) {
    const o = others.get(id); if (!o) return
    scene.remove(o.avatar); const pet = pets.get(id); if (pet) { scene.remove(pet.mesh); pets.delete(id) } others.delete(id); sys(t('left', { name: o.name })); runner.fire('playerleave', { data: { name: o.name } })
  }

  // ---------- física ----------
  const R = 0.3
  function collides(px, py, pz) {
    if (editing()) return false                      // Studio: atraviesas los bloques
    for (const dx of [-R, R]) for (const dz of [-R, R]) for (const h of [0.05, 0.9, 1.7])
      if (solid(Math.floor(px + dx), Math.floor(py + h), Math.floor(pz + dz))) return true
    return rbx.collides(px, py, pz, R)
  }
  const cam = { yaw: 0, pitch: 0.42, dist: 8 }
  const keys = {}
  const joy = { x: 0, y: 0 }
  let jumpHeld = false, downHeld = false
  let paused = false
  const typing = () => document.activeElement === $('chat-input')
  const respawn = { pos: world.spawn.slice() }
  function teleport(x, y, z) { me.pos.set(x, y, z); me.vel.set(0, 0, 0); camPos.set(x, y + 6, z + 9) }
  let race = { start: 0, cp: 0, done: false }
  const raceTime = ms => { const s = ms / 1000; return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}` }

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
    const sprint = active && (keys.ShiftLeft || keys.ShiftRight) && !me.fly
    const p = me.pos
    const swimming = !me.fly && rbx.inWater(p.x, p.y, p.z), climbing = !me.fly && !swimming && rbx.climbable(p.x, p.y, p.z)
    const crouching = active && keys.KeyC && !me.fly && me.grounded && cfg.allow_crouch !== false
    if (swimming && !wasSwimming) sfx.land(); wasSwimming = swimming
    const speed = (me.fly ? phys.speed * 1.7 : crouching ? phys.speed * 0.45 : swimming ? phys.speed * 0.6 : sprint ? phys.speed * 1.5 : phys.speed) * mag
    for (const [ax, d] of [['x', mx * speed * dt], ['z', mz * speed * dt]]) {
      const old = p[ax]; p[ax] += d
      if (collides(p.x, p.y, p.z)) {
        if (me.grounded && !me.fly && !collides(p.x, p.y + 1.01, p.z)) p.y += 1.01
        else p[ax] = old
      }
    }
    const wasGrounded = me.grounded
    if (me.fly) {
      me.vel.y = ((active && (keys.Space || jumpHeld)) ? 8 : 0) - ((active && (keys.ShiftLeft || keys.ShiftRight || keys.KeyC || downHeld)) ? 8 : 0)
    } else {
      const jumpKey = active && (keys.Space || jumpHeld), jumpEdge = jumpKey && !spaceWas; spaceWas = jumpKey
      if (swimming) { me.vel.y += ((jumpKey ? 4.5 : -1.5) - me.vel.y) * Math.min(1, dt * 4); jumpsLeft = 1 }                // nadar: flotas, Espacio sube
      else if (climbing) { const up = active && (keys.KeyW || keys.ArrowUp || keys.Space || jumpHeld), down = active && (keys.KeyS || keys.ArrowDown); me.vel.y = up ? 4.5 : down ? -4.5 : 0 }       // escalar
      else {
        if (jumpKey && me.grounded) { me.vel.y = phys.jump; me.grounded = false; sfx.jump(); jumpsLeft = 1 }
        else if (jumpEdge && cfg.double_jump && !me.grounded && jumpsLeft > 0) { jumpsLeft--; me.vel.y = phys.jump * 0.9; sfx.jump(); burst(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z), '#ffffff', 6) }
        me.vel.y -= phys.gravity * dt
      }
    }
    const oy = p.y; p.y += me.vel.y * dt
    me.grounded = false
    if (collides(p.x, p.y, p.z)) { p.y = oy; if (me.vel.y < 0) me.grounded = true; me.vel.y = 0 }
    if (world.floor && p.y < 0) { p.y = 0; me.vel.y = 0; me.grounded = true }
    if (editing()) me.fly = true
    else if (me.fly && me.grounded && !(keys.Space || jumpHeld)) { me.fly = false; sys(t('fly_off')) }
    if (me.grounded) jumpsLeft = 1
    if (!wasGrounded && me.grounded && !me.fly) sfx.land()
    if (me.grounded && !me.fly && mag > 0.1 && (stepAt -= dt) <= 0) { stepAt = sprint ? 0.26 : 0.38; sfx.step() }
    if (world.voidY != null && p.y < world.voidY) { sfx.fall(); showTitle(t('fell'), 1200); teleport(...respawn.pos); if (race.start && !race.done) race.start = race.cp === 0 ? 0 : race.start }
    const moving = len > 0.001 && mag > 0.05
    if (me.emote && (moving || !me.grounded)) me.emote = null
    me.anim = crouching ? 'crouch' : swimming ? 'walk' : climbing ? 'jump' : (!me.grounded && !me.fly) ? 'jump' : moving ? 'walk' : (me.fly ? 'idle' : (me.emote ?? 'idle'))
    if (me.fly && moving) me.anim = 'walk'
    // carrera: puntos de control y meta
    if (world.checkpoints?.length || world.finish) {
      if (!race.start && moving) race.start = Date.now()
      for (const cp of world.checkpoints ?? []) if (cp.id > race.cp && Math.hypot(p.x - cp.pos[0], p.z - cp.pos[2]) < 2.2 && Math.abs(p.y - cp.pos[1]) < 2.5) {
        race.cp = cp.id; respawn.pos = cp.pos.slice(); sfx.checkpoint(); showTitle(`${t('checkpoint')} ${cp.id}`, 1400)
      }
      const fin = world.finish
      if (fin && !race.done && Math.hypot(p.x - fin.pos[0], p.z - fin.pos[2]) < fin.radius && Math.abs(p.y - fin.pos[1]) < 3) {
        race.done = true; const ms = Date.now() - (race.start || Date.now()); const prev = bestTime(game.id, null); const best = bestTime(game.id, ms)
        social.missionAdd('obby_win'); social.earnCoins(20, 'obby').then(n => { if (n) sys(t('coins_earned', { n })) }); sfx.win(); showTitle(`${t('finish', { t: raceTime(ms) })}${prev && best !== ms ? ` · ${t('best')} ${raceTime(prev)}` : ''}`, 4500)
        if (ms >= 1500) api.submitTime(game.id, ms).then(r => { if (!r?.top.length) return; sys(t('top_times') + ': ' + r.top.map((x, i) => `${i + 1}. ${x.username} ${raceTime(x.ms)}`).join('  ·  ')); if (r.rank) sys(t('your_rank', { n: r.rank })) })
        setTimeout(() => { teleport(...world.spawn); respawn.pos = world.spawn.slice(); race = { start: 0, cp: 0, done: false } }, 4500)
      }
    }
  }

  // ---------- UI ----------
  const hotbar = $('hotbar'), log = $('chat-log'), roster = $('roster')
  function drawHotbar() {
    hotbar.replaceChildren(...PALETTE.map((c, i) => {
      const s = document.createElement('div'); s.className = 'slot' + (i === me.kind ? ' sel' : ''); s.style.setProperty('--c', c)
      s.innerHTML = `<span>${i < 9 ? i + 1 : i === 9 ? 0 : ''}</span>`; s.onclick = () => { selectKind(i) }; return s
    }))
    hotbar.classList.toggle('hidden', !canBuild)
  }
  function selectKind(i) { me.kind = i; drawHotbar(); ghostMat.color.set(PALETTE[me.kind]) }
  function addChat(html, cls = '') {
    const li = document.createElement('li'); if (cls) li.className = cls
    if (typeof html === 'string') li.textContent = html; else li.append(...html)
    log.append(li); while (log.children.length > 8) log.firstChild.remove()
    clearTimeout(li._t); li._t = setTimeout(() => li.remove(), 20000)
  }
  const sys = tx => addChat(tx, 'sys')
  function chatLine(name, text, playerId) {
    const b = document.createElement('b'); b.textContent = name + ': '; addChat([b, document.createTextNode(text)])
    const av = playerId === profile.id || name === profile.username ? meAvatar : others.get(playerId)?.avatar ?? [...others.values()].find(o => o.name === name)?.avatar
    bubble(av, text); if (name !== profile.username) sfx.chat()
    runner.fire('chat', { data: { name, text }, who: name })
  }
  function showTitle(text, ms = 3000) {
    const e = $('big-title'); e.textContent = text; e.classList.remove('hidden'); e.classList.remove('show'); void e.offsetWidth; e.classList.add('show')
    clearTimeout(showTitle.t); showTitle.t = setTimeout(() => e.classList.add('hidden'), ms)
  }
  function drawRoster() {
    const all = [{ name: profile.username, color: profile.avatar_color, platform: 'web', me: true }, ...[...others.values()]]
    roster.replaceChildren(...all.map(o => {
      const li = document.createElement('li'); const a = document.createElement('span'); a.className = 'avatar'; a.style.setProperty('--c', o.color); a.style.setProperty('--img', `url(${headshot(o.name, o.color)})`)
      const n = document.createElement('span'); n.textContent = o.name + (o.me ? ' ' + t('you') : ''); n.style.flex = '1'; li.append(a, n)
      const vm = o.me ? (voiceSt.active ? { speaking: voiceSt.selfSpeaking && !voiceSt.muted, muted: voiceSt.muted } : null) : voiceSt.members.find(m => m.id === o.id)
      if (vm) { const mic = document.createElement('span'); mic.className = 'vmic' + (vm.speaking ? ' on' : ''); mic.innerHTML = icon(vm.muted ? 'micoff' : 'mic', 14); li.append(mic) }
      if (o.platform === '3ds') { const tg = document.createElement('span'); tg.className = 'tag'; tg.textContent = '3DS'; li.append(tg) }
      if (!o.me) { li.classList.add('tp'); li.onclick = () => { teleport(o.target.x + 1.2, o.target.y + 0.2, o.target.z); roster.classList.add('hidden') } }
      return li
    }))
  }
  // ----- menú de pausa / ajustes en vivo -----
  const bindings = [
    ['set-sens', 'sensitivity', Number], ['set-dist', 'viewDistance', Number], ['set-fov', 'fov', Number], ['set-quality', 'quality', String],
    ['set-music-vol', 'musicVol', Number],
  ]
  const checks = [['set-names', 'names'], ['set-music', 'music'], ['set-bubbles', 'bubbles'], ['set-minimap', 'minimap'], ['set-clouds', 'clouds'], ['set-shadows', 'shadows']]
  for (const [id, k] of bindings) { const e = $(id); e.value = settings[k]; e.oninput = e.onchange = () => { settings[k] = e.value === '' ? settings[k] : (typeof settings[k] === 'number' ? Number(e.value) : e.value); saveSettings() } }
  for (const [id, k] of checks) { const e = $(id); e.checked = settings[k]; e.onchange = () => { settings[k] = e.checked; saveSettings(); if (k === 'music') (e.checked ? music.start() : music.stop()) } }

  let composer = null, bloomPass = null, lastShadowSize = 0, lastShadows = null
  const MAXPR = { low: 1, med: 1.25, high: 1.5, ultra: 2 }
  let resScale = 1
  function size() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return
    const q = settings.quality, dpr = devicePixelRatio || 1
    const pr = Math.max(0.5, Math.min(dpr, MAXPR[q] ?? 1.5) * (settings.dynRes ? resScale : 1))
    renderer.setPixelRatio(pr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix()
    composer?.setPixelRatio(pr); composer?.setSize(w, h)
  }
  function applyAll() {
    const q = settings.quality
    scene.fog.far = settings.viewDistance * fogMul(); scene.fog.near = settings.viewDistance * 0.35 * fogMul()
    camera.fov = settings.fov; camera.updateProjectionMatrix()
    tagSprites.forEach(tg => (tg.visible = settings.names))
    const shadowsOn = settings.shadows && q !== 'low'
    renderer.shadowMap.enabled = shadowsOn; sun.castShadow = shadowsOn
    staticMesh.castShadow = q === 'high' || q === 'ultra'          // miles de bloques fijos en el mapa de sombras pesan mucho en tablets
    const ss = q === 'ultra' ? 3072 : q === 'high' ? 2048 : 1024
    if (ss !== lastShadowSize) { lastShadowSize = ss; sun.shadow.mapSize.set(ss, ss); sun.shadow.map?.dispose(); sun.shadow.map = null }
    if (shadowsOn !== lastShadows) { lastShadows = shadowsOn; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => (m.needsUpdate = true)) }) }
    sky.state.clouds = settings.clouds && q !== 'low'
    const wantBloom = settings.bloom && q !== 'low'
    if (wantBloom && !composer) {
      composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: IS_TOUCH ? 0 : 2 }))
      composer.addPass(new RenderPass(scene, camera))
      bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.28, 0.6, 0.9); composer.addPass(bloomPass); composer.addPass(new OutputPass())
    } else if (!wantBloom && composer) { composer.dispose(); composer = null }
    $('minimap').classList.toggle('hidden', !settings.minimap)
    $('stats').classList.toggle('hidden', !settings.showFps)
    $('game').classList.toggle('lefty', !!settings.leftHanded)
    $('game').style.setProperty('--tscale', settings.touchSize)
    size()
    $('music-btn')?.classList.toggle('on', music.state().playing)
  }
  const offSettings = onSettings(applyAll)
  const offLang = onLang(() => { paintStatic(); drawHotbar() })
  function paintStatic() {
    $('pause-title').textContent = game.name
    $('chat-input').placeholder = t('chat_hint')
    const m = $('t-mode'); if (m) m.textContent = touchBreak ? t('break') : t('place')
    const j = $('t-jump'); if (j) j.textContent = t('jump')
  }
  function setPaused(v) {
    paused = v; $('pause').classList.toggle('hidden', !v)
    if (v) { drawRoster(); document.activeElement?.blur?.() }
  }
  $('menu-btn').onclick = () => setPaused(!paused)
  $('resume').onclick = () => setPaused(false)
  $('leave').onclick = () => onExit()
  $('invite-btn').onclick = () => { setPaused(false); onInvite?.(game) }
  $('copy-link').onclick = () => { const url = `${location.origin}/join/${game.id}`; (navigator.clipboard?.writeText(url) ?? Promise.reject()).then(() => sys(t('link_copied')), () => prompt(t('copy_link'), url)); setPaused(false) }
  // ----- emotes -----
  const emotePanel = $('emote-panel')
  emotePanel.replaceChildren(...EMOTES.map(e => { const b = document.createElement('button'); b.className = 'emote'; b.dataset.id = e.id; b.textContent = t('emote_' + e.id); b.onclick = () => { if (!cfg.allow_emotes) return; if (me.grounded || me.fly) { me.fly = false; me.emote = e.id } emotePanel.classList.add('hidden') }; return b }))
  layoutWheel(emotePanel)
  onLang(() => emotePanel.querySelectorAll('.emote').forEach(b => (b.textContent = t('emote_' + b.dataset.id))))
  $('emote-btn').onclick = () => emotePanel.classList.toggle('hidden')
  $('emote-btn').classList.toggle('hidden', !cfg.allow_emotes)
  $('players-btn').onclick = () => { drawRoster(); roster.classList.toggle('hidden') }
  $('shot-btn').onclick = () => (shotPending = true)
  $('chat-btn').onclick = () => { const f = $('chat-form'); f.classList.toggle('open'); if (f.classList.contains('open')) $('chat-input').focus() }
  $('chat-form').classList.toggle('hidden', !cfg.allow_chat)
  $('chat-btn').classList.toggle('hidden', !cfg.allow_chat)
  $('chat-form').onsubmit = e => {
    e.preventDefault()
    const tx = $('chat-input').value.trim(); $('chat-input').value = ''; $('chat-input').blur(); $('chat-form').classList.remove('open')
    if (tx) sendChat(tx)
  }
  function sendChat(tx) {
    if (tx.startsWith('/')) {
      const [cmd, ...rest] = tx.slice(1).split(' '), name = cmd.toLowerCase(), args = rest.join(' ').trim()
      if (name === 'help') return sys('/help  /tp <jugador>  /fly  /spawn  /me <texto>  /pos  /ping  /clear' + (scriptCmds.size ? '  ·  ' + [...scriptCmds].map(c => '/' + c).join('  ') : ''))
      if (name === 'me') return args ? sendChat(`* ${profile.username} ${args}`) : sys('/me <texto>')
      if (name === 'pos') return sys(`(${me.pos.x.toFixed(1)}, ${me.pos.y.toFixed(1)}, ${me.pos.z.toFixed(1)})`)
      if (name === 'ping') return sys(`${ping || '?'} ms`)
      if (name === 'clear') return log.replaceChildren()
      if (name === 'spawn') return teleport(...respawn.pos)
      if (name === 'fly') return toggleFly()
      if (name === 'tp') { const o = [...others.values()].find(x => x.name.toLowerCase() === args.toLowerCase()); return o ? teleport(o.target.x + 1.2, o.target.y + 0.2, o.target.z) : sys(args ? `${args}: ?` : '/tp <jugador>') }
      if (runner.has()) return runner.fire('command', { name, args, who: profile.username })
      return
    }
    if (!cfg.allow_chat) return sys(t('chat_off'))
    bump('msgs'); social.missionAdd('chat_5'); api.say(game.id, tx).then(() => {}, err => sys(err.message))
    chatLine(profile.username, tx, profile.id); chatSeenLocal.add(tx + '|' + Math.floor(Date.now() / 4000))
  }
  const chatSeenLocal = new Set()

  // ---------- script del juego (Worker aislado) ----------
  let runner = { fire() {}, has: () => false, dispose() {} }
  // piezas, luces, interfaz y puntuaciones que crean los scripts (API de Roblox en Lua)
  const weather = createWeather(scene); weather.setKind(cfg.weather)
  const projV = new THREE.Vector3()
  const rbx = createScripted({ scene, uiRoot: $('game'), getMe: () => me.pos, solid, world, sfx,
    project: (x, y, z) => { projV.set(x, y, z).project(camera); const w = canvas.clientWidth, h = canvas.clientHeight, r = canvas.getBoundingClientRect(); return { x: r.left + (projV.x * 0.5 + 0.5) * w, y: r.top + (-projV.y * 0.5 + 0.5) * h, visible: projV.z < 1 && Math.abs(projV.x) < 1.2 && Math.abs(projV.y) < 1.2, dist: camera.position.distanceTo(projV.set(x, y, z)) } },
    fire: (ev, data) => runner.fire(ev, { data }), onSpawn: p => { respawn.pos = p; teleport(...p) }, setHour: h => sky.setHour(h), setFog: v => { const f = Math.min(v, settings.viewDistance * fogMul()); scene.fog.far = Math.max(8, f); scene.fog.near = Math.max(2, f * 0.35) } })
  const keyName = c => (/^Key[A-Z]$/.test(c) ? c.slice(3) : /^Digit\d$/.test(c) ? ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][+c.slice(5)]
    : { Space: 'Space', ShiftLeft: 'LeftShift', ShiftRight: 'RightShift', ControlLeft: 'LeftControl', Enter: 'Return', Escape: 'Escape', Tab: 'Tab', Backspace: 'Backspace', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' }[c] ?? null)
  let remoteTokens = 10, remoteAt = performance.now()
  const uiText = {}                                          // textos de interfaz cambiados por el script (Lua: ui.setText)
  function startRunner() {
    runner.dispose(); rbx.reset()
    const lua = cfg.script_lang === 'lua', hasCode = !!game.script?.trim()
    if (!(lua && hasCode)) rbx.spawnStatic(cfg.parts)                      // piezas del Studio: con script Lua las crea el propio script (para que las encuentre por nombre)
    runner = createRunner(game.script, { name: profile.username }, (type, a) => {
      switch (type) {
        case 'print': sys('› ' + a[0]); break
        case 'team': setTeam(String(a[0]), a[1] ? `rgb(${[1, 2, 3].map(i => Math.round(Number(String(a[1]).slice(2).split(',')[i - 1]) * 255)).join(',')})` : ''); break
        case 'cmd': scriptCmds.add(String(a[0])); break
        case 'weather': weather.setKind(String(a[0])); break
        case 'remote': { const now = performance.now(); remoteTokens = Math.min(10, remoteTokens + (now - remoteAt) / 100); remoteAt = now; if (remoteTokens >= 1) { remoteTokens--; api.gameEvent(game.id, 'rem', { id: String(a[0]), m: String(a[1]), t: String(a[2] ?? ''), a: String(a[3] ?? '') }).catch(() => {}) } break }
        case 'dsset': saveDataStore(game.parentId ?? game.id, String(a[0]), String(a[1]), String(a[2] ?? '')); break
        case 'respawn': teleport(...respawn.pos); runner.fire('respawned', { data: {} }); break
        case 'say': sys('» ' + a[0]); break
        case 'title': showTitle(a[0], a[1]); break
        case 'teleport': teleport(a[0], a[1], a[2]); break
        case 'speed': phys.speed = Math.min(30, Math.max(0, a[0])); break
        case 'jump': phys.jump = Math.min(30, Math.max(0, a[0])); break
        case 'gravity': phys.gravity = Math.min(80, Math.max(-20, a[0])); break
        case 'emote': if (EMOTES.some(e => e.id === a[0])) me.emote = a[0]; break
        case 'sky': sky.setPreset(a[0]); break
        case 'sound': sfx[a[0]]?.(); break
        case 'uitext': uiText[a[0]] = String(a[1]); drawUi(); break
        default: rbx.apply(type, a)
      }
    }, msg => sys('script: ' + msg), lua ? 'lua' : 'js', { parts: cfg.parts ?? [], ds: loadDataStore(game.parentId ?? game.id) })
  }
  if (!ST) startRunner()

  // ---------- texto de interfaz (UI) del juego: {players} {name} {game} {time} ----------
  const uiLayer = $('ui-layer'); let uiEls = (cfg.ui ?? []).map(e => ({ ...e })), selUi = null, playSecs = 0
  const mmss = n => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
  const fmtUi = e => String(uiText[e.id] ?? e.text ?? '').replaceAll('{players}', others.size + 1).replaceAll('{name}', profile.username).replaceAll('{game}', game.name).replaceAll('{time}', mmss(playSecs))
  function drawUi() {
    uiLayer.replaceChildren(...uiEls.map(e => {
      const d = document.createElement('div'); d.className = 'ui-el' + (e === selUi ? ' sel' : ''); d.textContent = editing() ? (e.text ?? '') : fmtUi(e)
      d.style.left = e.x + '%'; d.style.top = e.y + '%'; d.style.fontSize = (e.size || 28) + 'px'; d.style.color = e.color || '#fff'
      if (editing()) d.addEventListener('pointerdown', ev => { ev.stopPropagation(); selUi = e; openInspector(); dragUi = { e, el: d }; drawUi() })
      return d
    }))
  }
  let dragUi = null
  const uiMove = ev => { if (!dragUi) return; const r = uiLayer.getBoundingClientRect(); dragUi.e.x = Math.round(Math.min(100, Math.max(0, (ev.clientX - r.left) / r.width * 100)) * 10) / 10; dragUi.e.y = Math.round(Math.min(100, Math.max(0, (ev.clientY - r.top) / r.height * 100)) * 10) / 10; dragUi.el.style.left = dragUi.e.x + '%'; dragUi.el.style.top = dragUi.e.y + '%' }
  const uiUp = () => { dragUi = null }
  window.addEventListener('pointermove', uiMove); window.addEventListener('pointerup', uiUp)
  function openInspector() {
    const box = $('ui-inspector'); if (!selUi || !editing()) return box.classList.add('hidden')
    const e = selUi, f = (label, input) => { const l = document.createElement('label'); l.append(label, input); return l }
    const txt = document.createElement('textarea'); txt.rows = 2; txt.value = e.text ?? ''; txt.placeholder = t('st_text_ph'); txt.className = 'bio-edit'; txt.oninput = () => { e.text = txt.value; drawUi() }
    const id = document.createElement('input'); id.value = e.id; id.oninput = () => (e.id = id.value.replace(/[^\w]/g, '').slice(0, 24))
    const size = document.createElement('input'); size.type = 'range'; size.min = 12; size.max = 96; size.value = e.size || 28; size.oninput = () => { e.size = +size.value; drawUi() }
    const col = document.createElement('input'); col.type = 'color'; col.value = e.color || '#ffffff'; col.oninput = () => { e.color = col.value; drawUi() }
    const del = document.createElement('button'); del.className = 'btn danger'; del.textContent = t('st_delete'); del.onclick = () => { uiEls = uiEls.filter(x => x !== e); selUi = null; drawUi(); openInspector() }
    box.replaceChildren(f(t('st_text_ph'), txt), f(t('st_id'), id), f(t('st_size'), size), f(t('st_color'), col), del); box.classList.remove('hidden')
  }
  drawUi()
  const uiTimer = setInterval(() => { playSecs++; if (!editing()) drawUi() }, 1000)

  // ---------- Studio ----------
  const studioCleanup = []
  let sd = null
  if (ST) {
    const g = $('game'); g.classList.add('studio'); $('studio-bar').classList.remove('hidden')
    sd = createStudio({ game, cfg, api, PALETTE, key, index, statics, setBlock, removeBlock, me, pick, scene, camera, canvas, rbx, showTitle, sys, sfx, burst, selectKind, getHover: () => hoverPt,
      setUiTool: on => { if (!on) { selUi = null; openInspector(); drawUi() } },
      onAddText: () => { let n = 1; while (uiEls.some(x => x.id === 'texto' + n)) n++; const e = { id: 'texto' + n, text: 'Texto', x: 50, y: 18, size: 32, color: '#ffffff' }; uiEls.push(e); selUi = e; drawUi(); openInspector() },
      onEnv: (k, v) => {
        if (k === 'gravity') phys.gravity = Number(v) || 24; else if (k === 'speed') phys.speed = Number(v) || 6; else if (k === 'jump') phys.jump = Number(v) || 8.6
        else if (k === 'sky') { if (v === 'auto') sky.setHour(0); else sky.setPreset(v) }
        else if (k === 'weather') weather.setKind(v)
        else if (k === 'fog') { scene.fog.far = settings.viewDistance * fogMul(); scene.fog.near = settings.viewDistance * 0.35 * fogMul() }
      },
      onScript: async () => { await studio.openScript(game) },
      onTestToggle: () => {
        testing = !testing
        $('st-test').querySelector('span').textContent = t(testing ? 'st_stop' : 'st_test'); $('st-test').classList.toggle('on', testing); sd.setTesting(testing)
        if (testing) { selUi = null; openInspector(); teleport(...world.spawn); me.fly = false; for (const k in uiText) delete uiText[k]; startRunner(); drawUi(); setTimeout(() => runner.fire('join', { data: { name: profile.username }, who: profile.username }), 400) }
        else { runner.dispose(); rbx.reset(); rbx.spawnStatic(cfg.parts); runner = { fire() {}, has: () => false, dispose() {} }; for (const k in uiText) delete uiText[k]; me.fly = true; drawUi() }
      },
      getConfig: () => ({ ...(game.config ?? {}), ui: uiEls, parts: sd.parts }),
      onSave: async silent => { try { await sd.flush(); game.config = { ...(game.config ?? {}), ui: uiEls, parts: sd.parts }; await studio.save(game); if (silent === true) { const c = document.createElement('div'); c.className = 'autosave'; c.textContent = t('st_autosave'); $('game').append(c); setTimeout(() => c.remove(), 1800) } else { showTitle(t('st_saved'), 1600); sfx.click() } } catch (e) { if (silent !== true) showTitle(e.message, 3000) } },
      onExit: () => onExit() })
    showTitle(t('st_help'), 7000)
    const autoTimer = setInterval(() => { if (editing() && !paused && !document.hidden) sd.save?.(true) }, 60_000)
    studioCleanup.push(() => clearInterval(autoTimer))
    studioCleanup.push(() => { sd.dispose(); g.classList.remove('studio', 'tool-ui'); $('studio-bar').classList.add('hidden'); $('ui-inspector').classList.add('hidden') })
  }

  // ---------- selección de bloque con rayo de vóxeles ----------
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.012, 1.012, 1.012)), new THREE.LineBasicMaterial({ color: 0xffffff }))
  outline.visible = false; scene.add(outline)
  const ghostMat = new THREE.MeshBasicMaterial({ color: PALETTE[me.kind], transparent: true, opacity: 0.35, depthWrite: false })
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ghostMat); ghost.visible = false; scene.add(ghost)
  drawHotbar()

  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2()
  function pick(clientX, clientY) {
    const r = canvas.getBoundingClientRect()
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const o = ray.ray.origin, d = ray.ray.direction, MAX = 18
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z)
    const sx = d.x > 0 ? 1 : -1, sy = d.y > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1
    const td = v => (v === 0 ? Infinity : Math.abs(1 / v))
    const dx = td(d.x), dy = td(d.y), dz = td(d.z)
    let tx = d.x === 0 ? Infinity : ((sx > 0 ? x + 1 - o.x : o.x - x) * dx)
    let ty = d.y === 0 ? Infinity : ((sy > 0 ? y + 1 - o.y : o.y - y) * dy)
    let tz = d.z === 0 ? Infinity : ((sz > 0 ? z + 1 - o.z : o.z - z) * dz)
    let nx = 0, ny = 0, nz = 0, tt = 0
    let blockHit = null
    for (let i = 0; i < 80 && tt <= MAX; i++) {
      if (i > 0 && solid(x, y, z)) { blockHit = { cell: [x, y, z], place: [x + nx, y + ny, z + nz], t: tt, fixed: statics.has(key(x, y, z)) }; break }
      if (tx < ty && tx < tz) { x += sx; tt = tx; tx += dx; nx = -sx; ny = 0; nz = 0 }
      else if (ty < tz) { y += sy; tt = ty; ty += dy; ny = -sy; nx = 0; nz = 0 }
      else { z += sz; tt = tz; tz += dz; nz = -sz; nx = 0; ny = 0 }
    }
    if (world.floor && d.y < 0) {
      const tf = -o.y / d.y
      if (tf > 0 && tf <= MAX && (!blockHit || tf < blockHit.t)) { const px = o.x + d.x * tf, pz = o.z + d.z * tf; return { floor: true, place: [Math.floor(px), 0, Math.floor(pz)] } }
    }
    return blockHit
  }
  let hoverPt = null
  function updateHover() {
    if (!hoverPt || paused || IS_TOUCH || !canBuild || (ST && editing() && sd && sd.tool !== 'place')) { outline.visible = ghost.visible = false; return }
    const h = pick(hoverPt.x, hoverPt.y)
    if (!h) { outline.visible = ghost.visible = false; return }
    outline.visible = !h.floor; if (!h.floor) outline.position.set(h.cell[0] + 0.5, h.cell[1] + 0.5, h.cell[2] + 0.5)
    const [x, y, z] = h.place
    ghost.visible = y >= 0 && !solid(x, y, z) && !overlapsMe(x, y, z)
    if (ghost.visible) ghost.position.set(x + 0.5, y + 0.5, z + 0.5)
  }
  const overlapsMe = (x, y, z) => Math.abs(me.pos.x - (x + 0.5)) < 0.8 && Math.abs(me.pos.z - (z + 0.5)) < 0.8 && me.pos.y < y + 1 && me.pos.y + 1.8 > y

  function interact(e, breakMode) {
    if (ST && editing() && sd) { sd.interact(e, e.button === 2); return }
    if (!canBuild) { sys(t('build_off')); return }
    const h = pick(e.clientX, e.clientY); if (!h) return
    if (breakMode) {
      if (h.floor || h.fixed) return
      const [x, y, z] = h.cell
      burst(x, y, z, PALETTE[index.get(key(x, y, z))?.kind ?? 0]); sfx.break(); bump('broken')
      removeBlock(x, y, z)
      api.breakBlock(game.id, x, y, z).catch(err => sys(err.message))
    } else {
      const [x, y, z] = h.place
      if (y < 0 || y > 255 || solid(x, y, z) || overlapsMe(x, y, z)) return
      setBlock(x, y, z, me.kind); sfx.place(); bump('placed'); social.missionAdd('place_50')
      api.placeBlock(game.id, x, y, z, me.kind).catch(err => sys(err.message))
    }
  }

  // ---------- entrada: teclado y ratón ----------
  function toggleFly() {
    if (!canFly) return
    me.fly = !me.fly; sys(t(me.fly ? 'fly_on' : 'fly_off')); $('down-btn')?.classList.toggle('hidden', !me.fly)
  }
  let lastSpace = 0, lastReact = 0, stepAt = 0, spaceWas = false, jumpsLeft = 1, wasSwimming = false
  function react(i) {
    if (!cfg.allow_chat || Date.now() - lastReact < 1500) return; lastReact = Date.now()
    bubble(meAvatar, REACTIONS[i]); sfx.click(); api.say(game.id, REACT_PREFIX + REACTIONS[i]).catch(() => {})
  }
  const help = createShortcuts(); loadingScreen(game.name); let ping = 0
  const down = e => {
    if (typing()) { if (e.code === 'Escape') { $('chat-input').blur(); $('chat-form').classList.remove('open') } return }
    if (e.code === 'Escape') return setPaused(!paused)
    if (paused) return
    if (ST && editing() && sd?.keydown(e)) return
    { const kn = keyName(e.code); if (kn && !e.repeat) runner.fire('key', { data: { k: kn, down: true } }); if (rbx.onKey(e.code, true)) return }
    if (e.code === 'Slash' || e.code === 'Enter') { if (!cfg.allow_chat) return; e.preventDefault(); $('chat-form').classList.add('open'); $('chat-input').focus(); return }
    if (e.code === 'KeyG' && cfg.allow_emotes) { emotePanel.classList.toggle('hidden'); return }
    if (e.code === 'KeyF') { if (horror) horror.toggleLight(); else toggleFly(); return }
    if (e.altKey && /^Digit[1-4]$/.test(e.code)) { e.preventDefault(); react(Number(e.code.slice(5)) - 1); return }
    if (e.code === 'KeyM') { music.toggle(); return }
    if (e.code === 'KeyH') { togglePhoto(); return }
    if (e.key === '?' || e.code === 'F1') { e.preventDefault(); help.toggle(); return }
    if (e.code === 'KeyV') { if (settings.voiceMode === 'ptt' && voice.active) { if (!e.repeat) voice.setMuted(false) } else if (!e.repeat) toggleVoice(); return }
    if (e.code === 'KeyP') { shotPending = true; return }
    if (e.code === 'Tab') { e.preventDefault(); drawRoster(); roster.classList.toggle('hidden'); return }
    if (e.code.startsWith('Digit')) { let n = Number(e.code.slice(5)) - 1; if (n < 0) n = 9; if (n >= 0 && n < PALETTE.length) selectKind(n) }
    if (e.code === 'KeyQ' || e.code === 'KeyE') selectKind((me.kind + (e.code === 'KeyE' ? 1 : PALETTE.length - 1)) % PALETTE.length)
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { const now = performance.now(); if (now - lastSpace < 280 && canFly && !cfg.double_jump) toggleFly(); lastSpace = now } }
    keys[e.code] = true
  }
  const up = e => { keys[e.code] = false; { const kn = keyName(e.code); if (kn && !typing()) runner.fire('key', { data: { k: kn, down: false } }); rbx.onKey(e.code, false) } if (e.code === 'KeyV' && settings.voiceMode === 'ptt' && voice.active) voice.setMuted(true) }
  let drag = null
  let touchBreak = false
  const pdown = e => { if (drag) return; if (ST && editing() && sd?.pointerDown(e)) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false }; try { canvas.setPointerCapture(e.pointerId) } catch {} }
  const pmove = e => {
    if (ST && sd?.pointerMove(e)) return
    hoverPt = { x: e.clientX, y: e.clientY }
    if (!drag || drag.id !== e.pointerId || paused) return
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true
    cam.yaw -= dx * 0.005 * settings.sensitivity; cam.pitch = Math.min(1.45, Math.max(-0.25, cam.pitch + dy * 0.005 * settings.sensitivity * (settings.invertY ? -1 : 1)))
    drag.x = e.clientX; drag.y = e.clientY
  }
  const pup = e => {
    if (ST && sd?.pointerUp(e)) return
    if (!drag || drag.id !== e.pointerId) return
    if (!drag.moved && !paused && !(ST && sd?.tool === 'ui' && editing()) && !(runner.has() && rbx.click(new THREE.Vector2(((e.clientX - canvas.getBoundingClientRect().left) / canvas.clientWidth) * 2 - 1, -((e.clientY - canvas.getBoundingClientRect().top) / canvas.clientHeight) * 2 + 1), camera))) interact(e, IS_TOUCH ? touchBreak : e.button === 2)
    drag = null
  }
  const pleave = () => { hoverPt = null }
  const wheel = e => { e.preventDefault(); cam.dist = Math.min(ST ? 60 : 22, Math.max(2.5, cam.dist + e.deltaY * 0.01 * (ST ? 3 : 1))) }
  const noMenu = e => e.preventDefault()
  window.addEventListener('keydown', down); window.addEventListener('keyup', up)
  canvas.addEventListener('pointerdown', pdown); window.addEventListener('pointermove', pmove); window.addEventListener('pointerup', pup); window.addEventListener('pointercancel', pup)
  canvas.addEventListener('pointerleave', pleave)
  canvas.addEventListener('wheel', wheel, { passive: false }); canvas.addEventListener('contextmenu', noMenu)
  const onResize = () => size(); window.addEventListener('resize', onResize)

  // ---------- controles táctiles: joystick, saltar, poner/romper ----------
  let touchUi = null
  if (IS_TOUCH) {
    touchUi = document.createElement('div'); touchUi.id = 'touch-ui'
    touchUi.innerHTML = `<div id="joy"><div id="joy-knob"></div></div><div id="touch-btns">${canBuild ? '<button id="t-mode" class="t-btn"></button>' : ''}${canFly ? `<button id="down-btn" class="t-btn hidden">▼</button><button id="fly-btn" class="t-btn">${icon('fly', 22)}</button>` : ''}<button id="t-jump" class="t-btn big"></button></div>`
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
    const hold = (el, on, off) => { el.addEventListener('pointerdown', e => { on(); e.stopPropagation() }); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off) }
    hold(touchUi.querySelector('#t-jump'), () => (jumpHeld = true), () => (jumpHeld = false))
    const dn = touchUi.querySelector('#down-btn'); if (dn) hold(dn, () => (downHeld = true), () => (downHeld = false))
    touchUi.querySelector('#fly-btn')?.addEventListener('click', toggleFly)
    const mode = touchUi.querySelector('#t-mode')
    mode?.addEventListener('click', () => { touchBreak = !touchBreak; mode.textContent = touchBreak ? t('break') : t('place'); mode.classList.toggle('on', touchBreak) })
  }

  // ---------- red ----------
  let sending = false, lastSent = 0, last = { x: NaN, y: NaN, z: NaN, ry: NaN, anim: '' }
  function send() {
    if (editing()) return                              // Studio: no se emite tu posición
    const now = Date.now()
    const changed = last.x !== me.pos.x || last.y !== me.pos.y || last.z !== me.pos.z || last.ry !== me.ry || last.anim !== me.anim
    if (sending || (!changed && now - lastSent < 1000)) return
    sending = true; lastSent = now
    last = { x: me.pos.x, y: me.pos.y, z: me.pos.z, ry: me.ry, anim: me.anim, hat: myHat() }
    const t0 = performance.now(); api.move(game.id, last).then(() => { ping = Math.round(performance.now() - t0) }, () => {}).finally(() => (sending = false))
  }

  let chatSince = new Date().toISOString(), chatSeen = new Set(), rtAt = 0, chatRtOk = false
  const seenEv = new Set()
  const routeEvent = row => {
    if (!row || row.kind === 'chat' || seenEv.has(row.id)) return; seenEv.add(row.id)
    if (row.kind === 'rem') { if (row.player_id !== profile.id && runner.has()) { const p = row.payload ?? {}; runner.fire('remote', { data: { id: String(p.id ?? ''), m: String(p.m ?? ''), t: String(p.t ?? ''), a: String(p.a ?? ''), from: row.username } }) } return }
    horror?.onEvent(row)
  }
  const onChatRow = row => {
    if (!row || row.kind !== 'chat' || chatSeen.has(row.id)) return
    chatSeen.add(row.id); chatSince = row.created_at
    if (row.player_id === profile.id || social.isBlockedName(row.username)) return                      // mis mensajes ya se enseñaron al enviarlos
    { const r = isReaction(row.payload?.text); if (r) { bubble(others.get(row.player_id)?.avatar, r); return } }
    chatLine(row.username, row.payload?.text ?? '', row.player_id)
  }
  const channel = gameDb.channel(`game:${game.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'player_state', filter: `game_id=eq.${game.id}` }, p => {
      rtAt = Date.now(); if (p.eventType === 'DELETE') dropOther(p.old.player_id); else upsertOther(p.new)
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks', filter: `game_id=eq.${game.id}` }, p => {
      if (p.eventType === 'DELETE') { const o = p.old; if (index.has(key(o.x, o.y, o.z))) burst(o.x, o.y, o.z, PALETTE[index.get(key(o.x, o.y, o.z)).kind], 5); removeBlock(o.x, o.y, o.z) } else setBlock(p.new.x, p.new.y, p.new.z, p.new.kind)
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'interactions', filter: `game_id=eq.${game.id}` }, p => { chatRtOk = true; if (p.new.kind === 'chat') onChatRow(p.new); else routeEvent(p.new) })
    .subscribe()

  ;(async () => {
    const { data: bl } = await gameDb.from('blocks').select('x,y,z,kind').eq('game_id', game.id).limit(5000)
    for (const b of bl ?? []) setBlock(b.x, b.y, b.z, b.kind)
    const since = new Date(Date.now() - STALE_MS).toISOString()
    const { data: pl } = await gameDb.from('player_state').select('*').eq('game_id', game.id).gt('updated_at', since)
    for (const p of pl ?? []) upsertOther(p)
  })()

  let sendTimer = setInterval(send, settings.syncMs)
  const offSync = onSettings(() => { clearInterval(sendTimer); sendTimer = setInterval(send, settings.syncMs) })      // ajuste "Sincronización": cada cuántos ms se envía la posición
  const pruneTimer = setInterval(() => { for (const [id, o] of others) if (Date.now() - o.seen > STALE_MS) dropOther(id) }, 2000)
  const syncTimer = setInterval(async () => {
    const { data } = await gameDb.from('blocks').select('x,y,z,kind').eq('game_id', game.id).limit(5000)
    if (!data) return
    const seen = new Set()
    for (const b of data) { seen.add(key(b.x, b.y, b.z)); const e = index.get(key(b.x, b.y, b.z)); if (!e || e.kind !== ((b.kind % PALETTE.length) + PALETTE.length) % PALETTE.length) setBlock(b.x, b.y, b.z, b.kind) }
    for (const k of [...index.keys()]) if (!seen.has(k)) { const [x, y, z] = k.split(',').map(Number); removeBlock(x, y, z) }
  }, 5000)
  // Respaldo si Realtime no entrega eventos (redes móviles, proxys): jugadores y chat por consulta
  let pollBusy = false, pollN = 0
  const pollTimer = setInterval(async () => {
    if (pollBusy) return; pollBusy = true; pollN++
    try {
      if (Date.now() - rtAt > 2500 || pollN % 5 === 0) {
        const since = new Date(Date.now() - STALE_MS).toISOString()
        const { data: pl } = await gameDb.from('player_state').select('*').eq('game_id', game.id).gt('updated_at', since)
        if (pl) { const ids = new Set(pl.map(p => p.player_id)); for (const p of pl) upsertOther(p); for (const id of [...others.keys()]) if (!ids.has(id)) dropOther(id) }
      }
      if (!chatRtOk || pollN % 4 === 0) {
        const { data: ch } = await gameDb.from('interactions').select('id,player_id,username,kind,payload,created_at').eq('game_id', game.id).in('kind', horror ? ['chat', 'rem', 'orb', 'win', 'round', 'caught'] : ['chat', 'rem']).gt('created_at', chatSince).order('created_at').limit(40)
        for (const c of ch ?? []) { if (c.kind === 'chat') onChatRow(c); else routeEvent(c); chatSince = c.created_at > chatSince ? c.created_at : chatSince }
        if (chatSeen.size > 200) chatSeen = new Set([...chatSeen].slice(-50))
      }
    } catch {} finally { pollBusy = false }
  }, Math.max(500, Math.min(1500, settings.syncMs * 6)))
  const rosterTimer = setInterval(() => { if (!roster.classList.contains('hidden') || paused) drawRoster() }, 1500)
  const tickTimer = setInterval(() => runner.fire('tick', { data: { players: others.size + 1 } }), 1000)
  const timeTimer = setInterval(() => bump('time', 5), 5000)
  const missionTimer = setInterval(() => { social.missionAdd('play_10', 1); if (!document.hidden) social.addPlaytime(60) }, 60_000)
  const coinTimer = setInterval(async () => { const n = await social.earnCoins(10, 'play'); if (n) sys(t('coins_earned', { n })) }, 300_000)       // BCoins por jugar (tope diario en el servidor)

  // ---------- música ----------
  const mBtn = $('music-btn'), mPanel = $('music-panel')
  const paintMusic = st => {
    mBtn.classList.toggle('hidden', !st.tracks); mBtn.classList.toggle('on', st.playing)
    mBtn.innerHTML = icon(st.playing ? 'music' : 'mute', 20)
    $('music-title').textContent = st.tracks ? (st.title || '...') : t('no_music')
    if (!st.tracks) mPanel.classList.add('hidden')
  }
  const offMusic = music.onMusic(paintMusic)
  mBtn.onclick = () => mPanel.classList.toggle('hidden')
  $('music-toggle').onclick = () => music.toggle(); $('music-next').onclick = () => music.next(); $('music-prev').onclick = () => music.prev()
  $('music-toggle').innerHTML = icon('play', 18); $('music-next').innerHTML = icon('next', 18); $('music-prev').innerHTML = icon('prev', 18)
  if (!ST) music.start(cfg.track); paintMusic(music.state())

  // ---------- chat de voz (WebRTC, por proximidad) ----------
  let voiceSt = { active: false, muted: true, members: [], selfSpeaking: false }
  const voice = createVoice({ gameId: game.id, selfId: profile.id, name: profile.username, getPos: id => (id === profile.id ? me.pos : others.get(id)?.target), onChange: st => { voiceSt = st; paintVoice() } })
  function paintVoice() {
    const b = $('voice-btn'); b.innerHTML = icon(voiceSt.active && !voiceSt.muted ? 'mic' : 'micoff', 20)
    b.classList.toggle('on', voiceSt.active && !voiceSt.muted); b.classList.toggle('speaking', voiceSt.selfSpeaking)
    if (!roster.classList.contains('hidden')) drawRoster()
  }
  async function toggleVoice() {
    if (!voice.active) { try { await voice.start(); sys(t('voice_on', { n: voiceSt.members.length })) } catch (e) { sys(t('voice_err')) } }
    else if (settings.voiceMode === 'ptt') sys(t('voice_ptt'))
    else { voice.toggleMute(); sys(t(voice.muted ? 'voice_muted' : 'voice_unmuted')) }
  }
  $('voice-btn').onclick = toggleVoice
  $('voice-leave').onclick = () => { voice.stop(); sys(t('voice_off')); setPaused(false) }
  paintVoice()

  // ---------- minimapa ----------
  const mm = $('minimap'), mmc = mm.getContext('2d')
  function drawMinimap() {
    if (!settings.minimap) return
    const S = mm.width, c = S / 2, sc = 2.2, px = me.pos.x, pz = me.pos.z
    mmc.clearRect(0, 0, S, S); mmc.save(); mmc.beginPath(); mmc.arc(c, c, c - 1, 0, 7); mmc.clip()
    mmc.fillStyle = 'rgba(16,20,28,.72)'; mmc.fillRect(0, 0, S, S)
    mmc.strokeStyle = 'rgba(255,255,255,.08)'; mmc.lineWidth = 1
    for (const r of [S * 0.17, S * 0.34]) { mmc.beginPath(); mmc.arc(c, c, r, 0, 7); mmc.stroke() }
    const rot = cam.yaw, cs = Math.cos(rot), sn = Math.sin(rot)             // la cámara mira "arriba"
    const toMap = (x, z) => { const dx = (x - px) * sc, dz = (z - pz) * sc; return [c + dx * cs - dz * sn, c + dx * sn + dz * cs] }
    mmc.fillStyle = 'rgba(255,255,255,.25)'
    let n = 0
    for (const [k] of index) { if (++n > 2500) break; const [x, , z] = k.split(',').map(Number); if (Math.abs(x - px) > 48 || Math.abs(z - pz) > 48) continue; const [mx, my] = toMap(x + .5, z + .5); mmc.fillRect(mx - 1, my - 1, 2, 2) }
    for (const cp of world.checkpoints ?? []) { const [mx, my] = toMap(cp.pos[0], cp.pos[2]); mmc.fillStyle = '#4d8dff'; mmc.beginPath(); mmc.arc(mx, my, 3, 0, 7); mmc.fill() }
    if (world.finish) { const [mx, my] = toMap(world.finish.pos[0], world.finish.pos[2]); mmc.fillStyle = '#f5c542'; mmc.fillRect(mx - 3, my - 3, 6, 6) }
    for (const o of others.values()) { const [mx, my] = toMap(o.target.x, o.target.z); mmc.fillStyle = o.color; mmc.beginPath(); mmc.arc(mx, my, 3.4, 0, 7); mmc.fill(); mmc.strokeStyle = '#000a'; mmc.stroke() }
    mmc.restore()
    mmc.fillStyle = '#fff'; mmc.save(); mmc.translate(c, c); mmc.rotate(rot - me.ry + Math.PI); mmc.beginPath(); mmc.moveTo(0, -6); mmc.lineTo(4.5, 5); mmc.lineTo(-4.5, 5); mmc.closePath(); mmc.fill(); mmc.restore()
    mmc.strokeStyle = 'rgba(255,255,255,.4)'; mmc.lineWidth = 2; mmc.beginPath(); mmc.arc(c, c, c - 1, 0, 7); mmc.stroke()
  }

  // ---------- Bosque Oscuro: linterna, fragmentos y monstruo ----------
  const horror = cfg.horror && !ST ? createHorror({ scene, camera, world, game, profile, me, others, sky, solid, sfx, sys, showTitle, teleport: (x, y, z) => { teleport(x, y, z); respawn.pos = [x, y, z] }, bonus: () => { social.missionAdd('obby_win'); social.earnCoins(20, 'obby').then(n => { if (n) sys(t('coins_earned', { n })) }) } }) : null
  if (horror) { sky.setPreset('night'); canvas.style.background = '#000' }

  // ---------- bucle ----------
  const clock = new THREE.Clock(); let raf, stepAcc = 0, tAnim = 0, fps = 60, frames = 0, fpsAt = performance.now(), mmAt = 0, shotPending = false
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), want = new THREE.Vector3(), tgt = new THREE.Vector3()
  camPos.set(me.pos.x, me.pos.y + 6, me.pos.z + 9)
  paintStatic(); applyAll()
  function frame() {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(clock.getDelta(), 0.05); tAnim += dt
    const w = canvas.clientWidth, h = canvas.clientHeight
    if (w && h && (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio()))) size()
    step(dt)
    meAvatar.position.copy(me.pos); meAvatar.visible = !editing()
    let dy = me.ry - meAvatar.rotation.y; dy = ((dy + Math.PI * 3) % (Math.PI * 2)) - Math.PI
    meAvatar.rotation.y += dy * Math.min(1, dt * 16)
    animateAvatar(meAvatar, me.anim, dt, tAnim)
    for (const o of others.values()) {
      o.avatar.position.lerp(o.target, Math.min(1, dt * 12))
      let d = o.ry - o.avatar.rotation.y; d = ((d + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      o.avatar.rotation.y += d * Math.min(1, dt * 12)
      animateAvatar(o.avatar, o.anim, dt, tAnim)
    }
    stepParts(dt); rbx.step(dt); weather.update(dt, me.pos, settings.reduceMotion)
    for (const p of pets.values()) {                                    // mascotas: siguen a su dueño con un pequeño bote
      const a = p.owner, ry = a.rotation.y, tx = a.position.x - Math.sin(ry) * 0.9 - Math.cos(ry) * 0.8, tz = a.position.z - Math.cos(ry) * 0.9 + Math.sin(ry) * 0.8
      p.mesh.position.x += (tx - p.mesh.position.x) * Math.min(1, dt * 4); p.mesh.position.z += (tz - p.mesh.position.z) * Math.min(1, dt * 4)
      p.mesh.position.y += (a.position.y + Math.abs(Math.sin(tAnim * 4 + p.mesh.id)) * 0.08 - p.mesh.position.y) * Math.min(1, dt * 8); p.mesh.rotation.y += (ry - p.mesh.rotation.y) * Math.min(1, dt * 5)
      p.mesh.visible = a.visible !== false
    }
    if (!settings.reduceMotion) for (const [key, av, anim, lo] of [['me', meAvatar, me.anim, meLoadout], ...[...others].map(([k, o]) => [k, o.avatar, o.anim, o.hat])]) {   // estelas
      const id = parseLoadout(lo).trail; if (!id || anim !== 'walk' || !av.visible || parts.length > 120) continue
      const acc = (trailAcc.get(key) ?? 0) + dt; if (acc < 0.07) { trailAcc.set(key, acc); continue } trailAcc.set(key, 0)
      parts.push({ p: new THREE.Vector3(av.position.x + (Math.random() - .5) * .4, av.position.y + 0.1 + Math.random() * 0.5, av.position.z + (Math.random() - .5) * .4), v: new THREE.Vector3((Math.random() - .5) * 0.6, id === 'trail_bubbles' ? 1.5 : id === 'trail_fire' ? 2.2 : 0.8, (Math.random() - .5) * 0.6), life: 0.55, c: new THREE.Color(trailColor(id, tAnim * 0.5 + Math.random() * 0.2)) })
    }
    stepAcc += dt
    if (stepAcc >= 0.066 && runner.has()) {                                 // el script Lua avanza (task.wait, Heartbeat, tweens...) con la posición de los jugadores
      runner.fire('step', { data: { dt: stepAcc, now: Date.now() / 1000, x: me.pos.x, y: me.pos.y, z: me.pos.z, others: [...others.values()].slice(0, 20).map(o => ({ n: o.name, x: o.avatar.position.x, y: o.avatar.position.y, z: o.avatar.position.z })) } }); stepAcc = 0
    }
    const c = me.pos
    want.set(c.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist, c.y + 1.6 + Math.sin(cam.pitch) * cam.dist, c.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist)
    if (world.floor && want.y < 0.4) want.y = 0.4
    { const ox = c.x, oy = c.y + 1.5, oz = c.z, ddx = want.x - ox, ddy = want.y - oy, ddz = want.z - oz, len = Math.hypot(ddx, ddy, ddz)
      for (let d = 0.5; d <= len; d += 0.25) {
        const f = d / len
        if (solid(Math.floor(ox + ddx * f), Math.floor(oy + ddy * f), Math.floor(oz + ddz * f))) { const k = Math.max(0.12, (d - 0.5) / len); want.set(ox + ddx * k, oy + ddy * k, oz + ddz * k); break }
      } }
    camPos.lerp(want, Math.min(1, dt * 14)); camera.position.copy(camPos)
    camLook.lerp(tgt.set(c.x, c.y + 1.3, c.z), Math.min(1, dt * 18)); camera.lookAt(camLook)
    const sk = sky.update(dt, camera, c)
    horror?.update(dt, tAnim)
    renderer.toneMappingExposure = sk.night ? 1.15 : 1.0
    updateHover(); if (ST && editing()) sd?.update()
    if (composer) composer.render(dt); else renderer.render(scene, camera)
    if (shotPending) { shotPending = false; canvas.toBlob(b => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `blocksy-${Date.now()}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); sys(t('screenshot_saved')); sfx.click() }) }
    frames++; const now = performance.now()
    if (now - mmAt > 120) { mmAt = now; drawMinimap() }
    if (now - fpsAt > 700) { fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now
      if (settings.dynRes && !document.hidden) {                                     // resolución dinámica: baja los píxeles si faltan fps y los recupera si sobran
        const prev = resScale
        if (fps < 40) resScale = Math.max(0.5, resScale - (fps < 25 ? 0.2 : 0.1)); else if (fps > 56) resScale = Math.min(1, resScale + 0.05)
        if (resScale !== prev) size()
      }
      const race$ = race.start && !race.done ? `  ${raceTime(Date.now() - race.start)}` : ''
      $('stats').textContent = `${t('players_n', { n: others.size + 1 })} · ${fps} fps · ${ping ? ping + ' ms · ' : ''}(${c.x.toFixed(0)}, ${c.y.toFixed(0)}, ${c.z.toFixed(0)})${race$}` }
  }
  frame()
  sys(t('welcome_to', { name: game.name }))
  if (!ST) try { if (!localStorage.getItem('blocksy.tutorial')) { localStorage.setItem('blocksy.tutorial', '1'); setTimeout(() => sys(t('controls_help')), 2500) } } catch {}       // primera partida: recordatorio de controles
  if (cfg.welcome && !ST) showTitle(String(cfg.welcome).slice(0, 120), 4200)
  if (game.script && !ST) setTimeout(() => runner.fire('join', { data: { name: profile.username }, who: profile.username }), 600)

  return function stop() {
    cancelAnimationFrame(raf); for (const i of [sendTimer, pruneTimer, syncTimer, pollTimer, rosterTimer, tickTimer, timeTimer, coinTimer, missionTimer]) clearInterval(i)
    window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('resize', onResize)
    window.removeEventListener('pointermove', pmove); window.removeEventListener('pointerup', pup); window.removeEventListener('pointercancel', pup)
    canvas.removeEventListener('pointerdown', pdown); canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('contextmenu', noMenu); canvas.removeEventListener('pointerleave', pleave)
    offSettings(); offSync(); offLang(); offMusic(); music.stop(); runner.dispose(); rbx.dispose(); help.dispose(); weather.dispose(); clearInterval(uiTimer); clearInterval(loadoutTimer); window.removeEventListener('pointermove', uiMove); window.removeEventListener('pointerup', uiUp); studioCleanup.forEach(f => f()); uiLayer.replaceChildren()
    touchUi?.remove(); emotePanel.classList.add('hidden'); mPanel.classList.add('hidden'); $('big-title').classList.add('hidden')
    $('pause').classList.add('hidden'); roster.classList.add('hidden'); log.replaceChildren()
    api.leave().catch(() => {}); gameDb.removeChannel(channel)
    horror?.stop(); voice.stop(); composer?.dispose(); sky.dispose()
    scene.traverse(o => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach(m => { m.map?.dispose?.(); m.dispose?.() }) })
    renderer.dispose(); renderer.forceContextLoss()
  }
}
