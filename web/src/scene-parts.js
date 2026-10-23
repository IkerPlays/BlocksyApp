// Lado "juego" de la API de Roblox de los scripts Lua: dibuja las piezas (Part), luces, interfaz (ScreenGui...) y tabla de puntuaciones que pide el script,
// y detecta toques, clics y avisos de proximidad. El script solo manda mensajes; aquí se decide qué se aplica (con límites).
import * as THREE from 'three'

const MAX_PARTS = 1500, MAX_LIGHTS = 6, MAX_GUI = 400
const SEP1 = '\x01', SEP2 = '\x02'
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d)

// "v:1,2,3" "c:r,g,b" "u:sx,ox,sy,oy" "b:1" "e:Neon" ... -> valor de JS
export function dec(v) {
  if (typeof v !== 'string') return v
  if (v[1] !== ':') return v
  const body = v.slice(2), n = () => body.split(',').map(Number)
  switch (v[0]) {
    case 'b': return body === '1'
    case 'v': { const a = n(); return { x: a[0], y: a[1], z: a[2] } }
    case 'w': { const a = n(); return { x: a[0], y: a[1] } }
    case 'c': { const a = n(); return { r: a[0], g: a[1], b: a[2] } }
    case 'u': { const a = n(); return { xs: a[0], xo: a[1], ys: a[2], yo: a[3] } }
    case 'd': { const a = n(); return { s: a[0], o: a[1] } }
    case 'e': return { enum: body }
    case 'i': return { inst: Number(body) }
    case 'f': { const a = n(); return { x: a[0], y: a[1], z: a[2], rx: a[3], ry: a[4], rz: a[5] } }
    case 'n': return null
  }
  return v
}
const css = c => `rgb(${Math.round(Math.min(1, Math.max(0, c.r)) * 255)},${Math.round(Math.min(1, Math.max(0, c.g)) * 255)},${Math.round(Math.min(1, Math.max(0, c.b)) * 255)})`
const GUI_CLASSES = new Set(['BillboardGui', 'ScreenGui', 'Frame', 'TextLabel', 'TextButton', 'ImageLabel', 'UICorner', 'UIStroke', 'UIListLayout', 'UIPadding'])
const FONT = { Code: 'ui-monospace,Menlo,Consolas,monospace', RobotoMono: 'ui-monospace,Menlo,Consolas,monospace', Fantasy: 'fantasy', Bangers: 'Impact,fantasy', SciFi: 'Orbitron,sans-serif', Arcade: 'Courier New,monospace' }

