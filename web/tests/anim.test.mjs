import test from 'node:test'
import assert from 'node:assert/strict'
import { make } from './lua-harness.mjs'
import { transpile } from '../src/luau.js'
// los módulos del Studio tocan window/document al cargarse: se simulan lo justo para probar la lógica pura
globalThis.window = { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) }
globalThis.document = { documentElement: { lang: 'es', dataset: {}, style: {} }, addEventListener() {}, createElement: () => ({ style: {}, getContext: () => null }) }
Object.defineProperty(globalThis, 'navigator', { value: { language: 'es', languages: ['es'] }, configurable: true })
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
const { animLua, applyAnims, poseOf } = await import('../src/animator.js')
const { packParts, unpackParts } = await import('../src/components.js')
const { setCustomEmotes, customPose, EMOTES, isEmote } = await import('../src/avatar.js')

const part = (name, x = 0) => ({ name, type: 'part', x, y: 1, z: 0, sx: 2, sy: 1, sz: 2, color: '#ff0000', anchored: true })

test('animLua genera un script Lua que mueve la pieza', () => {
  const p = part('Plat'); const a = poseOf(p)
  p.anim = { loop: true, ease: 'Sine', keys: [{ t: 0, ...a }, { t: 1, ...a, y: 5 }] }
  const code = animLua([p]); assert.ok(code.includes('BLOCKSY-ANIM-BEGIN') && code.includes('"Plat"'))
  const h = make(); h.dispatch('init', { me: 'Ana', code: transpile(code), parts: [p] })
  for (let i = 0; i < 30; i++) h.dispatch('step', { dt: 0.05, now: 1, x: 0, y: 0, z: 0, others: [] })
  assert.deepEqual(h.errs, [])
  const ys = h.acts.filter(x => x[0] === 'prop' && x[2] === 'Position')
  assert.ok(ys.length > 3, 'la posicion cambia con los tweens')
})
test('applyAnims escribe, reemplaza y quita la zona generada', () => {
  const p = part('A'); const a = poseOf(p); p.anim = { keys: [{ t: 0, ...a }, { t: 1, ...a, x: 3 }] }
  const game = { script: 'print("hola")' }, cfg = { script_lang: 'lua' }
  assert.ok(applyAnims(game, cfg, [p])); assert.ok(game.script.startsWith('print("hola")') && game.script.includes('BLOCKSY-ANIM-END'))
  applyAnims(game, cfg, [p]); assert.equal(game.script.split('BLOCKSY-ANIM-BEGIN').length, 2)
  delete p.anim; applyAnims(game, cfg, [p]); assert.equal(game.script.trim(), 'print("hola")')
  p.anim = { keys: [{ t: 0, ...a }, { t: 1, ...a }] }
  assert.equal(applyAnims({ script: 'x = 1' }, { script_lang: 'js' }, [p]), false)
})
test('componentes: empaquetar y desempaquetar sin choques de nombres', () => {
  const ps = [{ ...part('Wall1', 10), group: 'House' }, { ...part('Wall2', 14), group: 'House' }]
  const pack = packParts(ps); assert.equal(pack[0].x, -2); assert.equal(pack[0].y, 0.5)
  const made = unpackParts(pack, [100, 0, 50], ps)
  assert.deepEqual(made.map(p => p.name), ['Wall3', 'Wall4']); assert.equal(made[0].group, 'House1'); assert.equal(made[0].x, 98.5)
})
test('emotes propios: pose interpolada y registro en EMOTES', () => {
  const z = Object.fromEntries(['legL', 'legR', 'armLx', 'armRx', 'armLz', 'armRz', 'headX', 'bodyY'].map(k => [k, 0]))
  setCustomEmotes({ c1: { name: 'Hola', keys: [{ t: 0, ...z }, { t: 1, ...z, armRz: 2 }] }, bad: {} })
  assert.ok(isEmote('c1') && EMOTES.some(e => e.id === 'c1' && e.custom))
  assert.ok(Math.abs(customPose('c1', 1).armRz - 2) < 1e-9); assert.ok(customPose('c1', 0.5).armRz > 0.9 && customPose('c1', 0.5).armRz < 1.1)
  setCustomEmotes({}); assert.ok(!isEmote('c1'))
})
