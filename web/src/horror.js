// Bosque Oscuro: linterna, fragmentos de luz compartidos y un monstruo que persigue a los jugadores.
// El monstruo lo mueve el "anfitrión" (el jugador que mantiene la reserva en GAME con npc_tick); los demás lo ven moverse.
import * as THREE from 'three'
import { gameDb } from './supabase.js'
import * as api from './api.js'
import { t } from './i18n.js'

const MONSTER_SPEED = 4.3, CATCH_DIST = 1.15, TOTAL_ORBS = 5

export function createHorror({ scene, camera, world, game, profile, me, others, sky, solid, sfx, sys, showTitle, teleport, bonus }) {
  const orbsPos = world.orbs ?? []
  const collected = new Set()
  let round = 0, phase = 'play', stun = 0, flash = true, flicker = 0, beatAt = 0, winAt = 0
  const spawn = world.spawn

  // ---- linterna ----
  const light = new THREE.SpotLight('#ffe9b0', 220, 46, 0.5, 0.55, 1.3)
  light.castShadow = false; scene.add(light, light.target)
  const dir = new THREE.Vector3(), head = new THREE.Vector3()

  // ---- fragmentos de luz ----
  const orbMeshes = orbsPos.map(p => {
    const g = new THREE.Group(); g.position.set(...p)
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), new THREE.MeshBasicMaterial({ color: '#b9f3ff' })))
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), new THREE.MeshBasicMaterial({ color: '#7fdcff', transparent: true, opacity: 0.22, depthWrite: false })); g.add(halo)
    const pl = new THREE.PointLight('#8fe6ff', 10, 15, 1.6); g.add(pl)
    scene.add(g); return g
  })

  // ---- monstruo ----
  const mon = new THREE.Group()
  const dark = new THREE.MeshLambertMaterial({ color: '#07080c' }), eyeMat = new THREE.MeshBasicMaterial({ color: '#ff2a2a' })
  const part = (w, h, d, x, y, z, m = dark) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; return b }
  const body = new THREE.Group()
  body.add(part(0.9, 1.5, 0.5, 0, 1.9, 0), part(0.7, 0.7, 0.6, 0, 2.95, 0), part(0.14, 0.1, 0.05, -0.17, 3.0, 0.31, eyeMat), part(0.14, 0.1, 0.05, 0.17, 3.0, 0.31, eyeMat))
  const armL = new THREE.Group(), armR = new THREE.Group(); armL.position.set(-0.6, 2.5, 0); armR.position.set(0.6, 2.5, 0)
  armL.add(part(0.2, 1.7, 0.2, 0, -0.85, 0)); armR.add(part(0.2, 1.7, 0.2, 0, -0.85, 0))
  const legL = new THREE.Group(), legR = new THREE.Group(); legL.position.set(-0.25, 1.2, 0); legR.position.set(0.25, 1.2, 0)
  legL.add(part(0.3, 1.3, 0.3, 0, -0.65, 0)); legR.add(part(0.3, 1.3, 0.3, 0, -0.65, 0))
  mon.add(body, armL, armR, legL, legR)
  const eyeLight = new THREE.PointLight('#ff2a2a', 14, 14, 1.8); eyeLight.position.set(0, 3, 0.5); mon.add(eyeLight)
  const ms = world.monsterStart ?? [-26, 0, -26]
  mon.position.set(ms[0], 0, ms[2]); scene.add(mon)
  const mState = { target: new THREE.Vector3(ms[0], 0, ms[2]), ry: 0, remoteAt: 0, host: false, walkPhase: 0, moving: false }
  let tickBusy = false

  // ---- HUD ----
  const hud = document.createElement('div'); hud.id = 'horror-hud'; document.getElementById('game').append(hud)
  const fear = document.createElement('div'); fear.id = 'fear'; document.getElementById('game').append(fear)
  const paintHud = () => { hud.textContent = phase === 'won' ? t('hr_won') : `${t('hr_orbs')}: ${collected.size}/${orbsPos.length}  ·  ${t('hr_light')}: ${flash ? 'ON' : 'OFF'} (F)` }
  paintHud()

  // ---- estado compartido (eventos de la partida) ----
  function resetRound(n) { round = n; collected.clear(); phase = 'play'; orbMeshes.forEach(m => (m.visible = true)); teleport(...spawn); paintHud() }
  function onEvent(row) {
    const pl = row.payload ?? {}
    if (row.kind === 'orb') {
      const i = Number(pl.i); if (!Number.isInteger(i) || i < 0 || i >= orbsPos.length || collected.has(i)) return
      collected.add(i); orbMeshes[i].visible = false; paintHud()
      if (row.player_id !== profile.id) sys(t('hr_took', { name: row.username }))
    } else if (row.kind === 'win') {
      if ((pl.round ?? 0) !== round || phase === 'won') return
      phase = 'won'; winAt = Date.now(); paintHud(); showTitle(t('hr_escaped'), 6000); sfx.win(); bonus?.()
    } else if (row.kind === 'round') {
      if ((pl.n ?? 0) > round) { resetRound(pl.n); showTitle(t('hr_newround'), 3000) }
    } else if (row.kind === 'caught') {
      if (row.player_id !== profile.id) sys(t('hr_caught_other', { name: row.username }))
    }
  }
  async function loadState() {
    const { data } = await gameDb.from('interactions').select('id,player_id,username,kind,payload').eq('game_id', game.id).in('kind', ['orb', 'win', 'round']).order('id').limit(300)
    for (const r of data ?? []) onEvent(r)
  }
  loadState()

  // ---- monstruo remoto (si no soy el anfitrión) ----
  const applyRemote = row => { mState.target.set(row.x, row.y, row.z); mState.ry = row.ry; mState.remoteAt = Date.now() - Math.max(0, Date.now() - new Date(row.updated_at).getTime()) ; mState.walk = row.anim === 'walk' }
  const ch = gameDb.channel(`npc:${game.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'npcs', filter: `game_id=eq.${game.id}` }, p => { if (p.new?.id === 'monster') applyRemote(p.new) }).subscribe()
  const poll = setInterval(async () => {
    const { data } = await gameDb.from('npcs').select('*').eq('game_id', game.id).eq('id', 'monster').maybeSingle()
    if (data) applyRemote(data)
  }, 700)

  // ---- anfitrión: reclama la reserva y mueve al monstruo ----
  const hostTimer = setInterval(async () => {
    if (tickBusy || phase === 'won') return
    const remoteFresh = Date.now() - mState.remoteAt < 3500
    if (!mState.host && remoteFresh) return
    tickBusy = true
    try { mState.host = await api.npcTick(game.id, 'monster', { x: mon.position.x, y: 0, z: mon.position.z, ry: mon.rotation.y, anim: mState.moving ? 'walk' : 'idle' }) } catch { mState.host = false }
    tickBusy = false
  }, 250)

  const nearestPlayer = () => {
    let best = null, bd = 1e9
    const consider = (x, z, tag) => { if (Math.hypot(x, z) < world.safe) return; const d = Math.hypot(x - mon.position.x, z - mon.position.z); if (d < bd) { bd = d; best = { x, z, d, tag } } }
    consider(me.pos.x, me.pos.z, 'me'); for (const o of others.values()) consider(o.target.x, o.target.z, o.name)
    return best
  }
  function simulate(dt) {
    const tg = nearestPlayer(); mState.moving = false
    if (!tg || stun > 0) return
    let ang = Math.atan2(tg.x - mon.position.x, tg.z - mon.position.z)
    for (const off of [0, 0.7, -0.7, 1.4, -1.4, 2.2]) {                          // rodea los árboles
      const a = ang + off, nx = mon.position.x + Math.sin(a) * MONSTER_SPEED * dt, nz = mon.position.z + Math.cos(a) * MONSTER_SPEED * dt
      if (!solid(Math.floor(nx), 0, Math.floor(nz)) && !solid(Math.floor(nx), 1, Math.floor(nz)) && !solid(Math.floor(nx), 2, Math.floor(nz)) && Math.hypot(nx, nz) < world.radius - 1 && Math.hypot(nx, nz) > world.safe) {
        mon.position.x = nx; mon.position.z = nz; mon.rotation.y = a; mState.moving = true; break
      }
    }
  }

  let lastDist = 99
  function update(dt, tAnim) {
    // ambiente oscuro (después de sky.update)
    sky.hemi.intensity *= 0.28; sky.sun.intensity *= 0.2
    const d = Math.hypot(mon.position.x - me.pos.x, mon.position.z - me.pos.z); lastDist = d
    const fr = Math.max(0, 1 - d / 24)
    scene.fog.near = 1.5; scene.fog.far = 40 - fr * 14
    // linterna
    flicker = d < 14 && Math.random() < (1 - d / 14) * 0.25 ? 0.15 : Math.min(1, flicker + dt * 6)
    head.set(me.pos.x, me.pos.y + 1.6, me.pos.z); camera.getWorldDirection(dir)
    light.position.copy(head); light.target.position.copy(head).addScaledVector(dir, 12)
    light.intensity = flash && phase !== 'won' ? 220 * flicker : 0
    // monstruo
    if (!mState.host) {
      mon.position.lerp(new THREE.Vector3(mState.target.x, 0, mState.target.z), Math.min(1, dt * 6))
      let dy = mState.ry - mon.rotation.y; dy = ((dy + Math.PI * 3) % (Math.PI * 2)) - Math.PI; mon.rotation.y += dy * Math.min(1, dt * 8)
      mState.moving = Date.now() - mState.remoteAt < 1500 && mon.position.distanceTo(new THREE.Vector3(mState.target.x, 0, mState.target.z)) > 0.05
    } else if (phase !== 'won') simulate(dt)
    mState.walkPhase += dt * (mState.moving ? 8 : 1.5)
    const s = Math.sin(mState.walkPhase)
    legL.rotation.x = mState.moving ? s * 0.7 : 0; legR.rotation.x = mState.moving ? -s * 0.7 : 0
    armL.rotation.x = -1.2 + (mState.moving ? s * 0.5 : Math.sin(tAnim) * 0.05); armR.rotation.x = -1.2 + (mState.moving ? -s * 0.5 : 0)
    body.position.y = Math.abs(s) * (mState.moving ? 0.08 : 0)
    // fragmentos: flotan y se recogen al acercarte
    orbMeshes.forEach((m, i) => {
      if (!m.visible) return
      m.position.y = orbsPos[i][1] + Math.sin(tAnim * 2 + i) * 0.15; m.children[1].scale.setScalar(1 + Math.sin(tAnim * 3 + i) * 0.1)
      if (stun <= 0 && Math.hypot(m.position.x - me.pos.x, m.position.z - me.pos.z) < 1.5 && Math.abs(me.pos.y - orbsPos[i][1]) < 2.5 && phase === 'play') {
        collected.add(i); m.visible = false; sfx.checkpoint(); paintHud(); sys(t('hr_got', { n: collected.size, total: orbsPos.length }))
        api.gameEvent(game.id, 'orb', { i }).catch(() => {})
        if (collected.size >= orbsPos.length) api.gameEvent(game.id, 'win', { round }).catch(() => {})
      }
    })
    // atrapado
    if (stun > 0) { stun -= dt; fear.style.opacity = '0.95'; if (stun <= 0) fear.style.opacity = '0' }
    else {
      fear.style.opacity = String(Math.min(0.75, fr * 0.8))
      if (d < CATCH_DIST && phase === 'play' && Math.hypot(me.pos.x, me.pos.z) > world.safe) {
        stun = 2.2; sfx.fall(); showTitle(t('hr_caught'), 2200); api.gameEvent(game.id, 'caught', {}).catch(() => {}); setTimeout(() => teleport(...spawn), 900)
      }
    }
    // latido
    beatAt -= dt
    if (fr > 0.2 && beatAt <= 0) { beatAt = 0.9 - fr * 0.6; sfx.land() }
    // fuera del bosque
    if (Math.hypot(me.pos.x, me.pos.z) > world.radius - 0.5) teleport(...spawn)
    // fin de ronda: lo pide quien está esperando la victoria (el servidor ignora duplicados por número de ronda)
    if (phase === 'won' && Date.now() - winAt > 9000) { winAt = Date.now() + 20000; api.gameEvent(game.id, 'round', { n: round + 1 }).catch(() => {}) }
  }

  return {
    update, onEvent,
    toggleLight() { flash = !flash; paintHud(); sfx.click() },
    get distance() { return lastDist },
    stop() {
      clearInterval(poll); clearInterval(hostTimer); gameDb.removeChannel(ch)
      if (mState.host) api.npcRelease(game.id, 'monster').catch(() => {})
      scene.remove(light, light.target, mon); orbMeshes.forEach(m => scene.remove(m)); hud.remove(); fear.remove()
    },
  }
}
