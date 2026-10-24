// Mundos base de cada juego (generados al cargar, iguales para todos los jugadores). Son bloques fijos que no se rompen.
// Cada celda: [x, y, z, '#color']. Devuelve { cells, floor, spawn, voidY, checkpoints:[{pos,id}], finish }
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) }
const hash2 = (x, z, seed) => { let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }
function noise(x, z, seed) {
  const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz)
  const a = hash2(x0, z0, seed), b = hash2(x0 + 1, z0, seed), c = hash2(x0, z0 + 1, seed), d = hash2(x0 + 1, z0 + 1, seed)
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz
}
export const COL = { grass: '#5cb85c', grass2: '#53a853', dirt: '#8a5a35', stone: '#9aa0a8', stone2: '#7f858d', sand: '#e6d28c', wood: '#8b5e34', leaves: '#2f8f3a', leaves2: '#3aa347', white: '#eceff1', gold: '#f5c542', blue: '#4d8dff', red: '#e74c3c', pink: '#ff7eb6', water: '#3aa0e8', dark: '#3b3f46' }

function tree(cells, x, y, z) {
  for (let i = 0; i < 3; i++) cells.push([x, y + i, z, COL.wood])
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy < 2; dy++) {
    if (Math.abs(dx) + Math.abs(dz) > 3 || (dx === 0 && dz === 0 && dy === 0)) continue
    cells.push([x + dx, y + 3 + dy, z + dz, (dx + dz + dy) & 1 ? COL.leaves : COL.leaves2])
  }
  cells.push([x, y + 5, z, COL.leaves2], [x + 1, y + 5, z, COL.leaves], [x - 1, y + 5, z, COL.leaves], [x, y + 5, z + 1, COL.leaves], [x, y + 5, z - 1, COL.leaves])
}

function hills(seed) {
  const R = 38, cells = [], H = new Map(), ht = (x, z) => {
    const d = Math.hypot(x, z)
    let h = 1.5 + noise(x * 0.07, z * 0.07, seed) * 6 + noise(x * 0.19, z * 0.19, seed + 7) * 2.2
    h *= Math.min(1, Math.max(0, (d - 4) / 10))                                  // plano alrededor del punto de aparición
    return Math.max(0, Math.round(h))
  }
  for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) if (Math.hypot(x, z) <= R) H.set(x + ',' + z, ht(x, z))
  const g = (x, z) => H.get(x + ',' + z) ?? 0
  for (const [k, h] of H) {
    if (h <= 0) continue
    const [x, z] = k.split(',').map(Number)
    const low = Math.min(g(x + 1, z), g(x - 1, z), g(x, z + 1), g(x, z - 1))
    for (let y = Math.max(0, Math.min(h - 1, low)); y < h; y++) {
      const top = y === h - 1
      const c = top ? (h <= 1 && Math.hypot(x, z) > R - 6 ? COL.sand : ((x + z) & 1 ? COL.grass : COL.grass2)) : (y >= h - 3 ? COL.dirt : COL.stone)
      cells.push([x, y, z, c])
    }
  }
  const r = rng(seed)
  for (let i = 0; i < 26; i++) {
    const x = Math.round((r() * 2 - 1) * (R - 4)), z = Math.round((r() * 2 - 1) * (R - 4))
    if (Math.hypot(x, z) < 9 || Math.hypot(x, z) > R - 3 || g(x, z) <= 0) continue
    tree(cells, x, g(x, z), z)
  }
  return { cells, floor: true, spawn: [0.5, 1.2, 0.5], voidY: null }
}

function islands(seed) {
  const cells = [], r = rng(seed)
  const disc = (cx, cy, cz, rad, thick) => {
    for (let x = -rad; x <= rad; x++) for (let z = -rad; z <= rad; z++) {
      const d = Math.hypot(x, z); if (d > rad + 0.3) continue
      const depth = Math.max(1, Math.round(thick * (1 - d / (rad + 1)) + 1))
      for (let k = 0; k < depth; k++) cells.push([cx + x, cy - k, cz + z, k === 0 ? ((x + z) & 1 ? COL.grass : COL.grass2) : (k < 3 ? COL.dirt : COL.stone)])
    }
  }
  disc(0, 0, 0, 7, 5)
  tree(cells, -3, 1, -2); tree(cells, 4, 1, 3)
  const n = 9
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5, d = 16 + r() * 16
    const cx = Math.round(Math.cos(a) * d), cz = Math.round(Math.sin(a) * d), cy = Math.round((r() - 0.3) * 8)
    const rad = 3 + Math.floor(r() * 4)
    disc(cx, cy, cz, rad, 3 + r() * 3)
    if (rad >= 4 && r() < 0.7) tree(cells, cx, cy + 1, cz)
  }
  // puentes de piedra entre la isla central y las tres primeras
  return { cells, floor: false, spawn: [0.5, 1.2, 0.5], voidY: -30 }
}

