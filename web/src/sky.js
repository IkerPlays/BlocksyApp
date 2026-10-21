import * as THREE from 'three'

// Cielo procedural: degradado + sol/luna + estrellas, ciclo día/noche, nubes y luz acordes a la hora.
const KEYS = [   // hora, cenit, horizonte, luz, intensidad sol, hemisferio, niebla
  [0,  '#050a1f', '#16204a', '#7f94d6', 0.35, 0.45],
  [5,  '#0c1538', '#2a2f63', '#8a9bd8', 0.4, 0.5],
  [6.3,'#3b4f8f', '#ff9d6c', '#ffb07a', 1.0, 0.8],
  [8.5,'#3f84dc', '#a9d3ff', '#fff2dc', 1.8, 1.1],
  [12, '#3a8fe8', '#c4e2ff', '#fff6e6', 2.1, 1.3],
  [16, '#3f86dc', '#b6d9ff', '#fff0d6', 1.9, 1.15],
  [18.2,'#3c3f86', '#ff7d4f', '#ff9a5e', 1.2, 0.8],
  [19.6,'#161c4a', '#4a3a74', '#9aa6e0', 0.55, 0.55],
  [21, '#070c26', '#16204a', '#7f94d6', 0.35, 0.45],
  [24, '#050a1f', '#16204a', '#7f94d6', 0.35, 0.45],
]
export const PRESET_HOUR = { day: 12, sunset: 18.4, night: 23, dawn: 6.6 }
const c = h => new THREE.Color(h)