export function createScripted({ scene, uiRoot, getMe, solid, world, fire, sfx, onSpawn, setHour, setFog, onSay, project }) {
  const group = new THREE.Group(); scene.add(group)
  const objs = new Map()                    // id -> { id, cls, name, parent, props, mesh?, el?, light? }
  const parts = new Set()                   // piezas con malla
  const watch = new Set()                   // ids de piezas con Touched/TouchEnded conectado
  const touching = new Set()
  const clickables = new Map(), prompts = new Map()
  const layer = document.createElement('div'); layer.className = 'rb-layer'; uiRoot.append(layer)
  const lbEl = document.createElement('div'); lbEl.className = 'rb-lb hidden'; uiRoot.append(lbEl)
  const promptEl = document.createElement('div'); promptEl.className = 'rb-prompt hidden'; uiRoot.append(promptEl)
  const boxGeo = new THREE.BoxGeometry(1, 1, 1), ballGeo = new THREE.SphereGeometry(0.5, 20, 14), cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 22)
  let nLights = 0, nGui = 0, spawnPart = null

  // ---------- piezas ----------
  const MAT = {
    Neon: m => { m.emissive = m.color.clone().multiplyScalar(0.9) }, Glass: m => { m.transparent = true; m.opacity = Math.min(m.opacity, 0.45) },
    Metal: m => { m.color.multiplyScalar(0.85) }, Wood: () => {}, Grass: () => {}, Brick: () => {}, Concrete: () => {},
  }
  function makeMesh(o) {
    const shape = o.props.Shape?.enum
    const mesh = new THREE.Mesh(shape === 'Ball' ? ballGeo : shape === 'Cylinder' ? cylGeo : boxGeo, new THREE.MeshLambertMaterial({ color: '#a3a2a5' }))
    mesh.castShadow = mesh.receiveShadow = true; mesh.userData.id = o.id; group.add(mesh); return mesh
  }
  function paintPart(o) {
    const p = o.props, m = o.mesh, mat = m.material
    const pos = p.Position ?? { x: 0, y: 0, z: 0 }, size = p.Size ?? { x: 4, y: 1, z: 2 }, rot = p.Rot ?? { x: 0, y: 0, z: 0 }
    m.position.set(num(pos.x), num(pos.y), num(pos.z))
    m.scale.set(Math.max(0.05, num(size.x, 1)), Math.max(0.05, num(size.y, 1)), Math.max(0.05, num(size.z, 1)))
    m.rotation.set(num(rot.x) * Math.PI / 180, num(rot.y) * Math.PI / 180, num(rot.z) * Math.PI / 180, 'YXZ')
    const c = p.Color ?? { r: 0.64, g: 0.64, b: 0.65 }; mat.color.setRGB(c.r, c.g, c.b); mat.emissive.set(0x000000)
    const tr = Math.min(1, Math.max(0, num(p.Transparency))); mat.transparent = tr > 0; mat.opacity = 1 - tr; mat.depthWrite = tr < 0.5
    MAT[p.Material?.enum]?.(mat)
    m.visible = tr < 1
    // caja alineada a los ejes para colisiones y toques (con el giro, la caja envolvente)
    const hx = m.scale.x / 2, hy = m.scale.y / 2, hz = m.scale.z / 2
    const e = new THREE.Euler().copy(m.rotation), q = new THREE.Quaternion().setFromEuler(e), mx = new THREE.Matrix4().makeRotationFromQuaternion(q).elements
    const ex = Math.abs(mx[0]) * hx + Math.abs(mx[4]) * hy + Math.abs(mx[8]) * hz, ey = Math.abs(mx[1]) * hx + Math.abs(mx[5]) * hy + Math.abs(mx[9]) * hz, ez = Math.abs(mx[2]) * hx + Math.abs(mx[6]) * hy + Math.abs(mx[10]) * hz
    o.box = [m.position.x - ex, m.position.y - ey, m.position.z - ez, m.position.x + ex, m.position.y + ey, m.position.z + ez]
    o.water = p.Material?.enum === 'Water'; o.collide = p.CanCollide !== false && !o.water
    if (o.water) { mat.transparent = true; mat.opacity = Math.min(mat.opacity, 0.55); mat.color.set('#3aa0e8'); mat.depthWrite = false }
    if (o.cls === 'SpawnLocation' && spawnPart === o) onSpawn?.([m.position.x, o.box[4] + 0.05, m.position.z])
  }

  // ---------- interfaz ----------
  function guiParentEl(o) { let p = objs.get(o.parent); while (p && !p.el) p = objs.get(p.parent); return p?.el ?? layer }
  function paintGui(o, key, val) {
    const el = o.el; if (!el) return
    const s = el.style
    switch (key) {
      case 'Position': if (o.bb) break; s.left = `calc(${val.xs * 100}% + ${val.xo}px)`; s.top = `calc(${val.ys * 100}% + ${val.yo}px)`; break
      case 'Size': if (o.bb) { s.width = `${val.xo || 100}px`; s.height = `${val.yo || 40}px`; break } s.width = `calc(${val.xs * 100}% + ${val.xo}px)`; s.height = `calc(${val.ys * 100}% + ${val.yo}px)`; break
      case 'AnchorPoint': case 'Rotation': {
        const a = o.props.AnchorPoint ?? { x: 0, y: 0 }; s.transform = `translate(${-a.x * 100}%, ${-a.y * 100}%) rotate(${num(o.props.Rotation)}deg)`; break }
      case 'BackgroundColor3': case 'BackgroundTransparency': {
        const c = o.props.BackgroundColor3 ?? { r: 1, g: 1, b: 1 }, a = 1 - Math.min(1, Math.max(0, num(o.props.BackgroundTransparency)))
        s.background = a <= 0 ? 'transparent' : `color-mix(in srgb, ${css(c)} ${Math.round(a * 100)}%, transparent)`; break }
      case 'Visible': s.display = val === false ? 'none' : (o.cls === 'ScreenGui' ? 'block' : ''); break
      case 'Enabled': if (o.cls === 'ScreenGui') s.display = val === false ? 'none' : 'block'; break
      case 'ZIndex': case 'DisplayOrder': s.zIndex = String(num(val) + (key === 'DisplayOrder' ? 0 : 0)); break
      case 'ClipsDescendants': s.overflow = val ? 'hidden' : 'visible'; break
      case 'Text': el.textContent = String(val ?? '').slice(0, 400); break
      case 'TextColor3': case 'TextTransparency': { const c = o.props.TextColor3 ?? { r: 0, g: 0, b: 0 }; s.color = css(c); s.opacity = ''; if (o.props.TextTransparency) s.color = `color-mix(in srgb, ${css(c)} ${Math.round((1 - o.props.TextTransparency) * 100)}%, transparent)`; break }
      case 'TextSize': case 'TextScaled': if (o.props.TextScaled) { s.fontSize = '60cqh'; s.containerType = 'size' } else { s.fontSize = Math.max(6, Math.min(200, num(o.props.TextSize, 14))) + 'px'; s.containerType = '' } break
      case 'TextXAlignment': { const a = val?.enum; s.justifyContent = a === 'Left' ? 'flex-start' : a === 'Right' ? 'flex-end' : 'center'; s.textAlign = a === 'Left' ? 'left' : a === 'Right' ? 'right' : 'center'; break }
      case 'TextYAlignment': { const a = val?.enum; s.alignItems = a === 'Top' ? 'flex-start' : a === 'Bottom' ? 'flex-end' : 'center'; break }
      case 'TextWrapped': s.whiteSpace = val ? 'normal' : 'nowrap'; break
      case 'Font': s.fontFamily = FONT[val?.enum] ?? ''; break
      case 'Image': if (/^https?:/.test(String(val))) {} break
    }
  }
  function applyUiChild(o) {          // UICorner / UIStroke / UIListLayout / UIPadding actúan sobre su padre
    const p = objs.get(o.parent), el = p?.el; if (!el) return
    const pr = o.props
    if (o.cls === 'UICorner') el.style.borderRadius = `${num(pr.CornerRadius?.s) * 50}% / ${num(pr.CornerRadius?.s) * 50}%`, pr.CornerRadius && pr.CornerRadius.s === 0 && (el.style.borderRadius = num(pr.CornerRadius?.o) + 'px')
    else if (o.cls === 'UIStroke') el.style.outline = `${Math.max(0, num(pr.Thickness, 1))}px solid ${css(pr.Color ?? { r: 0, g: 0, b: 0 })}`
    else if (o.cls === 'UIListLayout') { el.style.display = 'flex'; el.style.flexDirection = pr.FillDirection?.enum === 'Horizontal' ? 'row' : 'column'; el.style.gap = num(pr.Padding?.o) + 'px'; for (const c of el.children) c.style.position = 'relative', c.style.left = c.style.top = '' }
    else if (o.cls === 'UIPadding') el.style.padding = `${num(pr.PaddingTop?.o)}px ${num(pr.PaddingRight?.o)}px ${num(pr.PaddingBottom?.o)}px ${num(pr.PaddingLeft?.o)}px`
  }

  // ---------- mensajes del script ----------
  function create(id, cls, parent, packed, name) {
    if (objs.has(id)) return
    const o = { id, cls, name, parent, props: {} }
    for (const kv of String(packed || '').split(SEP1)) { if (!kv) continue; const i = kv.indexOf(SEP2); if (i > 0) o.props[kv.slice(0, i)] = dec(kv.slice(i + 1)) }
    objs.set(id, o)
    if (cls === 'Part' || cls === 'SpawnLocation' || cls === 'WedgePart' || cls === 'MeshPart' || cls === 'TrussPart') {
      if (parts.size >= MAX_PARTS) { objs.delete(id); return }
      o.mesh = makeMesh(o); parts.add(o); if (cls === 'SpawnLocation') spawnPart = o; paintPart(o)
    } else if (cls === 'PointLight' || cls === 'SpotLight' || cls === 'SurfaceLight') {
      const host = objs.get(parent); if (host?.mesh && nLights < MAX_LIGHTS) { nLights++; o.light = new THREE.PointLight('#ffffff', 1, 12, 1.6); host.mesh.add(o.light); o.light.scale.set(1 / host.mesh.scale.x, 1 / host.mesh.scale.y, 1 / host.mesh.scale.z); paintLight(o) }
    } else if (cls === 'ClickDetector') {
      const host = objs.get(parent); if (host?.mesh) clickables.set(host.id, num(o.props.MaxActivationDistance, 32))
    } else if (cls === 'ProximityPrompt') {
      const host = objs.get(parent); if (host?.mesh) prompts.set(host.id, { o, hold: 0 })
    } else if (GUI_CLASSES.has(cls)) {
      if (nGui >= MAX_GUI) { objs.delete(id); return }
      nGui++
      if (cls.startsWith('UI') && cls !== 'UI') { applyUiChild(o); return }
      const el = document.createElement(cls === 'TextButton' ? 'button' : 'div'); el.className = 'rb-el rb-' + cls.toLowerCase(); o.el = el
      if (cls === 'BillboardGui') { o.bb = true; el.style.display = 'none' }
      if (cls === 'TextButton') el.addEventListener('click', () => fire('guiclick', { id }))
      guiParentEl(o).append(el)
      for (const k of Object.keys(o.props)) paintGui(o, k, o.props[k])
      if (cls === 'ScreenGui') { el.style.display = o.props.Enabled === false ? 'none' : 'block' }
    }
    if (watch.has(id)) { /* ya vigilada */ }
  }
  function paintLight(o) {
    const p = o.props; if (!o.light) return
    const c = p.Color ?? { r: 1, g: 1, b: 1 }; o.light.color.setRGB(c.r, c.g, c.b); o.light.intensity = p.Enabled === false ? 0 : Math.min(8, num(p.Brightness, 1) * 2); o.light.distance = Math.min(40, num(p.Range, 12))
  }
  function removeObj(id) {
    const o = objs.get(id); if (!o) return
    for (const c of [...objs.values()]) if (c.parent === id) removeObj(c.id)
    if (o.mesh) { group.remove(o.mesh); o.mesh.material.dispose(); parts.delete(o); touching.delete(id); watch.delete(id); clickables.delete(id); prompts.delete(id); if (spawnPart === o) spawnPart = null }
    if (o.light) { o.light.parent?.remove(o.light); nLights = Math.max(0, nLights - 1) }
    if (o.el) { o.el.remove(); nGui = Math.max(0, nGui - 1) } else if (GUI_CLASSES.has(o.cls)) nGui = Math.max(0, nGui - 1)
    if (o.cls === 'ClickDetector') clickables.delete(o.parent); if (o.cls === 'ProximityPrompt') prompts.delete(o.parent)
    objs.delete(id)
  }
  const boards = new Map()          // jugador -> Map(stat -> valor)
  function paintBoard() {
    if (!boards.size) { lbEl.classList.add('hidden'); return }
    const stats = [...new Set([...boards.values()].flatMap(m => [...m.keys()]))].slice(0, 4)
    lbEl.replaceChildren(...[...boards.entries()].slice(0, 14).map(([name, m]) => { const r = document.createElement('div'); r.className = 'rb-lb-row'; const n = document.createElement('b'); n.textContent = name; r.append(n, ...stats.map(s => { const v = document.createElement('span'); v.textContent = String(m.get(s) ?? ''); v.title = s; return v })); return r }))
    lbEl.classList.remove('hidden')
  }

  function apply(type, a) {
    switch (type) {
      case 'new': create(num(a[0]), String(a[1]), num(a[2]), a[3], String(a[4] ?? '')); break
      case 'prop': {
        const o = objs.get(num(a[0])); if (!o) break
        const key = String(a[1]), val = dec(a[2]); o.props[key] = val
        if (o.mesh) { if (key === 'Position' || key === 'Anchored' || key === 'Size') falling.delete(o.id); paintPart(o); if (key === 'Shape') { o.mesh.geometry = val?.enum === 'Ball' ? ballGeo : val?.enum === 'Cylinder' ? cylGeo : boxGeo } }
        else if (o.light) paintLight(o)
        else if (o.el) paintGui(o, key, val)
        else if (o.cls.startsWith('UI')) applyUiChild(o)
        else if (o.cls === 'ClickDetector') { if (key === 'MaxActivationDistance') clickables.set(o.parent, num(val, 32)) }
        break
      }
      case 'parent': { const o = objs.get(num(a[0])); if (!o) break; o.parent = num(a[1]); if (o.el) guiParentEl(o).append(o.el); break }
      case 'del': removeObj(num(a[0])); break
      case 'touch': watch.add(num(a[0])); break
      case 'spawnpoint': { const o = objs.get(num(a[0])); if (o?.mesh) { spawnPart = o; paintPart(o) } break }
      case 'lb': { const n = String(a[0]), s = String(a[1]); if (!boards.has(n)) boards.set(n, new Map()); boards.get(n).set(s, a[2]); paintBoard(); break }
      case 'hour': setHour?.(num(a[0], 12)); break
      case 'fog': setFog?.(num(a[0], 100000)); break
    }
  }

  // ---------- por fotograma ----------
  const overlaps = (b, o, e = 0) => b[0] < o[3] + e && b[3] > o[0] - e && b[1] < o[4] + e && b[4] > o[1] - e && b[2] < o[5] + e && b[5] > o[2] - e
  const meBox = () => { const p = getMe(); return [p.x - 0.3, p.y, p.z - 0.3, p.x + 0.3, p.y + 1.8, p.z + 0.3] }
  function collides(px, py, pz, R = 0.3) {
    if (!parts.size) return false
    const b = [px - R, py + 0.02, pz - R, px + R, py + 1.78, pz + R]
    for (const o of parts) if (o.collide && o.mesh.visible && overlaps(b, o.box)) return true
    return false
  }
  // agua (Material.Water) y escaleras (nombre que empieza por Ladder / Climb, TrussPart o "climb" del Studio)
  const inBox = (o, x, y, z, e = 0) => x > o.box[0] - e && x < o.box[3] + e && y > o.box[1] - e && y < o.box[4] + e && z > o.box[2] - e && z < o.box[5] + e
  const inWater = (x, y, z) => { for (const o of parts) if (o.water && inBox(o, x, y + 0.9, z)) return true; return false }
  const climbable = (x, y, z) => { for (const o of parts) if ((o.cls === 'TrussPart' || o.climb || /^(ladder|climb)/i.test(o.name ?? '')) && inBox(o, x, y + 0.9, z, 0.45)) return true; return false }
  const falling = new Map()
  function step(dt) {
    // piezas sueltas (Anchored = false): caen hasta el suelo o un bloque (y avisan al script de dónde se quedan)
    for (const o of parts) {
      if (o.props.Anchored !== false) continue
      const f = falling.get(o.id) ?? { v: 0, done: false }; if (f.done) continue
      const m = o.mesh, hy = m.scale.y / 2; f.v = Math.min(60, f.v + 24 * dt)
      let y = m.position.y - f.v * dt, ground = world.floor ? 0 : -Infinity
      const cx = Math.floor(m.position.x), cz = Math.floor(m.position.z)
      for (let by = Math.floor(m.position.y - hy); by >= Math.max(-1, Math.floor(y - hy)); by--) if (solid(cx, by, cz)) { ground = Math.max(ground, by + 1); break }
      let landed = false
      if (y - hy <= ground) { y = ground + hy; landed = true }
      if (y < -300) { y = -300; landed = true }
      m.position.y = y; o.props.Position = { x: m.position.x, y, z: m.position.z }; paintPart(o)
      if (landed) { f.done = true; fire('partpos', { id: o.id, x: m.position.x, y, z: m.position.z }) }
      falling.set(o.id, f)
    }
    // toques
    if (watch.size) {
      const mb = meBox()
      for (const id of watch) {
        const o = objs.get(id); if (!o?.mesh || o.props.CanTouch === false) continue
        const hit = overlaps(mb, o.box, 0.06)
        if (hit && !touching.has(id)) { touching.add(id); fire('touch', { id, on: 1 }) }
        else if (!hit && touching.has(id)) { touching.delete(id); fire('touch', { id, on: 0 }) }
      }
    }
    // BillboardGui: carteles que siguen a una pieza
    if (project) for (const o of objs.values()) {
      if (!o.bb) continue
      const host = objs.get(o.props.Adornee?.inst) ?? objs.get(o.parent); if (!host?.mesh || o.props.Enabled === false) { o.el.style.display = 'none'; continue }
      const off = o.props.StudsOffset ?? { x: 0, y: 2, z: 0 }, m = host.mesh.position, pr = project(m.x + off.x, m.y + off.y + host.mesh.scale.y / 2, m.z + off.z)
      if (!pr.visible || pr.dist > 45) { o.el.style.display = 'none'; continue }
      o.el.style.display = 'block'; o.el.style.left = pr.x + 'px'; o.el.style.top = pr.y + 'px'; o.el.style.transform = 'translate(-50%, -100%)'
    }
    // avisos de proximidad (tecla E)
    let best = null, bd = 1e9; const me = getMe()
    for (const [pid, pr] of prompts) {
      const o = objs.get(pid); if (!o?.mesh || pr.o.props.Enabled === false) continue
      const d = Math.hypot(o.mesh.position.x - me.x, o.mesh.position.y - me.y - 0.9, o.mesh.position.z - me.z) - Math.max(o.mesh.scale.x, o.mesh.scale.z) / 2
      if (d <= num(pr.o.props.MaxActivationDistance, 10) && d < bd) { bd = d; best = { pid, pr } }
    }
    if (best) {
      const pp = best.pr.o.props; promptEl.classList.remove('hidden'); active = best
      const txt = `<kbd>E</kbd> ${String(pp.ActionText ?? 'Interactuar').replace(/[<>&]/g, '')}${pp.ObjectText ? `<small>${String(pp.ObjectText).replace(/[<>&]/g, '')}</small>` : ''}`
      if (promptEl.dataset.k !== txt) { promptEl.innerHTML = txt; promptEl.dataset.k = txt }
      if (holding) { holdT += dt; const need = num(pp.HoldDuration, 0); promptEl.style.setProperty('--hold', need > 0 ? Math.min(1, holdT / need) : 1); if (holdT >= need) { holding = false; holdT = 0; promptEl.style.setProperty('--hold', 0); fire('prompt', { id: best.pid }) } }
    } else { promptEl.classList.add('hidden'); active = null; holding = false; holdT = 0 }
  }
  let active = null, holding = false, holdT = 0
  // tecla E del aviso de proximidad (devuelve true si la consume)
  function onKey(code, down) {
    if (code !== 'KeyE' || !active) return false
    if (down) { holding = true; holdT = 0 } else { holding = false; holdT = 0; promptEl.style.setProperty('--hold', 0) }
    return true
  }
  // clic en el mundo: pieza con ClickDetector a su alcance
  const ray = new THREE.Raycaster()
  function click(ndc, camera) {
    if (!clickables.size) return false
    ray.setFromCamera(ndc, camera)
    const meshes = [...clickables.keys()].map(id => objs.get(id)?.mesh).filter(Boolean)
    const hit = ray.intersectObjects(meshes, false)[0]; if (!hit) return false
    const id = hit.object.userData.id, me = getMe(), p = hit.object.position
    if (Math.hypot(p.x - me.x, p.y - me.y, p.z - me.z) > (clickables.get(id) ?? 32) + Math.max(hit.object.scale.x, hit.object.scale.z)) return false
    fire('click', { id }); return true
  }
  function reset() {
    for (const id of [...objs.keys()]) removeObj(id)
    boards.clear(); paintBoard(); watch.clear(); touching.clear(); falling.clear(); promptEl.classList.add('hidden'); spawnPart = null
  }
  // piezas hechas en el Studio (sin script Lua): son decoración sólida
  function spawnStatic(list = []) {
    let id = -1, i = 0
    for (const p of list.slice(0, 300)) {
      const pk = { Position: `v:${num(p.x)},${num(p.y)},${num(p.z)}`, Size: `v:${num(p.sx, 4)},${num(p.sy, 1)},${num(p.sz, 2)}`, Color: `c:${hexRgb(p.color)}`, Anchored: 'b:1', CanCollide: p.collide === false ? 'b:0' : 'b:1', Transparency: num(p.transparency), Shape: `e:${p.shape || 'Block'}`, Material: `e:${p.material || 'Plastic'}`, Rot: `v:0,${num(p.ry)},0` }
      create(id, p.type === 'spawn' ? 'SpawnLocation' : 'Part', 0, Object.entries(pk).map(([k, v]) => k + SEP2 + v).join(SEP1), String(p.name ?? 'Part'))
      const o = objs.get(id); if (o) { o.sidx = i; o.climb = !!p.climb }; id--; i++
    }
  }
  const partAt = i => { for (const o of parts) if (o.sidx === i) return o; return null }
  function pickPart(ndc, camera) {
    const meshes = [...parts].filter(o => o.sidx !== undefined && o.mesh.visible).map(o => o.mesh); if (!meshes.length) return -1
    ray.setFromCamera(ndc, camera); const hit = ray.intersectObjects(meshes, false)[0]
    return hit ? (objs.get(hit.object.userData.id)?.sidx ?? -1) : -1
  }
  const hexRgb = hex => { const c = new THREE.Color(hex || '#a3a2a5'); return `${c.r},${c.g},${c.b}` }
  function dispose() { reset(); scene.remove(group); layer.remove(); lbEl.remove(); promptEl.remove(); boxGeo.dispose(); ballGeo.dispose(); cylGeo.dispose() }
  return { apply, step, collides, inWater, climbable, onKey, click, reset, spawnStatic, partAt, pickPart, dispose, get count() { return parts.size }, get parts() { return parts } }
}