function plaza() {
  const cells = [], N = 18
  for (let x = -N; x <= N; x++) for (let z = -N; z <= N; z++) {
    const edge = Math.max(Math.abs(x), Math.abs(z)) === N
    cells.push([x, 0, z, edge ? COL.stone2 : ((x + z) & 1 ? '#d5d9de' : '#c3c8cf')])
  }
  // fuente central
  for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; cells.push([Math.round(Math.cos(t) * 4), 1, Math.round(Math.sin(t) * 4), COL.stone2]) }
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) if (Math.hypot(x, z) < 3.6) cells.push([x, 0, z, COL.water])
  for (let y = 1; y <= 3; y++) cells.push([0, y, 0, y === 3 ? COL.water : COL.white])
  // columnas, bancos y árboles
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    for (let y = 1; y <= 5; y++) cells.push([sx * 14, y, sz * 14, y === 5 ? COL.gold : COL.white])
    tree(cells, sx * 9, 1, sz * 15)
    for (let i = -2; i <= 2; i++) cells.push([sx * 9 + i, 1, sz * 8, COL.wood])
  }
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; for (let k = 5; k <= 12; k++) cells.push([Math.round(Math.cos(a) * k), 0, Math.round(Math.sin(a) * k), COL.sand]) }
  return { cells, floor: true, spawn: [0.5, 1.2, 7.5], voidY: null }
}

function checker() {
  const cells = [], N = 20
  for (let x = -N; x <= N; x++) for (let z = -N; z <= N; z++) cells.push([x, 0, z, (x + z) & 1 ? '#ffffff' : '#2b2f36'])
  return { cells, floor: true, spawn: [0.5, 1.2, 0.5], voidY: null }
}
function voidWorld() {
  const cells = []
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) cells.push([x, 0, z, (x + z) & 1 ? COL.white : COL.stone])
  return { cells, floor: false, spawn: [0.5, 1.2, 0.5], voidY: -30 }
}

function obby(seed) {
  const cells = [], r = rng(seed), checkpoints = []
  const plat = (x, y, z, w, d, c) => { for (let i = 0; i < w; i++) for (let k = 0; k < d; k++) cells.push([x + i, y, z + k, c]) }
  plat(-2, 0, -2, 5, 5, COL.green ?? COL.grass)
  let x = 0, y = 0, z = 3, stage = 0
  const stageCol = [COL.pink, COL.blue, COL.gold, COL.red, '#9b59b6', '#1abc9c']
  for (let i = 1; i <= 42; i++) {
    const gap = 1 + Math.floor(r() * 3)                                         // 1-3 bloques vacíos
    const dy = i % 5 === 0 ? 0 : (r() < 0.35 ? 1 : r() < 0.2 ? -1 : 0)
    const side = Math.round((r() - 0.5) * 4)
    z += gap; y = Math.max(0, y + dy); x = Math.max(-6, Math.min(6, x + side))
    if (i % 7 === 0) {                                                            // punto de control
      stage++
      plat(x - 1, y, z, 3, 3, COL.white); cells.push([x, y + 1, z + 1, COL.blue]); checkpoints.push({ pos: [x + 1.0, y + 1.2, z + 1.5], id: stage })
      z += 2
    } else {
      const w = r() < 0.5 ? 1 : 2, d = r() < 0.5 ? 1 : 2
      plat(x, y, z, w, d, stageCol[stage % stageCol.length]); z += d - 1
    }
  }
  z += 3
  plat(x - 2, y, z, 5, 5, COL.gold)
  for (let k = 1; k <= 5; k++) cells.push([x, y + k, z + 2, COL.white])
  cells.push([x + 1, y + 5, z + 2, COL.red], [x + 2, y + 5, z + 2, COL.red], [x + 1, y + 4, z + 2, COL.red])
  return { cells, floor: false, spawn: [0.5, 1.2, 0.5], voidY: -12, checkpoints, finish: { pos: [x + 0.5, y + 1, z + 2.5], radius: 2.6 } }
}

// Bosque oscuro: árboles, una cabaña de refugio en el centro, 5 fragmentos de luz y una valla de arbustos. Misma generación en la 3DS (world.c).
function forest(seed) {
  const r = rng(seed), cells = [], R = 46, trees = []
  let tries = 0
  while (trees.length < 150 && tries++ < 3000) {
    const x = Math.round((r() * 2 - 1) * (R - 3)), z = Math.round((r() * 2 - 1) * (R - 3)), d = Math.hypot(x, z)
    if (d < 9 || d > R - 3) continue
    if (trees.some(t => Math.hypot(t[0] - x, t[1] - z) < 4)) continue
    trees.push([x, z])
  }
  for (const [x, z] of trees) tree(cells, x, 0, z)
  const orbs = []; tries = 0
  while (orbs.length < 5 && tries++ < 6000) {
    const a = r() * Math.PI * 2, d = 16 + r() * (R - 26), x = Math.round(Math.cos(a) * d), z = Math.round(Math.sin(a) * d)
    if (trees.some(t => Math.hypot(t[0] - x, t[1] - z) < 3)) continue
    if (orbs.some(o => Math.hypot(o[0] - x, o[2] - z) < 16)) continue
    orbs.push([x + 0.5, 1.2, z + 0.5])
  }
  // valla de arbustos alrededor del bosque
  for (let a = 0; a < Math.PI * 2; a += 0.9 / R) { const x = Math.round(Math.cos(a) * R), z = Math.round(Math.sin(a) * R); for (let y = 0; y < 5; y++) cells.push([x, y, z, y > 3 ? COL.leaves2 : COL.leaves]) }
  // cabaña de refugio (puerta hacia +z)
  for (let i = -3; i <= 3; i++) for (let y = 0; y < 3; y++) { cells.push([i, y, -3, COL.wood], [-3, y, i, COL.wood], [3, y, i, COL.wood]); if (Math.abs(i) > 1 || y > 1) cells.push([i, y, 3, COL.wood]) }
  return { cells, floor: true, spawn: [0.5, 1.2, 0.5], voidY: null, orbs, monsterStart: [-26, 0.01, -26], radius: R, safe: 5, groundTint: '#26402b' }
}