export function createSky(scene, renderer) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: c('#3a8fe8') }, hor: { value: c('#c4e2ff') }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: c('#fff6e6') }, stars: { value: 0 }, space: { value: 0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vD; uniform vec3 top, hor, sunDir, sunCol; uniform float stars, space;
      float h3(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        vec3 d = normalize(vD); float y = clamp(d.y, -0.2, 1.0);
        vec3 col = mix(hor, top, pow(max(y,0.0), 0.55)); if (d.y < 0.0) col = mix(hor, hor*0.7, clamp(-d.y*3.0,0.0,1.0));
        float sd = max(dot(d, normalize(sunDir)), 0.0);
        col += sunCol * (pow(sd, 700.0) * 3.0 + pow(sd, 18.0) * 0.28);
        vec3 md = -normalize(sunDir); float mm = max(dot(d, md), 0.0); col += vec3(0.85,0.9,1.0) * pow(mm, 900.0) * 1.4 * stars;
        if (stars > 0.01 && d.y > -0.05) { vec3 g = floor(d*220.0); float s = h3(g); float tw = step(0.9965, s); col += vec3(1.0) * tw * stars * (0.6 + 0.4*h3(g+7.0)); }
        if (space > 0.5) { col = mix(col, vec3(0.02,0.02,0.07), 0.8); float n = h3(floor(d*160.0)); col += vec3(step(0.992, n)); col += vec3(0.25,0.1,0.4) * pow(max(0.0, 1.0-abs(d.y*1.4+d.x*0.4)), 6.0) * 0.5; }
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
  const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), mat)
  dome.renderOrder = -10; dome.frustumCulled = false; scene.add(dome)

  const hemi = new THREE.HemisphereLight('#ffffff', '#6f8f62', 1.25)
  const sun = new THREE.DirectionalLight('#fff4e0', 1.9)
  scene.add(hemi, sun, sun.target)

  // nubes
  const cloudGeo = new THREE.BoxGeometry(1, 1, 1)
  const cloudMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.92, fog: false, depthWrite: false })
  const N = 90, clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, N); clouds.frustumCulled = false; clouds.renderOrder = -5
  const cl = []; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc = new THREE.Vector3()
  let i = 0
  for (let k = 0; k < 18 && i < N; k++) {
    const cx = (Math.random() * 2 - 1) * 200, cz = (Math.random() * 2 - 1) * 200, cy = 62 + Math.random() * 18
    const parts = 3 + (Math.random() * 3 | 0)
    for (let p = 0; p < parts && i < N; p++) cl.push({ x: cx + p * 7 + Math.random() * 3, y: cy + Math.random() * 2, z: cz + (Math.random() - .5) * 8, sx: 8 + Math.random() * 8, sy: 3 + Math.random() * 2, sz: 6 + Math.random() * 6 }), i++
  }
  clouds.count = cl.length; scene.add(clouds)

  const state = { hour: 12, auto: false, fixed: 12, space: false, clouds: true, cloudShift: 0 }
  const cur = { top: c('#3a8fe8'), hor: c('#c4e2ff'), light: c('#fff6e6') }
  function sample(h) {
    let a = KEYS[0], b = KEYS[KEYS.length - 1]
    for (let k = 0; k < KEYS.length - 1; k++) if (h >= KEYS[k][0] && h <= KEYS[k + 1][0]) { a = KEYS[k]; b = KEYS[k + 1]; break }
    const f = (h - a[0]) / Math.max(0.0001, b[0] - a[0])
    cur.top.copy(c(a[1])).lerp(c(b[1]), f); cur.hor.copy(c(a[2])).lerp(c(b[2]), f); cur.light.copy(c(a[3])).lerp(c(b[3]), f)
    return { sun: a[4] + (b[4] - a[4]) * f, hemi: a[5] + (b[5] - a[5]) * f }
  }
  function setPreset(name) {
    if (name === 'space') { state.space = true; state.auto = false; state.fixed = 23; return }
    state.space = false; state.auto = false; state.fixed = PRESET_HOUR[name] ?? 12
  }
  function setHour(h) { state.space = false; if (!h) state.auto = true; else { state.auto = false; state.fixed = h } }
  function update(dt, camera, followPos) {
    if (state.auto) state.hour = (state.hour + dt * 24 / 480) % 24; else state.hour += (state.fixed - state.hour) * Math.min(1, dt * 2)
    const h = state.hour, s = sample(h)
    const ang = ((h - 6) / 24) * Math.PI * 2                           // 6h sale, 12h cénit, 18h se pone
    const dir = new THREE.Vector3(Math.cos(ang) * 0.8, Math.sin(ang), 0.45).normalize()
    const night = h < 5.8 || h > 19.8
    const L = night ? dir.clone().negate().setY(Math.abs(dir.y)) : dir               // de noche la "luz" viene de la luna
    sun.position.copy(followPos).addScaledVector(L, 60).add(new THREE.Vector3(0, 10, 0)); sun.target.position.copy(followPos)
    sun.color.copy(cur.light); sun.intensity = s.sun
    hemi.intensity = s.hemi; hemi.color.copy(cur.hor).lerp(new THREE.Color('#ffffff'), 0.5); hemi.groundColor.set(night ? '#1a2130' : '#6f8f62')
    mat.uniforms.top.value.copy(cur.top); mat.uniforms.hor.value.copy(cur.hor)
    mat.uniforms.sunDir.value.copy(dir); mat.uniforms.sunCol.value.copy(cur.light)
    const starAmt = Math.max(0, Math.min(1, night ? 1 : h < 6.8 ? (6.8 - h) : h > 18.8 ? (h - 18.8) : 0))
    mat.uniforms.stars.value = state.space ? 1 : starAmt; mat.uniforms.space.value = state.space ? 1 : 0
    if (scene.fog) scene.fog.color.copy(state.space ? c('#05060f') : cur.hor)
    dome.position.copy(camera.position)
    // nubes: derivan con el viento y se oscurecen de noche
    clouds.visible = state.clouds && !state.space
    if (clouds.visible) {
      state.cloudShift = (state.cloudShift + dt * 1.6) % 400
      for (let k = 0; k < cl.length; k++) {
        const o = cl[k]; let x = ((o.x + state.cloudShift + 200) % 400) - 200
        m4.compose(v3.set(x + followPos.x * 0.85, o.y, o.z + followPos.z * 0.85), q, sc.set(o.sx, o.sy, o.sz)); clouds.setMatrixAt(k, m4)
      }
      clouds.instanceMatrix.needsUpdate = true
      cloudMat.color.copy(cur.hor).lerp(new THREE.Color('#ffffff'), night ? 0.15 : 0.65).multiplyScalar(night ? 0.35 : 1)
    }
    return { night, sunIntensity: s.sun }
  }
  return { update, setPreset, setHour, state, sun, hemi, dispose() { dome.geometry.dispose(); mat.dispose(); cloudGeo.dispose(); cloudMat.dispose() } }
}
