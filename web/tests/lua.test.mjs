import test from 'node:test'
import assert from 'node:assert/strict'
import { make } from './lua-harness.mjs'
import { transpile } from '../src/luau.js'

const prints = h => h.acts.filter(a => a[0] === 'print').map(a => a[1])
const run = (code, extra = {}) => { const h = make(); h.dispatch('init', { me: 'Iker', code: transpile(code), ...extra }); return h }
const steps = (h, n, dt = 0.05) => { for (let i = 0; i < n; i++) h.dispatch('step', { dt, now: 1700000000, x: 0, y: 0, z: 0, others: [] }) }

test('Instance.new, propiedades y replicacion de piezas', () => {
  const h = run('local p = Instance.new("Part"); p.Name = "A"; p.Size = Vector3.new(2,3,4); p.Parent = workspace; print(p.Size.Y, p.ClassName, workspace:FindFirstChild("A") == p)')
  assert.deepEqual(h.errs, []); assert.equal(prints(h)[0], '3 Part true')
  assert.ok(h.acts.some(a => a[0] === 'new' && a[2] === 'Part'))
})
test('wait, task.spawn y Heartbeat avanzan con step', () => {
  const h = run('local n = 0; game:GetService("RunService").Heartbeat:Connect(function() n += 1 end); task.spawn(function() task.wait(0.2); print("beats", n > 0) end)')
  steps(h, 12); assert.deepEqual(h.errs, []); assert.deepEqual(prints(h), ['beats true'])
})
test('Players, personaje y leaderstats', () => {
  const h = run('game.Players.PlayerAdded:Connect(function(p) local f = Instance.new("Folder", p); f.Name = "leaderstats"; local c = Instance.new("IntValue", f); c.Name = "Oro"; c.Value = 7; print(p.Name, p.Character ~= nil) end)')
  steps(h, 2); assert.deepEqual(h.errs, []); assert.ok(prints(h)[0].startsWith('Iker')); assert.ok(h.acts.some(a => a[0] === 'lb' && a[3] === '7'))
})
test('Touched, ClickDetector y ProximityPrompt', () => {
  const h = run('local p = Instance.new("Part", workspace); p.Touched:Connect(function(hit) print("t", hit.Name) end); Instance.new("ClickDetector", p).MouseClick:Connect(function(pl) print("c", pl.Name) end); Instance.new("ProximityPrompt", p).Triggered:Connect(function(pl) print("p", pl.Name) end)')
  steps(h, 2); const id = h.acts.find(a => a[0] === 'new' && a[2] === 'Part')[1]
  h.dispatch('touch', { id, on: 1 }); h.dispatch('click', { id }); h.dispatch('prompt', { id })
  assert.deepEqual(h.errs, []); assert.deepEqual(prints(h), ['t HumanoidRootPart', 'c Iker', 'p Iker'])
})
test('TweenService mueve la propiedad hasta el final y avisa', () => {
  const h = run('local p = Instance.new("Part", workspace); local tw = game:GetService("TweenService"):Create(p, TweenInfo.new(0.5), { Position = Vector3.new(0, 10, 0) }); tw.Completed:Connect(function() print("fin", p.Position.Y) end); tw:Play()')
  steps(h, 20); assert.deepEqual(h.errs, []); assert.deepEqual(prints(h), ['fin 10.0'])
})
test('API clasica on/command/game.say sigue funcionando', () => {
  const h = run('on("join", function() game.say("hola " .. game.me.name) end); command("x", function(a) game.say("cmd " .. a) end)')
  h.dispatch('join', { name: 'Iker' }); h.dispatch('command', { name: 'x', args: '1', who: 'Iker' })
  assert.deepEqual(h.acts.filter(a => a[0] === 'say').map(a => a[1]), ['hola Iker', 'cmd 1'])
})
test('un bucle infinito se corta y se informa', () => {
  assert.deepEqual(run('while true do end').errs.length, 1)
  const h = run('task.spawn(function() while true do end end) print("sigue")'); assert.equal(h.errs.length, 1); assert.deepEqual(prints(h), ['sigue'])
})
test('errores de sintaxis y de ejecucion en corrutinas se reportan', () => {
  assert.match(run('local x = = 1').errs[0], /unexpected symbol/)
  const h = run('task.spawn(function() error("boom") end)'); assert.match(h.errs[0], /boom/)
})
test('Luau: +=, continue, tipos y cadenas con {}', () => {
  const src = 'type P = { x: number }\nlocal function f(a: number, b: number?): number\n  return a + (b or 0)\nend\nlocal t = 0\nfor i = 1, 5 do\n  if i % 2 == 0 then continue end\n  t += f(i)\nend\nprint(`t={t}`)'
  const out = transpile(src); assert.equal(out.split('\n').length, src.split('\n').length)
  const h = run(src); assert.deepEqual(h.errs, []); assert.deepEqual(prints(h), ['t=9'])
})
test('piezas del Studio estan en workspace con su nombre', () => {
  const h = run('print(workspace.Meta.Position.X, workspace.Meta.Anchored)', { parts: [{ name: 'Meta', x: 5, y: 1, z: 2, sx: 2, sy: 2, sz: 2, anchored: true }] })
  assert.deepEqual(h.errs, []); assert.deepEqual(prints(h), ['5.0 true'])
})

test('DataStore guarda y lee (y avisa al juego)', () => {
  const h = run('local ds = game:GetService("DataStoreService"):GetDataStore("p"); print(ds:GetAsync("oro")); ds:SetAsync("oro", 5); print(ds:IncrementAsync("oro", 2)); print(ds:GetAsync("oro")); ds:UpdateAsync("lista", function(v) return { 1, 2 } end); print(#ds:GetAsync("lista"))', { ds: { p: { oro: '10' } } })
  assert.deepEqual(h.errs, []); assert.deepEqual(prints(h), ['10', '7', '7', '2']); assert.ok(h.acts.some(a => a[0] === 'dsset' && a[1] === 'p' && a[2] === 'oro'))
})
test('Raycast y regiones sobre piezas', () => {
  const h = run('local p = Instance.new("Part", workspace); p.Anchored = true; p.Size = Vector3.new(4, 2, 4); p.Position = Vector3.new(0, 5, 10); local r = workspace:Raycast(Vector3.new(0, 5, 0), Vector3.new(0, 0, 50)); print(r.Instance == p, r.Position.Z, r.Distance, r.Normal.Z); print(workspace:Raycast(Vector3.new(20, 5, 0), Vector3.new(0, 0, 50))); print(#workspace:GetPartBoundsInRadius(Vector3.new(0, 5, 8), 3))')
  assert.deepEqual(h.errs, []); assert.deepEqual(prints(h), ['true 8.0 8.0 -1', 'nil', '1'])
})
test('Sound usa un efecto por nombre o por id', () => {
  const h = run('local s = Instance.new("Sound"); s.SoundId = "blocksy://win"; s:Play(); s.SoundId = "rbxassetid://12345"; s:Play()')
  assert.deepEqual(h.acts.filter(a => a[0] === 'sound').map(a => a[1]), ['win', 'boom'])
})
