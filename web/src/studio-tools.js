// Herramientas del Studio (editor del dueño del juego): colocar/borrar/pintar, cuentagotas, cajas, selección con copiar/pegar,
// estructuras prefabricadas, deshacer/rehacer, piezas (Part) con propiedades y panel de entorno.
import * as THREE from 'three'
import { t, getLang } from './i18n.js'
import { checkLua, checkSyntax } from './script.js'
import { gameInfoEditor } from './gamepage-edit.js'
import { setKids as setKids_, closeModal as closeModal_ } from './pages.js'
import { createDocks, tabbed, category, prop } from './studio-dock.js'
import { scriptConsole } from './script-console.js'
import { icon } from './icons.js'
import { PRESET_HOUR } from './sky.js'
import * as music from './music.js'
import { listComponents, addComponent, removeComponent, renameComponent, packParts, unpackParts, exportComponents, importComponents } from './components.js'
import { buildAnimator } from './animator.js'
import { styleFor } from './avatar.js'

const MAX_VOL = 6000                      // bloques por operación
const SEND_CHUNK = 400
const MAX_PARTS = 300
const clampI = (v, a, b) => Math.max(a, Math.min(b, Math.round(v)))
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) { if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v) }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c)))
  return e
}

// ---------- estructuras prefabricadas: listas [dx, dy, dz, color] con el origen en el centro del suelo ----------
const B = (a, x0, y0, z0, x1, y1, z1, k, hollow = false) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) { if (hollow && x > x0 && x < x1 && y > y0 && y < y1 && z > z0 && z < z1) continue; a.push([x, y, z, k]) } }
const cut = (a, f) => a.filter(b => !f(b[0], b[1], b[2]))
export const PREFABS = {
  house: k => { let a = []; B(a, -3, 0, -3, 3, 0, 3, 9); B(a, -3, 1, -3, 3, 3, 3, k, true); a = cut(a, (x, y, z) => x === 0 && z === 3 && y >= 1 && y <= 2); a = cut(a, (x, y, z) => y === 2 && (Math.abs(x) === 3 && z === 0 || Math.abs(z) === 3 && Math.abs(x) === 2)); B(a, -3, 4, -3, 3, 4, 3, 1); B(a, -2, 5, -2, 2, 5, 2, 1); B(a, -1, 6, -1, 1, 6, 1, 1); return a },
  tower: k => { let a = []; B(a, -2, 0, -2, 2, 11, 2, k, true); B(a, -2, 12, -2, 2, 12, 2, 10); for (const [x, z] of [[-2, -2], [0, -2], [2, -2], [-2, 0], [2, 0], [-2, 2], [0, 2], [2, 2]]) a.push([x, 13, z, 10]); a = cut(a, (x, y, z) => x === 0 && z === 2 && y >= 0 && y <= 2); for (let y = 0; y < 12; y += 4) a = cut(a, (x, yy, z) => yy === y + 3 && x === 0 && z === -2); return a },
  bridge: k => { const a = []; B(a, -1, 0, 0, 1, 0, 11, 9); for (let z = 0; z <= 11; z += 2) { a.push([-1, 1, z, k], [1, 1, z, k]) } return a },
  wall: k => { const a = []; B(a, -5, 0, 0, 5, 2, 0, k); for (let x = -5; x <= 5; x += 2) a.push([x, 3, 0, k]); return a },
  stairs: k => { const a = []; for (let i = 0; i < 8; i++) B(a, -1, i, i, 1, i, i, i % 2 ? k : 0); return a },
  pyramid: k => { const a = []; for (let i = 0; i < 6; i++) B(a, -5 + i, i, -5 + i, 5 - i, i, 5 - i, i % 2 ? 6 : k); return a },
  tree: () => { const a = []; B(a, 0, 0, 0, 0, 3, 0, 9); B(a, -2, 4, -2, 2, 5, 2, 3); B(a, -1, 6, -1, 1, 6, 1, 3); a.push([0, 7, 0, 3]); return cut(a, (x, y, z) => y >= 4 && y <= 5 && Math.abs(x) === 2 && Math.abs(z) === 2) },
  arch: k => { const a = []; B(a, -3, 0, 0, -2, 5, 0, k); B(a, 2, 0, 0, 3, 5, 0, k); B(a, -3, 6, 0, 3, 7, 0, k); return a },
  platform: k => { const a = []; B(a, -4, 0, -4, 3, 0, 3, k); return a },
  fence: k => { const a = []; for (let x = -5; x <= 5; x++) { a.push([x, 0, 0, 9]); if (x % 2 === 0) a.push([x, 1, 0, 9]); } B(a, -5, 1, 0, 5, 1, 0, 9); return a.map(b => b) },
}
const rotate = (list, r) => list.map(([x, y, z, k]) => { for (let i = 0; i < r; i++) [x, z] = [-z, x]; return [x, y, z, k] })
const SHAPES = ['Block', 'Ball', 'Cylinder'], MATERIALS = ['Plastic', 'Neon', 'Glass', 'Metal', 'Wood', 'Grass', 'Brick', 'Concrete', 'Water']
const SKIES = ['day', 'dawn', 'sunset', 'night', 'space']

