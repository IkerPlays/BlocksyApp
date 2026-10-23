// Elementos de la interfaz de la partida: brújula, marcadores en el mapa (pings) y barra de salud
import * as THREE from 'three'
import { t } from './i18n.js'

const $ = id => document.getElementById(id)

export function createCompass() {
  const cv = document.createElement('canvas'); cv.id = 'compass'; cv.width = 300; cv.height = 30; $('game').append(cv)
  const g = cv.getContext('2d'); let last = -1
  const L = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]]
  return {
    update(yaw, on) {
      cv.style.display = on ? '' : 'none'; if (!on) return
      const heading = ((-yaw * 180 / Math.PI) % 360 + 360) % 360; if (Math.abs(heading - last) < 0.3) return; last = heading
      g.clearRect(0, 0, 300, 30); g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, 300, 30)
      g.font = 'bold 13px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'
      for (let a = -90; a <= 90; a += 15) {
        const deg = ((Math.round(heading / 15) * 15 + a) % 360 + 360) % 360, x = 150 + ((Math.round(heading / 15) * 15 + a) - heading) * 1.6
        const lab = L.find(l => l[1] === deg)
        if (lab) { g.fillStyle = lab[0] === 'N' ? '#ff6b6b' : '#fff'; g.fillText(lab[0], x, 15) } else { g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(x - 0.5, 11, 1, 8) }
      }
      g.fillStyle = '#ffd34d'; g.beginPath(); g.moveTo(150, 0); g.lineTo(145, 6); g.lineTo(155, 6); g.fill()
    },
    dispose() { cv.remove() },
  }
}

export const PING_PREFIX = '⁣p'
export const isPing = text => (typeof text === 'string' && text.startsWith(PING_PREFIX) ? text.slice(PING_PREFIX.length).split(',').map(Number) : null)

export function createPings(scene) {
  const list = []
  const beamGeo = new THREE.CylinderGeometry(0.12, 0.12, 14, 8)
  function label(text) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); g.font = 'bold 30px system-ui'; g.textAlign = 'center'
    g.lineWidth = 6; g.strokeStyle = '#000'; g.strokeText(text, 128, 42); g.fillStyle = '#ffd34d'; g.fillText(text, 128, 42)
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true })); s.scale.set(2.4, 0.6, 1); s.renderOrder = 11; return s
  }
  return {
    list,
    add(x, y, z, who) {
      if (!Number.isFinite(x + y + z)) return
      const grp = new THREE.Group(); grp.position.set(x + 0.5, y, z + 0.5)
      const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: '#ffd34d', transparent: true, opacity: 0.55, depthWrite: false })); beam.position.y = 7
      const tag = label(who); tag.position.y = 14.6; grp.add(beam, tag); scene.add(grp)
      list.push({ x: x + 0.5, y, z: z + 0.5, who, grp, until: performance.now() + 10000 }); if (list.length > 6) this.remove(list[0])
    },
    remove(p) { scene.remove(p.grp); p.grp.traverse(o => { o.material?.map?.dispose?.(); o.material?.dispose?.() }); const i = list.indexOf(p); if (i >= 0) list.splice(i, 1) },
    update(t0) { const now = performance.now(); for (const p of [...list]) { if (now > p.until) this.remove(p); else p.grp.children[0].material.opacity = 0.35 + Math.sin(t0 * 4) * 0.2 } },
    dispose() { for (const p of [...list]) this.remove(p); beamGeo.dispose() },
  }
}

export function createHealth() {
  const box = document.createElement('div'); box.id = 'health-bar'; box.className = 'hidden'
  const fill = document.createElement('i'), txt = document.createElement('b'); box.append(fill, txt); $('game').append(box)
  let timer = 0
  return {
    set(hp, max) {
      max = Math.max(1, max || 100); hp = Math.max(0, Math.min(max, hp)); const f = hp / max
      box.classList.remove('hidden'); box.classList.toggle('low', f < 0.3); fill.style.width = `${f * 100}%`; txt.textContent = `${Math.round(hp)} / ${Math.round(max)}`
      clearTimeout(timer); if (f >= 1) timer = setTimeout(() => box.classList.add('hidden'), 3000)
    },
    dispose() { clearTimeout(timer); box.remove() },
  }
}