// Desierto, cuevas y ciudad: decorados con pocas celdas (la 3DS admite 640) generados igual en 3ds/source/world.c (misma semilla = mismo mundo).
function spaced(list, x, z, d) { return list.some(t => Math.hypot(t[0] - x, t[1] - z) < d) }
function desert(seed) {
  const r = rng(seed), cells = [], cacti = [], R = 40
  for (let l = 0; l < 5; l++) for (let x = 14 - (4 - l); x <= 14 + (4 - l); x++) for (let z = -14 - (4 - l); z <= -14 + (4 - l); z++) cells.push([x, l, z, (x + z + l) & 1 ? '#d4b86a' : '#c9a84f'])
  for (let tries = 0; cacti.length < 22 && tries < 2000; tries++) {
    const x = Math.round((r() * 2 - 1) * R), z = Math.round((r() * 2 - 1) * R)
    if (Math.hypot(x, z) < 8 || (Math.abs(x - 14) < 7 && Math.abs(z + 14) < 7) || spaced(cacti, x, z, 4)) continue
    const h = 2 + Math.floor(r() * 3); cacti.push([x, z])
    for (let y = 0; y < h; y++) cells.push([x, y, z, '#2f8f3a'])
    if (h >= 3) cells.push([x + 1, 1, z, '#3aa347'], [x + 1, 2, z, '#3aa347'])
  }
  return { cells, floor: true, spawn: [0.5, 1.2, 0.5], voidY: null, groundTint: '#e0c987' }
}
function caves(seed) {
  const r = rng(seed), cells = [], pil = [], R = 30, cr = ['#7be0ff', '#c77dff', '#ff7eb6']
  for (let tries = 0; pil.length < 18 && tries < 2000; tries++) {
    const x = Math.round((r() * 2 - 1) * R), z = Math.round((r() * 2 - 1) * R)
    if (Math.hypot(x, z) < 7 || spaced(pil, x, z, 5)) continue
    const h = 3 + Math.floor(r() * 4); pil.push([x, z])
    for (let y = 0; y < h; y++) cells.push([x, y, z, y & 1 ? '#4a4f57' : '#5d636b'])
    cells.push([x + 1, 0, z, '#5d636b'], [x - 1, 0, z, '#5d636b'], [x, 0, z + 1, '#5d636b'], [x, 0, z - 1, '#5d636b'])
  }
  for (let i = 0, tries = 0; i < 12 && tries < 2000; tries++) {
    const x = Math.round((r() * 2 - 1) * R), z = Math.round((r() * 2 - 1) * R)
    if (Math.hypot(x, z) < 5 || spaced(pil, x, z, 3)) continue
    const c = cr[Math.floor(r() * 3)]; cells.push([x, 0, z, c], [x, 1, z, c]); i++
  }
  return { cells, floor: true, spawn: [0.5, 1.2, 0.5], voidY: null, groundTint: '#2b2e35' }
}
function city(seed) {
  const r = rng(seed), cells = [], pal = ['#cfd4da', '#a9b4c2', '#e8d9c0', '#c9a0a0']
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    if ((i + j) & 1 || (i === 0 && j === 0)) continue
    const h = 2 + Math.floor(r() * 5), c = pal[Math.floor(r() * 4)], bx = i * 9, bz = j * 9
    for (let y = 0; y < h; y++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) cells.push([bx + dx, y, bz + dz, (y & 1) && (dx === 0 || dz === 0) ? '#8fc8ff' : c])
  }
  return { cells, floor: true, spawn: [0.5, 1.2, 0.5], voidY: null, groundTint: '#43464d' }
}

export function buildWorld(type = 'flat', seed = 1337) {
  switch (type) {
    case 'hills': return hills(seed)
    case 'islands': return islands(seed)
    case 'plaza': return plaza()
    case 'checker': return checker()
    case 'void': return voidWorld()
    case 'obby': return obby(seed)
    case 'forest': return forest(seed)
    case 'desert': return desert(seed)
    case 'caves': return caves(seed)
    case 'city': return city(seed)
    default: return { cells: [], floor: true, spawn: [0.5, 3, 0.5], voidY: null }
  }
}
