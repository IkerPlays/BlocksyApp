// Clima: lluvia y nieve alrededor del jugador (partículas baratas que lo siguen)
import * as THREE from 'three'

export function createWeather(scene) {
  let kind = '', obj = null, pos = null, vel = null, N = 0
  const W = 36, H = 22
  function build(k) {
    if (obj) { scene.remove(obj); obj.geometry.dispose(); obj.material.dispose(); obj = null }
    kind = k; if (!k) return
    if (k === 'rain') {
      N = 700; pos = new Float32Array(N * 6); vel = new Float32Array(N)
      for (let i = 0; i < N; i++) { reset(i, true); vel[i] = 26 + Math.random() * 10 }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      obj = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#a8c8ff', transparent: true, opacity: 0.45 }))
    } else {
      N = 900; pos = new Float32Array(N * 3); vel = new Float32Array(N)
      for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * W; pos[i * 3 + 1] = Math.random() * H; pos[i * 3 + 2] = (Math.random() - 0.5) * W; vel[i] = 1.2 + Math.random() * 1.5 }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      obj = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 0.16, transparent: true, opacity: 0.9, depthWrite: false }))
    }
    obj.frustumCulled = false; scene.add(obj)
  }
  function reset(i, any) {                     // lluvia: cada gota son 2 puntos (cabeza y cola)
    const x = (Math.random() - 0.5) * W, z = (Math.random() - 0.5) * W, y = any ? Math.random() * H : H
    pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z; pos[i * 6 + 3] = x; pos[i * 6 + 4] = y + 0.9; pos[i * 6 + 5] = z
  }
  return {
    get kind() { return kind },
    setKind: k => { k = k === 'rain' || k === 'snow' ? k : ''; if (k !== kind) build(k) },
    update(dt, p, reduce) {
      if (!obj) return; obj.visible = !reduce
      obj.position.set(p.x, Math.max(0, p.y - 2), p.z)
      if (kind === 'rain') for (let i = 0; i < N; i++) { pos[i * 6 + 1] -= vel[i] * dt; pos[i * 6 + 4] -= vel[i] * dt; if (pos[i * 6 + 1] < 0) reset(i, false) }
      else for (let i = 0; i < N; i++) { pos[i * 3 + 1] -= vel[i] * dt; pos[i * 3] += Math.sin(performance.now() / 900 + i) * dt * 0.6; if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = H }
      obj.geometry.attributes.position.needsUpdate = true
    },
    dispose() { build('') },
  }
}