export function createStudio(ctx) {
  const { game, cfg, api, PALETTE, key, index, statics, setBlock, removeBlock, me, pick, scene, camera, canvas, rbx, showTitle, sys, sfx, burst, selectKind, onEnv, onTestToggle, onSave, onExit, onScript, refreshEmotes, onAddText, setUiTool, getHover, getConfig, captureThumb } = ctx
  const g = document.getElementById('game'), bar = document.getElementById('studio-bar')
  const docks = createDocks(g); docks.top.append(bar)
  let selNode = 'part'                                                   // elemento del Explorer que no es una pieza: game | workspace | lighting | script | terrain | ui:<id>
  let leftTabs = null, rightTabs = null, exHost = null, propsHost = null, verHost = null, outHost = null
  const state = { terrR: 4, terrH: 4, terrMode: 'raise', tool: 'place', mode: 'fill', shape: 'sphere', sym: 'off', grid: 0.5, prefab: 'house', rot: 0, a: null, region: null, clip: null }
  const undoS = [], redoS = []
  const parts = cfg.parts = Array.isArray(cfg.parts) ? cfg.parts.slice(0, MAX_PARTS).map(p => ({ ...p })) : []
  let selPart = -1, partClip = null, dragPart = null
  const multi = new Set()                                               // piezas marcadas con Mayús+clic (además de la principal)
  const snap = v => (state.grid > 0 ? Math.round(v / state.grid) * state.grid : v)
  const groupOf = i => { const g = parts[i]?.group; return g ? parts.map((p, k) => (p.group === g ? k : -1)).filter(k => k >= 0) : [i] }
  const targets = i => [...new Set((multi.has(i) || i === selPart ? [i, ...multi] : [i]).flatMap(groupOf))].filter(k => parts[k])
  const movePart = (i, dx, dy, dz) => { for (const k of targets(i).filter(k => !parts[k].locked)) { const q = parts[k]; q.x = +(q.x + dx).toFixed(3); q.y = +(q.y + dy).toFixed(3); q.z = +(q.z + dz).toFixed(3) } }

  // ---------- operaciones con bloques (todas pasan por aquí: local al instante, servidor en lotes, con deshacer) ----------
  const kindAt = (x, y, z) => { const k = key(x, y, z); if (statics.has(k)) return 'S'; return index.get(k)?.kind ?? -1 }
  let pending = new Map(), sendT = 0, sendBusy = false
  function enqueue(x, y, z, to) { pending.set(key(x, y, z), [x, y, z, to]); if (!sendT) sendT = setTimeout(flush, 120) }
  async function flush() {
    sendT = 0; if (sendBusy) { sendT = setTimeout(flush, 200); return }
    sendBusy = true
    try { while (pending.size) { const batch = [...pending.values()].slice(0, SEND_CHUNK); for (const b of batch) pending.delete(key(b[0], b[1], b[2])); await api.placeBlocks(game.id, batch) } }
    catch (e) { sys(e.message) } finally { sendBusy = false }
  }
  // simetría: copia cada cambio al otro lado del eje 0 (x o z)
  const mirrorOps = ops => {
    if (state.sym === 'off') return ops
    const out = [...ops]
    for (const o of ops) { if (state.sym !== 'z') out.push({ ...o, x: -o.x - 1 }); if (state.sym !== 'x') out.push({ ...o, z: -o.z - 1 }); if (state.sym === 'xz') out.push({ ...o, x: -o.x - 1, z: -o.z - 1 }) }
    return out
  }
  function commit(ops, record = true) {
    if (record) ops = mirrorOps(ops)
    const real = []
    for (const o of ops) {
      if (o.y < 0 || o.y > 255 || Math.abs(o.x) > 4000 || Math.abs(o.z) > 4000) continue
      const from = kindAt(o.x, o.y, o.z); if (from === 'S' || from === o.to) continue
      real.push({ x: o.x, y: o.y, z: o.z, from, to: o.to })
    }
    if (!real.length) return 0
    for (const o of real) { if (o.to < 0) { if (real.length < 40) burst(o.x, o.y, o.z, PALETTE[o.from] ?? '#fff', 4); removeBlock(o.x, o.y, o.z) } else setBlock(o.x, o.y, o.z, o.to); enqueue(o.x, o.y, o.z, o.to) }
    if (record) { undoS.push(real); if (undoS.length > 80) undoS.shift(); redoS.length = 0 }
    paintHistory(); emit('edit'); return real.length
  }
  function undo() { const ops = undoS.pop(); if (!ops) return; redoS.push(ops); commit(ops.map(o => ({ x: o.x, y: o.y, z: o.z, to: o.from })).reverse(), false); paintHistory(); sfx.click() }
  function redo() { const ops = redoS.pop(); if (!ops) return; undoS.push(ops); commit(ops.map(o => ({ x: o.x, y: o.y, z: o.z, to: o.to })), false); paintHistory(); sfx.click() }

  const boxCells = (a, b, mode, kind) => {
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]), z0 = Math.min(a[2], b[2]), z1 = Math.max(a[2], b[2])
    const n = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1); if (n > MAX_VOL) { showTitle(t('st_big', { n: MAX_VOL }), 2200); return [] }
    const out = []
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      if (mode === 'hollow' && x > x0 && x < x1 && y > y0 && y < y1 && z > z0 && z < z1) continue
      out.push({ x, y, z, to: mode === 'erase' ? -1 : kind })
    }
    return out
  }
  // formas: esfera / esfera hueca / cilindro inscritos en la caja entre dos esquinas
  const shapeCells = (a, b, mode, kind) => {
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]), z0 = Math.min(a[2], b[2]), z1 = Math.max(a[2], b[2])
    if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > MAX_VOL) { showTitle(t('st_big', { n: MAX_VOL }), 2200); return [] }
    const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, cz = (z0 + z1 + 1) / 2, rx = (x1 - x0 + 1) / 2, ry = (y1 - y0 + 1) / 2, rz = (z1 - z0 + 1) / 2, out = []
    const d2 = (x, y, z, ax, ay, az) => ((x + 0.5 - cx) / ax) ** 2 + (ay ? ((y + 0.5 - cy) / ay) ** 2 : 0) + ((z + 0.5 - cz) / az) ** 2
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      let on
      if (mode === 'cylinder') on = d2(x, y, z, rx, 0, rz) <= 1
      else { on = d2(x, y, z, rx, ry, rz) <= 1; if (on && mode === 'hollowsphere' && rx > 1.5 && ry > 1.5 && rz > 1.5) on = d2(x, y, z, rx - 1, ry - 1, rz - 1) > 1 }
      if (on) out.push({ x, y, z, to: kind })
    }
    return out
  }
  const lineCells = (a, b, kind) => {
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2]), 1), out = []
    for (let i = 0; i <= n && i <= 400; i++) out.push({ x: Math.round(a[0] + (b[0] - a[0]) * i / n), y: Math.round(a[1] + (b[1] - a[1]) * i / n), z: Math.round(a[2] + (b[2] - a[2]) * i / n), to: kind })
    return out
  }
  const MY_KEY = 'blocksy.prefabs'
  const myPrefabs = () => { try { const o = JSON.parse(localStorage.getItem(MY_KEY) || '{}'); return o && typeof o === 'object' ? o : {} } catch { return {} } }
  const saveMyPrefabs = o => { try { localStorage.setItem(MY_KEY, JSON.stringify(o)) } catch { showTitle(t('st_storage_full'), 2000) } }
  const prefabList = () => (state.prefab === 'clip' ? (state.clip ?? []) : state.prefab.startsWith('my:') ? (myPrefabs()[state.prefab.slice(3)] ?? []) : PREFABS[state.prefab]?.(me.kind) ?? [])

  // ---------- ayudas visuales: caja de región y vista previa de la estructura ----------
  const wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x4dd0ff, depthTest: false })); wire.visible = false; wire.renderOrder = 5; scene.add(wire)
  const stampGeo = new THREE.BoxGeometry(1, 1, 1), stampMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false })
  const stamp = new THREE.InstancedMesh(stampGeo, stampMat, 2500); stamp.count = 0; stamp.frustumCulled = false; stamp.visible = false; scene.add(stamp)
  const selWire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffd34d, depthTest: false })); selWire.visible = false; selWire.renderOrder = 6; scene.add(selWire)
  const setWire = (a, b) => { const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]) + 1, y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]) + 1, z0 = Math.min(a[2], b[2]), z1 = Math.max(a[2], b[2]) + 1; wire.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); wire.scale.set(x1 - x0 + 0.02, y1 - y0 + 0.02, z1 - z0 + 0.02); wire.visible = true }
  // rejilla visible alrededor del jugador y herramienta de medir
  const gridHelper = new THREE.GridHelper(64, 64, 0x4dd0ff, 0x4dd0ff); gridHelper.material.transparent = true; gridHelper.material.opacity = 0.28; gridHelper.material.depthWrite = false; gridHelper.visible = false; gridHelper.position.y = 0.02; scene.add(gridHelper)
  const measureLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffd34d, depthTest: false })); measureLine.visible = false; measureLine.renderOrder = 7; scene.add(measureLine)
  function measure(a, b) {
    const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]), dz = Math.abs(b[2] - a[2])
    measureLine.geometry.setFromPoints([new THREE.Vector3(a[0] + .5, a[1] + .5, a[2] + .5), new THREE.Vector3(b[0] + .5, b[1] + .5, b[2] + .5)]); measureLine.visible = true
    showTitle(t('st_measure_res', { x: dx, y: dy, z: dz, d: Math.hypot(dx, dy, dz).toFixed(1) }), 3500)
  }
  const m4 = new THREE.Matrix4(), c3 = new THREE.Color()
  function showStamp(origin) {
    const list = rotate(prefabList(), state.rot).slice(0, 2500); stamp.count = list.length
    list.forEach(([x, y, z, k], i) => { m4.makeTranslation(origin[0] + x + 0.5, origin[1] + y + 0.5, origin[2] + z + 0.5); stamp.setMatrixAt(i, m4); stamp.setColorAt(i, c3.set(PALETTE[k % PALETTE.length])) })
    stamp.instanceMatrix.needsUpdate = true; if (stamp.instanceColor) stamp.instanceColor.needsUpdate = true; stamp.visible = list.length > 0
  }

  // ---------- piezas (Part): guardadas en config.parts ----------
  let testing = false
  let bottomTabs = null, animator = null
  const animEnv = { parts, cfg, game, getSel: () => selPart, refreshParts: () => refreshParts(), showTitle, rbx, refreshEmotes, onScriptChanged: () => paintExplorer(), style: () => styleFor('Blocksy', '#4da6ff') }
  const applyHidden = () => { for (let i = 0; i < parts.length; i++) { const o = rbx.partAt(i); if (o?.mesh) o.mesh.visible = testing || !parts[i].eh } }       // eh = oculta solo en el editor
  const refreshParts = () => { cfg.parts = parts; game.config = { ...(game.config ?? {}), parts }; rbx.reset(); rbx.spawnStatic(parts); applyHidden(); updateSelBox(); paintExplorer() }
  // ---------- Explorer: árbol del juego como en Roblox Studio ----------
  const open = new Set(['game', 'workspace', 'gui']); let exFilter = ''
  const ICON = { game: 'globe', workspace: 'box', terrain: 'mountain', model: 'cube', part: 'cube', ball: 'sphere', spawn: 'flag', lighting: 'sliders', scripts: 'code', script: 'code', gui: 'chat', ui: 'chat' }
  const ctxMenu = (e, items) => {
    e.preventDefault(); document.getElementById('st-ctx')?.remove()
    const m = h('div', { id: 'st-ctx' }, items.map(it => (it === '-' ? h('hr') : h('div', { text: it[0], onclick: () => { m.remove(); it[1]() } }))))
    m.style.left = Math.min(e.clientX, innerWidth - 180) + 'px'; m.style.top = Math.min(e.clientY, innerHeight - 220) + 'px'; document.body.append(m)
    const off = ev => { if (ev?.target && m.contains(ev.target)) return; m.remove(); removeEventListener('pointerdown', off, true) }; setTimeout(() => addEventListener('pointerdown', off, true), 0)
  }
  const nextName = base => { let n = 1; while (parts.some(p => p.name === base + n)) n++; return base + n }
  function groupSelected() {
    const idx = [selPart, ...multi].filter(i => parts[i]); if (!idx.length) return
    const name = (prompt(t('st_group_name'), nextName('Model')) ?? '').replace(/[^\w]/g, '').slice(0, 16); if (!name) return
    for (const i of idx) parts[i].group = name
    open.add('m:' + name); refreshParts(); paintProps()
  }
  function ungroupSelected() { for (const i of [selPart, ...multi]) if (parts[i]) delete parts[i].group; refreshParts(); paintProps() }
  function duplicateSelected() {
    const src = [selPart, ...multi].filter(i => parts[i]); const made = []
    for (const i of src) { if (parts.length >= MAX_PARTS) break; parts.push({ ...parts[i], name: parts[i].name.replace(/\d*$/, '') + (parts.length + 1), x: parts[i].x + 1, z: parts[i].z + 1 }); made.push(parts.length - 1) }
    if (made.length) { selPart = made[0]; multi.clear(); made.slice(1).forEach(i => multi.add(i)); refreshParts(); paintProps(); sfx.place() }
  }
  const focusPart = i => { const q = parts[i]; if (!q) return; me.pos.set(q.x + 5, q.y + 3, q.z + 5); me.vel?.set?.(0, 0, 0) }
  function pickPartNode(i, e) {
    selNode = 'part'
    if (e?.shiftKey || e?.ctrlKey || e?.metaKey) { if (i === selPart) { selPart = [...multi][0] ?? -1; multi.delete(selPart) } else if (!multi.delete(i)) { if (selPart < 0) selPart = i; else multi.add(i) } }
    else { selPart = i; multi.clear() }
    if (state.tool !== 'part') setTool('part'); updateSelBox(); paintProps(); paintExplorer(); rightTabs?.set('props')
  }
  function pickNode(id) {
    selNode = id; selPart = -1; multi.clear(); updateSelBox()
    if (id === 'lighting' || id === 'workspace') rightTabs?.set('env'); else if (id === 'game') rightTabs?.set('game'); else if (id === 'script') onScript(); else if (id === 'terrain') { showTitle(t('st_hint_terrain'), 2200); setTool('terrain'); rightTabs?.set('props') }
    else if (id.startsWith('ui:')) { setTool('ui'); ctx.selectUi?.(id.slice(3)); rightTabs?.set('props') } else rightTabs?.set('props')
    paintProps(); paintExplorer()
  }
  function paintExplorer() {
    if (!exHost?.isConnected || leftTabs?.cur !== 'explorer' || !exHost.querySelector('.ex-tree')) return
    const q = exFilter.trim().toLowerCase(), rows = []
    const row = (id, depth, o) => {
      const caret = o.children ? h('span', { class: 'ex-caret', text: open.has(id) ? '▾' : '▸', onclick: e => { e.stopPropagation(); open.has(id) ? open.delete(id) : open.add(id); paintExplorer() } }) : h('span', { class: 'ex-caret' })
      const nm = h('span', { class: 'ex-name', text: o.name }), r = h('div', { class: 'ex-node' + (o.sel ? ' sel' : ''), style: `padding-left:${4 + depth * 14}px`, draggable: !!o.drag, onclick: o.click, oncontextmenu: o.menu ? e => o.menu(e) : null },
        caret, h('span', { class: 'ex-ico', html: icon(o.icon, 14) }), nm, o.flags ? h('span', { class: 'ex-flags', text: o.flags }) : null, o.count != null ? h('span', { class: 'ex-count', text: String(o.count) }) : null)
      if (o.rename) nm.ondblclick = e => { e.stopPropagation(); const inp = h('input', { class: 'ex-rename', value: o.name, maxlength: 24 }); nm.replaceWith(inp); inp.focus(); inp.select(); const done = () => o.rename(inp.value); inp.onblur = done; inp.onkeydown = ev => { if (ev.key === 'Enter') inp.blur(); else if (ev.key === 'Escape') { inp.onblur = null; paintExplorer() } ev.stopPropagation() } }
      if (o.drag) r.ondragstart = e => { e.dataTransfer.setData('text/plain', 'part'); e.dataTransfer.effectAllowed = 'move'; if (!(i_in(o.drag) )) { selPart = o.drag; multi.clear() } }
      if (o.drop) { r.ondragover = e => { e.preventDefault(); r.classList.add('drop') }; r.ondragleave = () => r.classList.remove('drop'); r.ondrop = e => { e.preventDefault(); r.classList.remove('drop'); o.drop() } }
      rows.push(r)
    }
    const i_in = i => i === selPart || multi.has(i)
    const partRow = (i, depth) => {
      const p = parts[i], isSel = i_in(i)
      row('p' + i, depth, { icon: p.type === 'spawn' ? ICON.spawn : p.shape === 'Ball' ? ICON.ball : ICON.part, name: p.name, sel: isSel && selNode === 'part', flags: (p.locked ? '⚿ ' : '') + (p.eh ? '◌' : ''), drag: i, rename: v => { const n = String(v).replace(/[^\w ]/g, '').slice(0, 24).trim(); if (n) p.name = n; refreshParts(); paintProps() }, click: e => pickPartNode(i, e),
        menu: e => { if (!i_in(i)) { selPart = i; multi.clear(); selNode = 'part'; updateSelBox(); paintProps(); paintExplorer() } ctxMenu(e, [[t('cm_rename'), () => { selPart = i; paintExplorer() }], [t('st_dup') + ' (Ctrl+D)', duplicateSelected], [t('cm_group') + ' (Ctrl+G)', groupSelected], [t('cm_ungroup') + ' (Ctrl+U)', ungroupSelected], '-', [p.locked ? t('cm_unlock') : t('st_lock'), () => { for (const k of [selPart, ...multi]) if (parts[k]) parts[k].locked = !p.locked; refreshParts(); paintProps() }], [p.eh ? t('cm_show') : t('st_hide'), () => { for (const k of [selPart, ...multi]) if (parts[k]) parts[k].eh = !p.eh; refreshParts(); paintProps() }], [t('cm_focus') + ' (F)', () => focusPart(i)], '-', [t('st_del_part') + ' (Del)', deleteSelected]]) } })
    }
    const dropTo = group => () => { const mv = new Set([selPart, ...multi]); for (const k of mv) if (parts[k]) { if (group) parts[k].group = group; else delete parts[k].group } if (group) open.add('m:' + group); refreshParts(); paintProps() }
    row('game', 0, { icon: ICON.game, name: game.name || 'Game', sel: selNode === 'game' && selPart < 0, children: true, click: () => pickNode('game') })
    if (open.has('game')) {
      row('workspace', 1, { icon: ICON.workspace, name: 'Workspace', sel: selNode === 'workspace', children: true, drop: dropTo(''), click: () => pickNode('workspace') })
      if (open.has('workspace')) {
        row('terrain', 2, { icon: ICON.terrain, name: 'Terrain', count: index.size, sel: selNode === 'terrain', click: () => pickNode('terrain') })
        if (q) parts.forEach((p, i) => { if (p.name.toLowerCase().includes(q) || (p.group ?? '').toLowerCase().includes(q)) partRow(i, 2) })
        else {
          for (const gname of [...new Set(parts.map(p => p.group).filter(Boolean))]) {
            const id = 'm:' + gname, members = parts.map((p, i) => (p.group === gname ? i : -1)).filter(i => i >= 0)
            row(id, 2, { icon: ICON.model, name: gname, count: members.length, children: true, sel: members.length && members.every(i_in) && selNode === 'part', drop: dropTo(gname),
              click: e => { selNode = 'part'; selPart = members[0]; multi.clear(); members.slice(1).forEach(i => multi.add(i)); setTool('part'); updateSelBox(); paintProps(); paintExplorer(); rightTabs?.set('props') },
              menu: e => ctxMenu(e, [[t('cm_ungroup'), () => { for (const i of members) delete parts[i].group; refreshParts() }], [t('st_del_part'), () => { selPart = members[0]; multi.clear(); members.slice(1).forEach(i => multi.add(i)); deleteSelected() }]]) })
            if (open.has(id)) members.forEach(i => partRow(i, 3))
          }
          parts.forEach((p, i) => { if (!p.group) partRow(i, 2) })
        }
      }
      row('lighting', 1, { icon: ICON.lighting, name: 'Lighting', sel: selNode === 'lighting', click: () => pickNode('lighting') })
      row('scripts', 1, { icon: ICON.scripts, name: 'ServerScriptService', children: true, click: () => { open.has('scripts') ? open.delete('scripts') : open.add('scripts'); paintExplorer() } })
      if (open.has('scripts')) row('script', 2, { icon: ICON.script, name: 'Script', flags: game.script?.trim() ? '' : '○', sel: selNode === 'script', click: () => pickNode('script') })
      const uis = ctx.getUiEls?.() ?? []
      row('gui', 1, { icon: ICON.gui, name: 'StarterGui', children: true, count: uis.length, click: () => { open.has('gui') ? open.delete('gui') : open.add('gui'); paintExplorer() } })
      if (open.has('gui')) uis.forEach(u => row('ui:' + u.id, 2, { icon: ICON.ui, name: 'TextLabel · ' + u.id, sel: selNode === 'ui:' + u.id, click: () => pickNode('ui:' + u.id) }))
    }
    exHost.querySelector('.ex-tree').replaceChildren(...rows)
    const tot = exHost.querySelector('.ex-total'); if (tot) tot.textContent = `${parts.length} ${t('st_parts')} · ${index.size} ${t('st_blocks')}`
  }
  function renderExplorer(c) {
    exHost = c
    const search = h('input', { type: 'search', class: 'ex-search', placeholder: t('st_search_parts'), value: exFilter }); search.oninput = () => { exFilter = search.value; paintExplorer() }
    c.append(search, h('div', { class: 'ex-tree' }), h('small', { class: 'ex-total muted', style: 'padding:4px 8px;display:block' })); paintExplorer()
  }
  const toggleExplorer = () => leftTabs?.set('explorer')
  // exportar el juego entero (.json) para guardarlo o pasarlo a otro juego (se importa desde Crear)
  function exportGame() {
    const blocks = []; for (const [k, e] of index) { const [x, y, z] = k.split(',').map(Number); blocks.push([x, y, z, e.kind]) }
    const d = { format: 'blocksy-game-1', name: game.name, description: game.description ?? '', mode: game.mode, hue: game.hue, max_players: game.max_players, config: getConfig(), script: game.script ?? '', blocks }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d)], { type: 'application/json' })); a.download = `${String(game.name).replace(/[^\w-]+/g, '_')}.blocksy.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); showTitle(t('st_done_n', { n: blocks.length }), 1600)
  }
  const extraWires = []
  function updateSelBox() {
    for (const w of extraWires) w.visible = false
    let n = 0
    for (const i of multi) { const q = rbx.partAt(i); if (!q || i === selPart) continue; let w = extraWires[n]; if (!w) { w = extraWires[n] = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xff9f43, depthTest: false })); w.renderOrder = 6; scene.add(w) } const b = q.box; w.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); w.scale.set(b[3] - b[0] + 0.06, b[4] - b[1] + 0.06, b[5] - b[2] + 0.06); w.visible = true; n++ }
    const o = selPart >= 0 ? rbx.partAt(selPart) : null
    if (!o) { if (state.tool === 'part' || selPart < 0) selWire.visible = false; return }
    const b = o.box; selWire.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); selWire.scale.set(b[3] - b[0] + 0.06, b[4] - b[1] + 0.06, b[5] - b[2] + 0.06); selWire.visible = true
  }
  function newPart(type = 'part', shape = 'Block') {
    if (parts.length >= MAX_PARTS) return showTitle(t('st_big', { n: MAX_PARTS }), 2000)
    const v = new THREE.Vector3(); camera.getWorldDirection(v)
    const hit = pick(canvas.clientWidth / 2 + canvas.getBoundingClientRect().left, canvas.clientHeight / 2 + canvas.getBoundingClientRect().top)
    const at = hit?.place ?? [Math.round(me.pos.x + v.x * 6), Math.max(0, Math.round(me.pos.y)), Math.round(me.pos.z + v.z * 6)]
    let n = 1; const base = type === 'spawn' ? 'Spawn' : type === 'torch' ? 'Torch' : type === 'lamp' ? 'Lamp' : 'Part'; while (parts.some(p => p.name === base + n)) n++
    const P = { name: base + n, type: type === 'spawn' ? 'spawn' : 'part', x: at[0] + 0.5, y: at[1] + (type === 'spawn' ? 0.25 : 0.5), z: at[2] + 0.5, sx: type === 'spawn' ? 4 : 2, sy: type === 'spawn' ? 0.5 : 1, sz: type === 'spawn' ? 4 : 2, color: type === 'spawn' ? '#4dd0ff' : '#ff9f43', shape: 'Block', material: 'Plastic', anchored: true, collide: true, transparency: 0, ry: 0 }
    if (shape !== 'Block') Object.assign(P, { shape, sx: shape === 'Ball' ? 2 : 2, sy: shape === 'Ball' ? 2 : 1, sz: shape === 'Ball' ? 2 : 2 })
    if (type === 'torch') Object.assign(P, { y: at[1] + 0.9, sx: 0.3, sy: 1.6, sz: 0.3, color: '#ffb347', material: 'Neon', light: 1.6, lightColor: '#ffb347', lightRange: 16, collide: false })
    if (type === 'lamp') Object.assign(P, { y: at[1] + 3, sx: 1, sy: 1, sz: 1, shape: 'Ball', color: '#fff3c4', material: 'Neon', light: 2, lightColor: '#fff3c4', lightRange: 22 })
    parts.push(P)
    selPart = parts.length - 1; refreshParts(); setTool('part'); openPartInspector(); sfx.place()
  }
  const SC = [['Ctrl+Z / Ctrl+Y', 'st_sc_undo'], ['Ctrl+C / Ctrl+V', 'st_sc_copy'], ['Ctrl+D', 'st_sc_dup'], ['Ctrl+A', 'st_sc_all'], ['Del', 'st_sc_del'], ['Esc', 'st_sc_desel'], ['Shift+click', 'st_sc_multi'], ['Alt+arrows', 'st_sc_nudge'], ['Shift+arrows', 'st_sc_movesel'], ['R', 'st_sc_rot'], ['Alt+1..4', 'st_sc_marks'], ['Alt+Shift+1..4', 'st_sc_savemarks'], ['F1', 'st_sc_help']]
  const helpBox = h('div', { id: 'studio-help', class: 'hidden' }, h('b', { text: t('st_shortcuts') }), ...SC.map(([k, v]) => h('div', { class: 'sc-row' }, h('kbd', { text: k }), h('span', { text: t(v) })))); g.append(helpBox)
  const partInsp = null
  const selIdx = () => [selPart, ...multi].filter(i => parts[i] && !parts[i].locked)
  function alignSel(ax) { const ref = parts[selPart]; if (!ref) return; for (const i of selIdx()) parts[i][ax] = ref[ax]; refreshParts(); paintProps() }
  function distributeSel(ax) { const l = selIdx().sort((a, b) => parts[a][ax] - parts[b][ax]); if (l.length < 3) return showTitle(t('st_need3'), 1600); const a = parts[l[0]][ax], b = parts[l[l.length - 1]][ax]; l.forEach((i, k) => { parts[i][ax] = +(a + (b - a) * k / (l.length - 1)).toFixed(3) }); refreshParts(); paintProps() }
  function deleteSelected() { const del = new Set([selPart, ...multi]); for (const i of [...del].sort((a, b) => b - a)) if (parts[i]) parts.splice(i, 1); selPart = -1; multi.clear(); refreshParts(); paintProps() }
  // ---------- Properties: propiedades por categorías, como Roblox Studio ----------
  const openPartInspector = () => paintProps()
  let lastAnimSel = -2
  function paintProps() {
    if (bottomTabs?.cur === 'anim' && selPart !== lastAnimSel) { lastAnimSel = selPart; animator?.redraw() }
    if (!propsHost?.isConnected || rightTabs?.cur !== 'props') return
    const c = propsHost; c.replaceChildren()
    const p = parts[selPart]
    if (!p) {
      const title = selNode === 'terrain' ? 'Terrain' : selNode === 'script' ? 'Script' : selNode.startsWith('ui:') ? 'TextLabel' : 'Game'
      c.append(h('div', { class: 'st-head' }, h('b', { text: title }), h('small', { text: game.name ?? '' })),
        category(t('pc_data'), prop(t('pp_name'), h('span', { text: game.name ?? '' })), prop(t('pp_mode'), h('span', { text: t('mode_' + (game.mode || 'build')) })), prop(t('pp_blocks'), h('span', { text: String(index.size) })), prop(t('pp_parts'), h('span', { text: `${parts.length} / ${MAX_PARTS}` })), prop(t('pp_visibility'), h('span', { text: t('vis_' + (game.config?.visibility ?? (game.config?.draft ? 'private' : 'public'))) }))),
        h('div', { class: 'st-pad' }, h('small', { class: 'muted', text: t('pp_empty') }), h('button', { type: 'button', class: 'btn tiny', text: t('game_page'), onclick: () => rightTabs?.set('game') }), h('button', { type: 'button', class: 'btn tiny', text: t('st_env'), onclick: () => rightTabs?.set('env') })))
      return
    }
    const sel = [selPart, ...multi].filter(i => parts[i])
    const setAll = (k, v) => { for (const i of sel) parts[i][k] = v; refreshParts() }
    const num = (k, step = 0.5, extra) => { const i = h('input', { type: 'number', step, value: +(+(p[k] ?? 0)).toFixed(3) }); i.oninput = () => { if (i.value !== '' && Number.isFinite(+i.value)) { if (extra === 'move') { const d = +i.value - p[k]; movePart(selPart, k === 'x' ? d : 0, k === 'y' ? d : 0, k === 'z' ? d : 0); refreshParts() } else setAll(k, +i.value) } }; return i }
    const selb = (k, list, lab = x => x) => { const s = h('select', {}, list.map(v => h('option', { value: v, text: lab(v), selected: (p[k] ?? list[0]) === v }))); s.onchange = () => setAll(k, s.value); return s }
    const chk = (k, d = true) => { const i = h('input', { type: 'checkbox', checked: d ? p[k] !== false : !!p[k] }); i.onchange = () => setAll(k, i.checked); return i }
    const hex = h('input', { type: 'text', value: p.color || '#a3a2a5', maxlength: 7 }), col = h('input', { type: 'color', value: p.color || '#a3a2a5' })
    col.oninput = () => { hex.value = col.value; setAll('color', col.value) }; hex.onchange = () => { if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) { col.value = hex.value; setAll('color', hex.value) } }
    const tr = h('input', { type: 'number', min: 0, max: 1, step: 0.05, value: p.transparency || 0 }); tr.oninput = () => setAll('transparency', Math.max(0, Math.min(1, +tr.value || 0)))
    const name = h('input', { type: 'text', value: p.name, maxlength: 24 }); name.onchange = () => { const n = name.value.replace(/[^\w ]/g, '').slice(0, 24).trim(); if (n) { p.name = n; refreshParts() } }
    const grp = h('input', { type: 'text', value: p.group ?? '', maxlength: 16, placeholder: '—' }); grp.onchange = () => { const v = grp.value.replace(/[^\w]/g, '').slice(0, 16); for (const i of sel) { if (v) parts[i].group = v; else delete parts[i].group } refreshParts() }
    const lcol = h('input', { type: 'color', value: p.lightColor || '#ffd9a0' }); lcol.oninput = () => setAll('lightColor', lcol.value)
    const cls = p.type === 'spawn' ? 'SpawnLocation' : p.shape === 'Ball' ? 'Part (Ball)' : p.shape === 'Cylinder' ? 'Part (Cylinder)' : 'Part'
    c.append(h('div', { class: 'st-head' }, h('b', { text: p.name }), h('small', { text: sel.length > 1 ? t('st_multi_n', { n: sel.length }) : cls })),
      category(t('pc_appearance'), prop(t('st_color'), col, hex), prop(t('st_material'), selb('material', MATERIALS)), prop(t('st_transp'), tr), prop(t('st_shape'), selb('shape', SHAPES))),
      category(t('pc_data'), prop(t('pp_name'), name), prop('ClassName', h('span', { class: 'muted', text: cls })), prop(t('pp_model'), grp), prop(t('st_lock'), chk('locked', false)), prop(t('st_hide'), chk('eh', false))),
      category(t('pc_transform'), prop('Position X', num('x', 0.5, 'move')), prop('Position Y', num('y', 0.5, 'move')), prop('Position Z', num('z', 0.5, 'move')), prop('Size X', num('sx')), prop('Size Y', num('sy')), prop('Size Z', num('sz')), prop(t('st_rot'), num('ry', 15))),
      category(t('pc_behavior'), prop(t('st_anchored'), chk('anchored')), prop(t('st_collide'), chk('collide')), prop(t('st_climb'), chk('climb', false)), prop(t('st_light'), num('light'), lcol), prop(t('pp_range'), num('lightRange', 1))),
      sel.length > 1 ? category(t('pc_arrange'), h('div', { class: 'st-pad' }, h('div', { class: 'row-btns' }, ...[['x', 'st_align_x'], ['y', 'st_align_y'], ['z', 'st_align_z']].map(([ax, k]) => h('button', { type: 'button', class: 'btn tiny', text: t(k), onclick: () => alignSel(ax) })), ...[['x', 'st_dist_x'], ['z', 'st_dist_z']].map(([ax, k]) => h('button', { type: 'button', class: 'btn tiny', text: t(k), onclick: () => distributeSel(ax) }))))) : null,
      h('div', { class: 'st-pad' }, h('div', { class: 'row-btns' }, h('button', { type: 'button', class: 'btn tiny', text: t('st_dup'), onclick: duplicateSelected }), h('button', { type: 'button', class: 'btn tiny', text: t('cm_group'), onclick: groupSelected }), h('button', { type: 'button', class: 'btn tiny', text: t('cm_focus'), onclick: () => focusPart(selPart) }), h('button', { type: 'button', class: 'btn tiny danger', text: t('st_del_part'), onclick: deleteSelected }))))
  }

  // ---------- entorno: iluminación, física y reglas (pestaña Environment) ----------
  function buildEnv(c0) {
    const c = game.config = game.config ?? {}
    const numf = (k, d, step = 1, min = -999, max = 999) => { const i = h('input', { type: 'number', step, min, max, value: c[k] ?? d }); i.oninput = () => { if (i.value === '') delete c[k]; else c[k] = +i.value; cfg[k] = c[k]; onEnv(k, c[k]) }; return i }
    const bool = (k, d) => { const i = h('input', { type: 'checkbox', checked: c[k] ?? d }); i.onchange = () => { c[k] = i.checked; cfg[k] = i.checked; onEnv(k, i.checked) }; return i }
    const sky = h('select', {}, SKIES.map(s => h('option', { value: s, text: t('sky_' + s), selected: (c.sky ?? 'day') === s && c.time !== 0 })), h('option', { value: 'auto', text: t('ed_time').split(' (')[0] + ' ⟳', selected: c.time === 0 }))
    const hour = h('input', { type: 'range', min: 1, max: 24, step: 1, value: c.time || 12 }); hour.oninput = () => { c.time = +hour.value; delete c.sky; cfg.time = c.time; cfg.sky = undefined; sky.value = 'auto'; onEnv('hour', c.time) }
    sky.onchange = () => { if (sky.value === 'auto') { c.time = 0; delete c.sky } else { c.sky = sky.value; delete c.time }; cfg.sky = c.sky; cfg.time = c.time; onEnv('sky', sky.value) }
    const wx = h('select', { onchange: e => { c.weather = e.target.value; cfg.weather = c.weather; onEnv('weather', c.weather) } }, ['', 'rain', 'snow'].map(v => h('option', { value: v, text: t('weather_' + (v || 'none')), selected: (c.weather ?? '') === v })))
    const tr = h('select', { onchange: e => { c.track = e.target.value; cfg.track = c.track } }, h('option', { value: '', text: t('track_any') })); music.listTracks().then(l => l.forEach(x => tr.append(h('option', { value: x.file, text: x.title, selected: c.track === x.file }))))
    const wel = h('input', { type: 'text', value: c.welcome ?? '', maxlength: 120, placeholder: t('env_welcome') }); wel.oninput = () => { c.welcome = wel.value; cfg.welcome = wel.value }
    c0.append(h('div', { class: 'st-head' }, h('b', { text: t('st_env') }), h('small', { text: 'Lighting · Workspace' })),
      category('Lighting', prop(t('ed_sky'), sky), prop(t('st_time_slider'), hour), prop(t('env_fog'), numf('fog', 1, 0.1, 0.25, 2)), prop(t('env_weather'), wx)),
      category('Workspace', prop(t('env_gravity'), numf('gravity', 24, 1, 0, 80)), prop(t('env_speed'), numf('speed', 6, 0.5, 1, 30)), prop(t('env_jump'), numf('jump', 8.6, 0.5, 1, 30)), prop(t('env_dj'), bool('double_jump', false)), prop(t('env_crouch'), bool('allow_crouch', true)), prop(t('env_fly'), bool('allow_fly', true))),
      category(t('pc_rules'), prop(t('env_chat'), bool('allow_chat', true)), prop(t('env_emotes'), bool('allow_emotes', true)), prop(t('env_build'), bool('allow_build', false))),
      category(t('pc_audio'), prop(t('env_track'), tr), prop(t('env_welcome'), wel)))
  }
  const openEnv = () => { emit('env'); rightTabs?.set('env') }

  // ---------- versiones (instantáneas locales) e indicador de guardado ----------
  const SNAP_KEY = `blocksy.snaps.${game.id}`, MAX_SNAPS = 10
  const readSnaps = () => { try { const l = JSON.parse(localStorage.getItem(SNAP_KEY) || '[]'); return Array.isArray(l) ? l : [] } catch { return [] } }
  const writeSnaps = l => { for (;;) { try { localStorage.setItem(SNAP_KEY, JSON.stringify(l)); return true } catch { if (l.length <= 1) return false; l.shift() } } }          // si no cabe, se descartan las más viejas
  function takeSnapshot(label) {
    const blocks = []; for (const [k, e] of index) { const [x, y, z] = k.split(',').map(Number); blocks.push([x, y, z, e.kind]) }
    const { ui, parts: _p, ...conf } = game.config ?? {}
    const l = readSnaps(); l.push({ at: Date.now(), label, blocks: blocks.length <= 12000 ? blocks : null, nb: blocks.length, parts: parts.map(p => ({ ...p })), config: conf, script: game.script ?? '' })
    while (l.length > MAX_SNAPS) l.shift()
    writeSnaps(l); paintVersions()
  }
  function restoreSnapshot(i) {
    const s = readSnaps()[i]; if (!s) return
    takeSnapshot(t('st_snap_before')); paintVersions()
    if (s.blocks) {
      const want = new Map(s.blocks.map(([x, y, z, k]) => [key(x, y, z), [x, y, z, k]])), ops = []
      for (const [k, e] of index) { const w = want.get(k); if (!w) { const [x, y, z] = k.split(',').map(Number); ops.push({ x, y, z, to: -1 }) } else if (w[3] !== e.kind) ops.push({ x: w[0], y: w[1], z: w[2], to: w[3] }) }
      for (const [k, w] of want) if (!index.has(k)) ops.push({ x: w[0], y: w[1], z: w[2], to: w[3] })
      const saveSym = state.sym; state.sym = 'off'; commit(ops); state.sym = saveSym
    }
    game.script = s.script; game.config = { ...s.config, ui: game.config?.ui, parts: game.config?.parts }
    parts.length = 0; parts.push(...s.parts.map(p => ({ ...p }))); selPart = -1; multi.clear(); refreshParts(); paintProps()
    showTitle(t('st_snap_restored'), 1800)
  }
  function paintVersions() {
    if (!verHost?.isConnected || rightTabs?.cur !== 'versions') return
    const l = readSnaps()
    verHost.replaceChildren(h('b', { text: t('st_versions') }), h('button', { type: 'button', class: 'btn tiny primary', text: '+ ' + t('st_snap_new'), onclick: () => { takeSnapshot(t('st_snap_manual')); sfx.click() } }),
      ...l.map((s, i) => ({ s, i })).reverse().map(({ s, i }) => h('div', { class: 'ver-row' }, h('div', { class: 'grow' }, h('span', { text: s.label }), h('small', { text: `${new Date(s.at).toLocaleString(getLang())} · ${s.nb} ${t('st_blocks')}${s.blocks ? '' : ' (' + t('st_snap_noblocks') + ')'} · ${s.parts.length} ${t('st_parts')}` })),
        h('button', { type: 'button', class: 'btn tiny', text: t('st_snap_restore'), onclick: () => restoreSnapshot(i) }), h('button', { type: 'button', class: 'btn tiny danger', text: '×', onclick: () => { const q = readSnaps(); q.splice(i, 1); writeSnaps(q); paintVersions() } }))),
      !l.length ? h('small', { class: 'muted', text: t('st_snap_none') }) : null)
  }
  const toggleVersions = () => rightTabs?.set('versions')
  let lastSaved = 0, savedEl
  const paintSaved = () => { if (!savedEl) return; savedEl.textContent = lastSaved ? `✓ ${new Date(lastSaved).toLocaleTimeString(getLang(), { hour: '2-digit', minute: '2-digit' })}` : t('st_notsaved'); savedEl.classList.toggle('dirty', !lastSaved) }
  const doSave = async silent => { const ok = await onSave(silent); if (ok) { emit('save'); lastSaved = Date.now(); paintSaved(); if (silent !== true) takeSnapshot(t('st_snap_save')) } return ok }
  // ---------- tutorial del Studio, consejos y lista de comprobación ----------
  const STEPS = [['tool:place', 'stt_1'], ['edit', 'stt_2'], ['tool:box', 'stt_3'], ['tool:part', 'stt_4'], ['env', 'stt_5'], ['save', 'stt_6']]
  let tutStep = 0, tutEl = null
  try { if (localStorage.getItem('blocksy.studio.tut')) tutStep = STEPS.length } catch {}
  function paintTut() {
    if (tutStep >= STEPS.length) { tutEl?.remove(); tutEl = null; return }
    if (!tutEl) { tutEl = h('div', { id: 'studio-tut' }); g.append(tutEl) }
    tutEl.replaceChildren(h('b', { text: `${tutStep + 1}/${STEPS.length}` }), h('span', { text: t(STEPS[tutStep][1]) }), h('button', { type: 'button', class: 'btn tiny', text: t('st_tut_skip'), onclick: () => { tutStep = STEPS.length; try { localStorage.setItem('blocksy.studio.tut', '1') } catch {} paintTut() } }))
  }
  let tutReady = false
  function emit(ev) {
    if (!tutReady) return
    if (tutStep < STEPS.length && STEPS[tutStep][0] === ev) { tutStep++; if (tutStep >= STEPS.length) { try { localStorage.setItem('blocksy.studio.tut', '1') } catch {} showTitle(t('stt_done'), 2200) } paintTut() }
  }
  const TIPS = ['tip_1', 'tip_2', 'tip_3', 'tip_4', 'tip_5', 'tip_6', 'tip_7', 'tip_8']
  const tipTimer = setInterval(() => { if (!testing && tutStep >= STEPS.length && !document.hidden) showTitle(t(TIPS[Math.floor(Math.random() * TIPS.length)]), 4500) }, 150_000)
  // página del juego: visibilidad (publicar), textos, icono, banner y capturas
  function openGamePage() {
    const card = document.getElementById('modal-card'), box = document.createElement('div'); box.className = 'detail-col'
    const head = h('h2', { text: t('game_page') }), done = h('button', { type: 'button', class: 'btn wide primary', text: t('ge_done'), onclick: async () => { closeModal_(); await doSave() } })
    box.append(head, gameInfoEditor(game, { capture: (w, hh) => captureThumb?.(w, hh), onChange: () => { if (typeof game.config?.thumb === 'undefined' && game.config?.icon) { /* el icono sirve de tarjeta */ } } }), done)
    setKids_(card, box); document.getElementById('modal').classList.remove('hidden')
  }
  const listBox = h('div', { id: 'studio-check', class: 'hidden' }); g.append(listBox)
  async function openChecklist() {
    if (!listBox.classList.contains('hidden')) return listBox.classList.add('hidden')
    const c = game.config ?? {}, items = []
    const add = (ok, key) => items.push([ok, key])
    add(parts.some(p => p.type === 'spawn') || !!c.spawn, 'ck_spawn'); add(!!(game.name && game.name.trim().length >= 3), 'ck_name'); add(!!(game.description && game.description.trim().length >= 10), 'ck_desc')
    add(!!c.thumb, 'ck_thumb'); add(Array.isArray(c.tags) && c.tags.length > 0, 'ck_tags'); add(!!c.welcome, 'ck_welcome'); add(index.size > 0 || parts.length > 0, 'ck_content'); add(!c.draft, 'ck_public')
    if (game.script?.trim()) { const er = c.script_lang === 'lua' ? await checkLua(game.script).catch(e => e.message) : checkSyntax(game.script); add(!er, 'ck_script') }
    const ok = items.filter(i => i[0]).length
    listBox.replaceChildren(h('b', { text: `${t('st_checklist')} · ${ok}/${items.length}` }), ...items.map(([k, key]) => h('div', { class: 'ck-row ' + (k ? 'ok' : 'no') }, h('span', { text: k ? '✓' : '✗' }), h('span', { text: t(key) }))), h('button', { type: 'button', class: 'btn tiny', text: t('close'), onclick: () => listBox.classList.add('hidden') }))
    listBox.classList.remove('hidden')
  }
  // ---------- barra de herramientas ----------
  const TOOLS = [['place', 'plus'], ['erase', 'trash'], ['paint', 'edit'], ['pick', 'search'], ['box', 'box'], ['shape', 'sphere'], ['line', 'line'], ['replace', 'replace'], ['select', 'select'], ['stamp', 'cube'], ['part', 'part'], ['terrain', 'mountain'], ['measure', 'ruler'], ['ui', 'chat']]
  const opts = h('div', { id: 'studio-opts', class: 'rb-opts hidden' }); docks.top.append(opts)
  const btnFor = {}
  function paintOpts() {
    const L = []
    const chip = (label, on, fn) => h('button', { type: 'button', class: 'chip' + (on ? ' on' : ''), text: label, onclick: fn })
    if (state.tool === 'box') for (const m of ['fill', 'hollow', 'erase']) L.push(chip(t('st_mode_' + m), state.mode === m, () => { state.mode = m; paintOpts() }))
    if (state.tool === 'shape') for (const m of ['sphere', 'hollowsphere', 'cylinder']) L.push(chip(t('shape_' + m), state.shape === m, () => { state.shape = m; paintOpts() }))
    if (state.tool === 'stamp') {
      const s = h('select', {}, [...Object.keys(PREFABS), ...(state.clip ? ['clip'] : []), ...Object.keys(myPrefabs()).map(n => 'my:' + n)].map(k => h('option', { value: k, text: k.startsWith('my:') ? '★ ' + k.slice(3) : t('pf_' + k), selected: state.prefab === k }))); s.onchange = () => { state.prefab = s.value }
      L.push(s, h('button', { type: 'button', class: 'chip', text: t('st_rotate'), onclick: () => (state.rot = (state.rot + 1) % 4) }), state.prefab.startsWith('my:') ? h('button', { type: 'button', class: 'chip', text: t('st_pf_delete'), onclick: () => { const o = myPrefabs(); delete o[state.prefab.slice(3)]; saveMyPrefabs(o); state.prefab = 'house'; paintOpts() } }) : null, h('button', { type: 'button', class: 'chip', text: t('st_struct_import'), onclick: importStructure }))
    }
    if (state.tool === 'select') L.push(h('button', { type: 'button', class: 'chip', text: t('st_copy') + ' (Ctrl+C)', onclick: copySel }), h('button', { type: 'button', class: 'chip', text: t('st_cut'), onclick: () => { copySel(); clearSel() } }), h('button', { type: 'button', class: 'chip', text: t('st_fillsel'), onclick: fillSel }), h('button', { type: 'button', class: 'chip', text: t('st_clear') + ' (Del)', onclick: clearSel }), h('button', { type: 'button', class: 'chip', text: t('st_rot90'), onclick: rotateSel }), h('button', { type: 'button', class: 'chip', text: t('st_flipx'), onclick: () => flipSel('x') }), h('button', { type: 'button', class: 'chip', text: t('st_flipz'), onclick: () => flipSel('z') }), h('button', { type: 'button', class: 'chip', text: t('st_water'), onclick: waterSel }), h('button', { type: 'button', class: 'chip', text: t('st_pf_save'), onclick: savePrefab }), h('button', { type: 'button', class: 'chip', text: t('st_struct_export'), onclick: exportStructure }), h('button', { type: 'button', class: 'chip', text: t('st_struct_import'), onclick: importStructure }))
    if (state.tool === 'terrain') {
      for (const m of ['raise', 'lower']) L.push(chip(t('st_terr_' + m), state.terrMode === m, () => { state.terrMode = m; paintOpts() }))
      const num2 = (k, lab, min, max) => { const i = h('input', { type: 'number', min, max, value: state[k] }); i.style.width = '52px'; i.oninput = () => { state[k] = clampI(+i.value || min, min, max) }; return h('label', { class: 'chip-num' }, lab, i) }
      L.push(num2('terrR', t('st_radius'), 1, 12), num2('terrH', t('st_height'), 1, 12))
    }
    if (state.tool === 'part') L.push(h('select', { onchange: e => { state.grid = Number(e.target.value) } }, [0, 0.25, 0.5, 1].map(v => h('option', { value: v, text: `${t('st_grid')}: ${v || t('st_sym_off')}`, selected: state.grid === v }))), h('button', { type: 'button', class: 'chip on', text: '+ ' + t('st_add_part'), onclick: () => newPart('part') }), h('button', { type: 'button', class: 'chip', text: '+ ' + t('st_add_spawn'), onclick: () => newPart('spawn') }), h('button', { type: 'button', class: 'chip', text: '+ ' + t('st_torch'), onclick: () => newPart('torch') }), h('button', { type: 'button', class: 'chip', text: '+ ' + t('st_lamp'), onclick: () => newPart('lamp') }))
    L.push(h('span', { class: 'hint', text: t('st_hint_' + state.tool) }))
    opts.replaceChildren(...L); opts.classList.remove('hidden'); docks.apply()
  }
  function setTool(n) {
    state.tool = n; state.a = null; wire.visible = false; stamp.visible = false; emit('tool:' + n)
    g.classList.toggle('tool-ui', n === 'ui'); for (const [k, b] of Object.entries(btnFor)) b.classList.toggle('on', k === n)
    setUiTool(n === 'ui')
    if (n !== 'measure') measureLine.visible = false
    if (n !== 'select') { state.region = null; if (selPart < 0 || n !== 'part') selWire.visible = false }
    if (n === 'part') { openPartInspector(); updateSelBox() } else paintProps()
    paintOpts()
  }
  let undoBtn, redoBtn
  function paintHistory() { if (undoBtn) { undoBtn.disabled = !undoS.length; redoBtn.disabled = !redoS.length } }
  const mkBtn = (id, ic, label, fn, cls = '') => { const b = h('button', { id, class: 'st-btn ' + cls, title: label, onclick: fn, html: icon(ic, 18) + `<span>${label}</span>` }); return b }
  const rbBtn = (id, ic, label, fn, cls = '') => h('button', { id, type: 'button', class: 'rb-btn ' + cls, title: label, onclick: fn, html: icon(ic, 22) + `<span>${label}</span>` })
  function buildBar() {
    const tool = k => { const ic = TOOLS.find(x => x[0] === k)[1]; const b = rbBtn('st-' + k, ic, t('st_' + k), () => setTool(k), k === 'place' ? 'on' : ''); btnFor[k] = b; return b }
    const group = (cap, cls, ...btns) => h('div', { class: 'rb-group ' + cls }, h('div', { class: 'rb-row' }, ...btns), h('div', { class: 'rb-cap', text: cap }))
    const symBtn = rbBtn('st-sym', 'mirror', t('st_sym'), () => { state.sym = { off: 'x', x: 'z', z: 'xz', xz: 'off' }[state.sym]; symBtn.classList.toggle('on', state.sym !== 'off'); symBtn.title = `${t('st_sym')}: ${state.sym}`; showTitle(`${t('st_sym')}: ${state.sym === 'off' ? t('st_sym_off') : state.sym.toUpperCase()}`, 1200) })
    undoBtn = rbBtn('st-undo', 'undo', t('st_undo'), undo); redoBtn = rbBtn('st-redo', 'redo', t('st_redo'), redo)
    savedEl = h('span', { class: 'st-saved dirty', text: t('st_notsaved') })
    bar.replaceChildren(
      h('div', { class: 'rb-title' }, h('b', { text: 'Blocksy Studio' }), h('span', { text: '·' }), h('span', { text: game.name ?? '' }), h('span', { class: 'grow' }), savedEl,
        h('button', { type: 'button', class: 'btn tiny', text: t('st_shortcuts'), onclick: () => helpBox.classList.toggle('hidden') })),
      h('div', { class: 'rb-ribbon' },
        group(t('rg_blocks'), '', tool('place'), tool('erase'), tool('paint'), tool('pick')),
        group(t('rg_build'), '', tool('box'), tool('shape'), tool('line'), tool('replace'), tool('stamp'), tool('terrain')),
        group(t('rg_parts'), '', tool('part'), rbBtn('st-newpart', 'cube', t('st_add_part'), () => newPart('part')), rbBtn('st-newspawn', 'flag', t('st_add_spawn'), () => newPart('spawn')), tool('select'), tool('measure')),
        group(t('rg_edit'), '', undoBtn, redoBtn, symBtn, rbBtn('st-grid', 'grid', t('st_gridview'), () => { gridHelper.visible = !gridHelper.visible; document.getElementById('st-grid')?.classList.toggle('on', gridHelper.visible) })),
        group('UI', '', tool('ui'), rbBtn('st-addtext', 'chat', t('st_addtext'), () => { onAddText(); setTool('ui') })),
        group(t('rg_script'), '', rbBtn('st-script', 'code', t('ed_script'), onScript), rbBtn('st-check', 'check', t('st_checklist'), openChecklist), rbBtn('st-export', 'send', t('st_export'), exportGame), rbBtn('st-thumb', 'camera', t('st_thumb'), async () => { const d = await captureThumb?.(); if (!d) return showTitle(t('st_thumb_fail'), 1800); game.config = { ...(game.config ?? {}), thumb: d }; cfg.thumb = d; showTitle(t('st_thumb_ok'), 1800); sfx.click() })),
        group(t('rg_test'), 'keep', rbBtn('st-test', 'play', t('st_test'), onTestToggle), rbBtn('st-save', 'check', t('save'), () => doSave(), 'primary'), rbBtn('st-page', 'globe', t('game_page'), () => rightTabs?.set('game')), rbBtn('st-exit', 'back', t('close'), onExit, 'danger'))))
    paintHistory(); setTool('place')
  }
  // paneles: Explorer/Toolbox a la izquierda, Properties/Environment/Game/Versions a la derecha y Output abajo
  const TB_PARTS = [['part', 'cube', 'tb_block', () => newPart('part')], ['ball', 'sphere', 'tb_ball', () => newPart('part', 'Ball')], ['cyl', 'cylinder', 'tb_cyl', () => newPart('part', 'Cylinder')], ['spawn', 'flag', 'st_add_spawn', () => newPart('spawn')], ['torch', 'sliders', 'st_torch', () => newPart('torch')], ['lamp', 'sphere', 'st_lamp', () => newPart('lamp')]]
  // ---------- componentes reutilizables (piezas y scripts guardados para todos tus juegos) ----------
  const aimAt = () => { const v = new THREE.Vector3(); camera.getWorldDirection(v); const hit = pick(canvas.clientWidth / 2 + canvas.getBoundingClientRect().left, canvas.clientHeight / 2 + canvas.getBoundingClientRect().top); return hit?.place ?? [Math.round(me.pos.x + v.x * 6), Math.max(0, Math.round(me.pos.y)), Math.round(me.pos.z + v.z * 6)] }
  const repaintToolbox = () => { if (leftTabs?.cur === 'toolbox') leftTabs.paint() }
  function saveSelectionComponent() {
    const idx = [selPart, ...multi].filter(i => parts[i]); if (!idx.length) return showTitle(t('cmp_pick'), 1800)
    const name = prompt(t('cmp_name'), parts[idx[0]].group ?? parts[idx[0]].name); if (name == null) return
    if (!addComponent('parts', name, packParts(idx.map(i => ({ ...parts[i] }))))) return showTitle(t('cmp_full'), 2200)
    showTitle(t('cmp_saved'), 1500); repaintToolbox()
  }
  function saveScriptComponent() {
    if (!game.script?.trim()) return showTitle(t('cmp_no_script'), 1800)
    const name = prompt(t('cmp_name'), 'Script'); if (name == null) return
    if (!addComponent('script', name, game.script, { lang: cfg.script_lang })) return showTitle(t('cmp_full'), 2200)
    showTitle(t('cmp_saved'), 1500); repaintToolbox()
  }
  function useComponent(c) {
    if (c.kind === 'parts') {
      if (parts.length + c.data.length > MAX_PARTS) return showTitle(t('st_big', { n: MAX_PARTS }), 2000)
      const made = unpackParts(c.data, aimAt(), parts); parts.push(...made)
      selPart = parts.length - made.length; multi.clear(); made.slice(1).forEach((_, k) => multi.add(selPart + k + 1)); refreshParts(); paintProps(); sfx.place(); return
    }
    const lang = c.lang === 'lua' ? 'lua' : 'js', cur = game.script ?? ''
    if (cur.trim() && (cfg.script_lang === 'lua' ? 'lua' : 'js') !== lang) return showTitle(t('cmp_lang'), 3000)
    if (!cur.trim()) cfg.script_lang = lang
    game.script = (cur.trim() ? cur.trimEnd() + '\n\n' : '') + (lang === 'lua' ? '-- componente: ' : '// componente: ') + c.name + '\n' + c.data + '\n'
    showTitle(t('cmp_added'), 1800); paintExplorer()
  }
  function componentsBlock() {
    const L = listComponents()
    const tile = c => { const b = h('button', { type: 'button', class: 'tb-item', title: t('cmp_hint'), onclick: () => useComponent(c), html: icon(c.kind === 'parts' ? 'cube' : 'code', 22) + `<span>${c.name.replace(/</g, '&lt;')}</span>` }); b.oncontextmenu = e => ctxMenu(e, [[t('cm_rename'), () => { const n = prompt(t('cmp_name'), c.name); if (n) { renameComponent(c.id, n); repaintToolbox() } }], [t('st_del_part'), () => { removeComponent(c.id); repaintToolbox() }]]); return b }
    return [h('div', { class: 'tb-title', text: t('tb_components') }),
      h('div', { class: 'row-btns st-pad' }, h('button', { type: 'button', class: 'btn tiny', text: t('cmp_save_sel'), onclick: saveSelectionComponent }), h('button', { type: 'button', class: 'btn tiny', text: t('cmp_save_script'), onclick: saveScriptComponent })),
      L.length ? h('div', { class: 'tb-grid' }, L.map(tile)) : h('small', { class: 'muted st-pad', text: t('cmp_empty') }),
      h('div', { class: 'row-btns st-pad' }, h('button', { type: 'button', class: 'btn tiny', text: t('cmp_export'), onclick: exportComponents, disabled: !L.length }),
        h('button', { type: 'button', class: 'btn tiny', text: t('cmp_import'), onclick: () => { const f = h('input', { type: 'file', accept: '.json,application/json' }); f.onchange = async () => { try { const n = importComponents(await f.files[0].text()); showTitle(t('cmp_imported', { n }), 2000); repaintToolbox() } catch { showTitle(t('cmp_bad'), 2400) } }; f.click() } })) ]
  }
  function renderToolbox(c) {
    const tile = (ic, label, fn) => h('button', { type: 'button', class: 'tb-item', onclick: fn, html: icon(ic, 22) + `<span>${label}</span>` })
    c.append(h('div', { class: 'tb-title', text: t('tb_parts') }), h('div', { class: 'tb-grid' }, TB_PARTS.map(([, ic, k, fn]) => tile(ic, t(k), fn))),
      h('div', { class: 'tb-title', text: t('tb_structures') }), h('div', { class: 'tb-grid' }, Object.keys(PREFABS).map(k => tile('cube', t('pf_' + k), () => { state.prefab = k; setTool('stamp') }))),
      ...componentsBlock(),
      Object.keys(myPrefabs()).length ? [h('div', { class: 'tb-title', text: t('tb_mine') }), h('div', { class: 'tb-grid' }, Object.keys(myPrefabs()).map(n => tile('star', n, () => { state.prefab = 'my:' + n; setTool('stamp') })))] : null)
  }
  function paintOutput() {
    if (!outHost?.isConnected) return
    const L = scriptConsole.items.slice(-60)
    outHost.querySelector('.out-body').replaceChildren(...(L.length ? L.map(it => h('div', { class: 'con-row ' + it.kind, text: (it.kind === 'error' ? '! ' : '› ') + it.text })) : [h('small', { class: 'muted', text: t('ed_console_empty') })]))
    const b = outHost.querySelector('.out-body'); b.scrollTop = b.scrollHeight
  }
  scriptConsole.on(paintOutput)
  leftTabs = tabbed(docks.left, [{ id: 'explorer', label: 'Explorer', render: renderExplorer }, { id: 'toolbox', label: 'Toolbox', render: renderToolbox }])
  rightTabs = tabbed(docks.right, [{ id: 'props', label: 'Properties', render: c => { propsHost = c; paintProps() } }, { id: 'env', label: t('st_env'), render: c => buildEnv(c) }, { id: 'game', label: t('game_page'), render: c => c.append(h('div', { class: 'st-pad' }, gameInfoEditor(game, { capture: (w, hh) => captureThumb?.(w, hh) }))) }, { id: 'versions', label: t('st_versions'), render: c => { verHost = c; paintVersions() } }])
  bottomTabs = tabbed(docks.bottom, [{ id: 'anim', label: t('an_title'), render: c => { animator?.dispose(); docks.minBottom(300); animator = buildAnimator(c, animEnv) } }, { id: 'out', label: 'Output', render: c => { outHost = c; c.append(h('div', { class: 'out-bar' }, h('small', { class: 'muted', text: t('ed_console') }), h('button', { type: 'button', class: 'btn tiny', text: t('clear'), onclick: () => scriptConsole.clear() })), h('div', { class: 'out-body' })); paintOutput() } }], 'out')
  buildBar(); tutReady = true; paintTut()

  // ---------- selección / copiar / pegar ----------
  function copySel() {
    if (!state.region) return showTitle(t('st_hint_select'), 2000)
    const [a, b] = state.region, x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]), z0 = Math.min(a[2], b[2]), x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]), z1 = Math.max(a[2], b[2]), out = []
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) { const k = kindAt(x, y, z); if (typeof k === 'number' && k >= 0) out.push([x - x0, y - y0, z - z0, k]) }
    state.clip = out; state.prefab = 'clip'; showTitle(t('st_done_n', { n: out.length }), 1400); sfx.click(); paintOpts()
  }
  // ---------- transformar la seleccion: girar 90, voltear y mover (todo con deshacer) ----------
  function regionCells() {
    if (!state.region) { showTitle(t('st_hint_select'), 2000); return null }
    const [a, b] = state.region, x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]), z0 = Math.min(a[2], b[2]), x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]), z1 = Math.max(a[2], b[2]), cells = []
    if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > MAX_VOL) { showTitle(t('st_big', { n: MAX_VOL }), 2200); return null }
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) { const k = kindAt(x, y, z); if (typeof k === 'number' && k >= 0) cells.push([x, y, z, k]) }
    return { x0, y0, z0, x1, y1, z1, cells }
  }
  // borra lo que hay en la region y coloca las celdas transformadas; devuelve la nueva region
  function applyRegion(r, mapFn, newBox) {
    const ops = new Map(), put = (x, y, z, to) => ops.set(`${x},${y},${z}`, { x, y, z, to })
    for (const [x, y, z] of r.cells) put(x, y, z, -1)
    for (const c of r.cells) { const [x, y, z, k] = mapFn(c); put(x, y, z, k) }
    const n = commit([...ops.values()]); state.region = [[newBox[0], newBox[1], newBox[2]], [newBox[3], newBox[4], newBox[5]]]; setWire(state.region[0], state.region[1]); wire.material.color.set(0xffd34d)
    if (n) { sfx.place(); showTitle(t('st_done_n', { n }), 1200) }
  }
  function rotateSel() { const r = regionCells(); if (!r) return; const w = r.x1 - r.x0, d = r.z1 - r.z0; applyRegion(r, ([x, y, z, k]) => [r.x0 + (z - r.z0), y, r.z0 + (w - (x - r.x0)), k], [r.x0, r.y0, r.z0, r.x0 + d, r.y1, r.z0 + w]) }
  function flipSel(axis) { const r = regionCells(); if (!r) return; applyRegion(r, ([x, y, z, k]) => (axis === 'x' ? [r.x0 + r.x1 - x, y, z, k] : [x, y, r.z0 + r.z1 - z, k]), [r.x0, r.y0, r.z0, r.x1, r.y1, r.z1]) }
  function moveSel(dx, dy, dz) { const r = regionCells(); if (!r) return; applyRegion(r, ([x, y, z, k]) => [x + dx, y + dy, z + dz, k], [r.x0 + dx, r.y0 + dy, r.z0 + dz, r.x1 + dx, r.y1 + dy, r.z1 + dz]) }
  // rellenar la región con agua: una pieza de material Water (se puede nadar)
  function waterSel() {
    if (!state.region) return showTitle(t('st_hint_select'), 2000)
    const [a, b] = state.region, x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]) + 1, y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]) + 1, z0 = Math.min(a[2], b[2]), z1 = Math.max(a[2], b[2]) + 1
    if (parts.length >= MAX_PARTS) return showTitle(t('st_big', { n: MAX_PARTS }), 2000)
    let n = 1; while (parts.some(p => p.name === 'Water' + n)) n++
    parts.push({ name: 'Water' + n, type: 'part', x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, sx: x1 - x0, sy: y1 - y0, sz: z1 - z0, color: '#3b82f6', shape: 'Block', material: 'Water', anchored: true, collide: false, transparency: 0.45, ry: 0 })
    selPart = parts.length - 1; refreshParts(); sfx.place(); showTitle(t('st_water_done'), 1400)
  }
  // pincel de terreno: levanta una colina (o cava un hoyo) con forma de cúpula en el punto elegido
  function terrainAt(cx, cz, baseY) {
    const R = state.terrR, H = state.terrH, ops = []
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      const d = Math.hypot(dx, dz); if (d > R) continue
      const hgt = Math.max(1, Math.round(H * (1 - (d / (R + 0.5)) ** 2)))
      for (let k = 0; k < hgt; k++) { const y = baseY + k; if (state.terrMode === 'raise') ops.push({ x: cx + dx, y, z: cz + dz, to: k === hgt - 1 ? me.kind : 9 }); else if (baseY - k >= 0) ops.push({ x: cx + dx, y: baseY - 1 - k, z: cz + dz, to: -1 }) }
    }
    return commit(ops)
  }
  // estructuras propias: se guardan en este navegador y se pueden exportar/importar como archivo
  function selectionCells() { copySel(); return state.clip ?? [] }
  function savePrefab() {
    const cells = selectionCells(); if (!cells.length) return
    const name = (prompt(t('st_pf_name'), 'Mi estructura') ?? '').replace(/[^\w ñÑáéíóúÁÉÍÓÚ-]/g, '').trim().slice(0, 24); if (!name) return
    const o = myPrefabs(); o[name] = cells; saveMyPrefabs(o); state.prefab = 'my:' + name; showTitle(t('st_pf_saved', { name }), 1500); paintOpts()
  }
  function exportStructure() {
    const cells = selectionCells(); if (!cells.length) return
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ format: 'blocksy-structure-1', cells })], { type: 'application/json' })); a.download = 'structure.blocksy-structure.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  }
  function importStructure() {
    const inp = h('input', { type: 'file', accept: '.json,application/json' })
    inp.onchange = async () => {
      try {
        const d = JSON.parse(await inp.files[0].text()); const cells = (d.cells ?? []).filter(c => Array.isArray(c) && c.length === 4 && c.every(Number.isFinite)).slice(0, 2500)
        if (d.format !== 'blocksy-structure-1' || !cells.length) throw new Error('format')
        state.clip = cells.map(c => c.map(Math.round)); state.prefab = 'clip'; setTool('stamp'); showTitle(t('st_done_n', { n: cells.length }), 1400)
      } catch { showTitle(t('st_struct_bad'), 2200) }
    }
    inp.click()
  }
  const clearSel = () => { if (state.region) { const n = commit(boxCells(state.region[0], state.region[1], 'erase', 0)); if (n) showTitle(t('st_done_n', { n }), 1200) } }
  const fillSel = () => { if (state.region) { const n = commit(boxCells(state.region[0], state.region[1], 'fill', me.kind)); if (n) showTitle(t('st_done_n', { n }), 1200) } }

  // ---------- clic en el mundo ----------
  function interact(e, right) {
    const tool = state.tool
    if (tool === 'ui') return false
    if (tool === 'part') {
      const r = canvas.getBoundingClientRect()
      const i = rbx.pickPart(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      if (e.shiftKey) return true
      selPart = i; multi.clear(); updateSelBox(); openPartInspector(); return true
    }
    if (right && (state.a || tool === 'box' || tool === 'select')) { state.a = null; wire.visible = false; return true }
    const hit = pick(e.clientX, e.clientY)
    if (e.button === 1 || tool === 'pick') { if (hit && !hit.floor) { const k = kindAt(...hit.cell); if (typeof k === 'number' && k >= 0) { selectKind(k); sfx.click() } } return true }
    if (!hit) return true
    const cell = hit.floor ? hit.place : hit.cell, place = hit.place
    switch (tool) {
      case 'place': {
        if (right) { if (!hit.floor && !hit.fixed) commit([{ x: cell[0], y: cell[1], z: cell[2], to: -1 }]); return true }
        const [x, y, z] = place; if (y < 0 || y > 255) return true
        if (commit([{ x, y, z, to: me.kind }])) sfx.place(); return true }
      case 'erase': if (!hit.floor && !hit.fixed) { commit([{ x: cell[0], y: cell[1], z: cell[2], to: -1 }]); sfx.break() } return true
      case 'paint': if (!hit.floor) { const k = kindAt(...hit.cell); if (typeof k === 'number' && k >= 0) commit([{ x: cell[0], y: cell[1], z: cell[2], to: me.kind }]) } return true
      case 'box': {
        const here = state.mode === 'erase' ? (hit.floor ? null : hit.cell) : place; if (!here) return true
        if (!state.a) { state.a = here; setWire(here, here); return true }
        const n = commit(boxCells(state.a, here, state.mode, me.kind)); state.a = null; wire.visible = false; if (n) { sfx.place(); showTitle(t('st_done_n', { n }), 1200) } return true }
      case 'shape': {
        if (!state.a) { state.a = place; setWire(place, place); return true }
        const n = commit(shapeCells(state.a, place, state.shape, me.kind)); state.a = null; wire.visible = false; if (n) { sfx.place(); showTitle(t('st_done_n', { n }), 1200) } return true }
      case 'line': {
        if (!state.a) { state.a = place; setWire(place, place); return true }
        const n = commit(lineCells(state.a, place, me.kind)); state.a = null; wire.visible = false; if (n) { sfx.place(); showTitle(t('st_done_n', { n }), 1200) } return true }
      case 'replace': {
        if (hit.floor) return true
        const from = kindAt(...hit.cell); if (typeof from !== 'number' || from < 0 || from === me.kind) return true
        const ops = []; for (const [k, e] of index) if (e.kind === from && ops.length < MAX_VOL) { const [x, y, z] = k.split(',').map(Number); ops.push({ x, y, z, to: me.kind }) }
        const n = commit(ops); if (n) { sfx.place(); showTitle(t('st_done_n', { n }), 1200) } return true }
      case 'terrain': { const n = terrainAt(place[0], place[2], state.terrMode === 'raise' ? place[1] : (hit.floor ? 0 : hit.cell[1] + 1)); if (n) { sfx.place(); showTitle(t('st_done_n', { n }), 1200) } return true }
      case 'measure': {
        const here = hit.floor ? place : hit.cell
        if (!state.a) { state.a = here; measureLine.visible = false; setWire(here, here); return true }
        measure(state.a, here); state.a = null; wire.visible = false; return true }
      case 'select': {
        const here = hit.floor ? place : hit.cell
        if (!state.a) { state.a = here; state.region = null; setWire(here, here); return true }
        state.region = [state.a, here]; state.a = null; setWire(state.region[0], state.region[1]); wire.material.color.set(0xffd34d); return true }
      case 'stamp': {
        const list = rotate(prefabList(), state.rot); const [ox, oy, oz] = place
        const n = commit(list.map(([x, y, z, k]) => ({ x: ox + x, y: oy + y, z: oz + z, to: k }))); if (n) { sfx.place(); showTitle(t('st_done_n', { n }), 1200) } return true }
    }
    return false
  }
  // vista previa bajo el cursor (se llama cada fotograma)
  function update() {
    if (gridHelper.visible) gridHelper.position.set(Math.round(me.pos.x), 0.02, Math.round(me.pos.z))
    const hp = getHover(); const tool = state.tool
    if (tool === 'stamp' && hp) { const hit = pick(hp.x, hp.y); if (hit) showStamp(hit.place); else stamp.visible = false }
    else if ((tool === 'box' || tool === 'select' || tool === 'shape' || tool === 'line' || tool === 'measure') && state.a && hp) { const hit = pick(hp.x, hp.y); if (hit) { const here = ((tool === 'box' && state.mode !== 'erase') || tool === 'shape' || tool === 'line') || hit.floor ? hit.place : hit.cell; setWire(state.a, here); wire.material.color.set(tool === 'box' && state.mode === 'erase' ? 0xff6b6b : 0x4dd0ff) } }
  }
  // atajos (devuelve true si los consume)
  function keydown(e) {
    const ctrl = e.ctrlKey || e.metaKey
    if (e.altKey && /^Digit[1-4]$/.test(e.code)) {                         // marcadores de camara: Alt+1..4 ir, Alt+Mayús+1..4 guardar
      const k = `blocksy.marks.${game.id}`, n = +e.code.slice(5) - 1; let m = []; try { m = JSON.parse(localStorage.getItem(k) || '[]') } catch {}
      if (e.shiftKey) { m[n] = [+me.pos.x.toFixed(2), +me.pos.y.toFixed(2), +me.pos.z.toFixed(2)]; try { localStorage.setItem(k, JSON.stringify(m)) } catch {} showTitle(t('st_mark_saved', { n: n + 1 }), 1100) }
      else if (m[n]) { me.pos.set ? me.pos.set(...m[n]) : Object.assign(me.pos, { x: m[n][0], y: m[n][1], z: m[n][2] }); me.vel?.set?.(0, 0, 0); showTitle(t('st_mark_go', { n: n + 1 }), 900) } else showTitle(t('st_mark_none', { n: n + 1 }), 1300)
      e.preventDefault(); return true
    }
    if (ctrl && e.code === 'KeyD' && state.tool === 'part' && selPart >= 0) { e.preventDefault(); const src = [selPart, ...multi].filter(i => parts[i]); multi.clear(); let last = -1; for (const i of src) { if (parts.length >= MAX_PARTS) break; parts.push({ ...parts[i], name: parts[i].name.replace(/\d*$/, '') + (parts.length + 1), x: parts[i].x + 1, z: parts[i].z + 1 }); if (last >= 0) multi.add(last); last = parts.length - 1 } selPart = last; refreshParts(); openPartInspector(); sfx.place(); return true }
    if (ctrl && e.code === 'KeyA' && state.tool === 'part') { e.preventDefault(); multi.clear(); parts.forEach((_, i) => { if (i !== 0) multi.add(i) }); selPart = parts.length ? 0 : -1; updateSelBox(); openPartInspector(); paintExplorer(); return true }
    if (e.code === 'Escape' && (selPart >= 0 || multi.size)) { selPart = -1; multi.clear(); updateSelBox(); paintProps(); paintExplorer(); return true }
    if (e.code === 'F1') { e.preventDefault(); helpBox.classList.toggle('hidden'); return true }
    if (ctrl && e.code === 'KeyG' && selPart >= 0) { e.preventDefault(); groupSelected(); return true }
    if (ctrl && e.code === 'KeyU' && selPart >= 0) { e.preventDefault(); ungroupSelected(); return true }
    if (e.code === 'KeyF' && !ctrl && selPart >= 0 && state.tool === 'part') { focusPart(selPart); return true }
    if (ctrl && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? redo() : undo(); return true }
    if (ctrl && e.code === 'KeyY') { e.preventDefault(); redo(); return true }
    if (ctrl && e.code === 'KeyC' && state.tool === 'part' && selPart >= 0) { e.preventDefault(); partClip = targets(selPart).map(k => ({ ...parts[k] })); showTitle(t('st_done_n', { n: partClip.length }), 1000); return true }
    if (ctrl && e.code === 'KeyV' && partClip?.length) { e.preventDefault(); for (const q of partClip) { if (parts.length >= MAX_PARTS) break; parts.push({ ...q, name: q.name.replace(/\d*$/, '') + (parts.length + 1), x: q.x + 1, z: q.z + 1 }) } partClip = partClip.map(q => ({ ...q, x: q.x + 1, z: q.z + 1 })); selPart = parts.length - 1; refreshParts(); openPartInspector(); sfx.place(); return true }
    if (ctrl && e.code === 'KeyC') { e.preventDefault(); copySel(); return true }
    if (ctrl && e.code === 'KeyV') { e.preventDefault(); if (state.clip) { state.prefab = 'clip'; setTool('stamp') } return true }
    if (e.code === 'Delete' || e.code === 'Backspace') { if (state.tool === 'part' && selPart >= 0) deleteSelected(); else clearSel(); return true }
    if (e.code === 'KeyR' && state.tool === 'stamp') { state.rot = (state.rot + 1) % 4; return true }
    if (e.shiftKey && state.tool === 'select' && state.region && (e.code.startsWith('Arrow') || e.code === 'PageUp' || e.code === 'PageDown')) {          // mover la seleccion
      const yaw = Math.round(((Math.atan2(camera.position.x - me.pos.x, camera.position.z - me.pos.z)) / (Math.PI / 2))), f = [[0, -1], [-1, 0], [0, 1], [1, 0]][((-yaw % 4) + 4) % 4]
      e.preventDefault()
      if (e.code === 'PageUp') moveSel(0, 1, 0); else if (e.code === 'PageDown') moveSel(0, -1, 0)
      else if (e.code === 'ArrowUp') moveSel(f[0], 0, f[1]); else if (e.code === 'ArrowDown') moveSel(-f[0], 0, -f[1]); else if (e.code === 'ArrowLeft') moveSel(f[1], 0, -f[0]); else moveSel(-f[1], 0, f[0])
      return true
    }
    if (e.altKey && selPart >= 0 && state.tool === 'part' && e.code.startsWith('Arrow')) {
      const yaw = Math.round(((Math.atan2(camera.position.x - me.pos.x, camera.position.z - me.pos.z)) / (Math.PI / 2))); const d = e.shiftKey ? 0.25 : 1
      const f = [[0, -1], [-1, 0], [0, 1], [1, 0]][((-yaw % 4) + 4) % 4]
      if (e.code === 'ArrowUp') movePart(selPart, f[0] * d, 0, f[1] * d); else if (e.code === 'ArrowDown') movePart(selPart, -f[0] * d, 0, -f[1] * d); else if (e.code === 'ArrowLeft') movePart(selPart, f[1] * d, 0, -f[0] * d); else movePart(selPart, -f[1] * d, 0, f[0] * d)
      refreshParts(); openPartInspector(); e.preventDefault(); return true
    }
    return false
  }
  function setTesting(on) { testing = on; applyHidden(); bar.classList.toggle('testing', on); docks.left.style.display = docks.right.style.display = docks.bottom.style.display = on ? 'none' : ''; g.classList.toggle('st-testing', on); if (on) { opts.classList.add('hidden'); wire.visible = stamp.visible = selWire.visible = false } else { paintOpts(); if (state.tool === 'part') openPartInspector(); rbx.reset(); rbx.spawnStatic(parts) } }
  // arrastrar piezas con el ratón (Mayús = subir y bajar); el grupo entero se mueve a la vez
  const dragRay = new THREE.Raycaster(), dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitPt = new THREE.Vector3()
  const ndcOf = e => { const r = canvas.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1) }
  let dragAt = 0
  function pointerDown(e) {
    if (state.tool !== 'part' || e.button !== 0) return false
    const i = rbx.pickPart(ndcOf(e), camera); if (i < 0) return false
    if (e.shiftKey) { if (i === selPart) { selPart = [...multi][0] ?? -1; multi.delete(selPart) } else if (!multi.delete(i)) { if (selPart < 0) selPart = i; else multi.add(i) } updateSelBox(); openPartInspector(); return true }
    if (!multi.has(i) && i !== selPart) multi.clear()
    selPart = i; updateSelBox(); openPartInspector()
    if (parts[i].locked) { showTitle(t('st_locked'), 1100); return true }
    const p = parts[i]; dragPlane.constant = -p.y; dragRay.setFromCamera(ndcOf(e), camera)
    if (!dragRay.ray.intersectPlane(dragPlane, hitPt)) hitPt.set(p.x, p.y, p.z)
    dragPart = { i, ox: p.x - hitPt.x, oz: p.z - hitPt.z, sy: e.clientY, y0: p.y }; return true
  }
  function pointerMove(e) {
    if (!dragPart) return false
    const p = parts[dragPart.i]; if (!p) return true
    let nx = p.x, ny = p.y, nz = p.z
    if (e.shiftKey) ny = snap(dragPart.y0 + (dragPart.sy - e.clientY) * 0.04)
    else { dragRay.setFromCamera(ndcOf(e), camera); dragPlane.constant = -p.y; if (dragRay.ray.intersectPlane(dragPlane, hitPt)) { nx = snap(hitPt.x + dragPart.ox); nz = snap(hitPt.z + dragPart.oz) } }
    if (nx !== p.x || ny !== p.y || nz !== p.z) { movePart(dragPart.i, nx - p.x, ny - p.y, nz - p.z); const now = performance.now(); if (now - dragAt > 40) { dragAt = now; refreshParts() } }
    return true
  }
  function pointerUp() { if (!dragPart) return false; dragPart = null; refreshParts(); openPartInspector(); return true }
  refreshParts()
  function dispose() { animator?.dispose(); for (const o of [wire, stamp, selWire, gridHelper, measureLine, ...extraWires]) scene.remove(o); helpBox.remove(); stampGeo.dispose(); stampMat.dispose(); stamp.dispose(); opts.remove(); listBox.remove(); tutEl?.remove(); clearInterval(tipTimer); g.append(bar); bar.replaceChildren(); docks.dispose(); document.getElementById('st-ctx')?.remove() }
  return { save: doSave, interact, update, keydown, pointerDown, pointerMove, pointerUp, undo, redo, setTool, setTesting, dispose, flush, get tool() { return state.tool }, get parts() { return parts } }
}
