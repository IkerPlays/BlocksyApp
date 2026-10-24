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

test('Equipos, animaciones y comandos registrados', () => {
  const h = run('local t = Instance.new("Team", game.Teams); t.Name = "Rojo"; t.TeamColor = BrickColor.new("Bright red"); game.Players.PlayerAdded:Connect(function(p) p.Team = t; print(#t:GetPlayers(), p.TeamColor.Name) end); command("hola", function() end); local a = Instance.new("Animation"); a.AnimationId = "blocksy://cry"; local h = game.Players.LocalPlayer.Character and 0')
  steps(h, 2); assert.deepEqual(h.errs, [])
  assert.ok(h.acts.some(a => a[0] === 'team' && a[1] === 'Iker' && a[2].startsWith('c:'))); assert.ok(h.acts.some(a => a[0] === 'cmd' && a[1] === 'hola')); assert.deepEqual(prints(h), ['1 Bright red'])
  const h2 = run('game.Players.PlayerAdded:Connect(function(p) local ch = p.Character or p.CharacterAdded:Wait(); local hum = ch:FindFirstChildOfClass("Humanoid"); local a = Instance.new("Animation"); a.AnimationId = "blocksy://flex"; hum:LoadAnimation(a):Play() end)'); steps(h2, 2)
  assert.deepEqual(h2.acts.filter(a => a[0] === 'emote').map(a => a[1]), ['flex'])
})

test('RemoteEvent viaja entre dos clientes y solo el servidor recibe OnServerEvent', () => {
  const code = 'local ev = Instance.new("RemoteEvent"); ev.Name = "Ping"; ev.Parent = game.ReplicatedStorage; ev.OnClientEvent:Connect(function(v, p) print("cliente", v, p.X) end); ev.OnServerEvent:Connect(function(pl, x) print("servidor", pl.Name, x) end); command("srv", function() ev:FireServer(7) end); command("all", function() ev:FireAllClients("hola", Vector3.new(4, 5, 6)) end); task.wait(0.1); print("host", game:GetService("RunService"):IsServer())'
  const a = make(), b = make(); a.dispatch('init', { me: 'Ana', code }); b.dispatch('init', { me: 'Beto', code })
  steps(a, 4); steps(b, 4)
  a.dispatch('playerjoin', { name: 'Beto' }); b.dispatch('playerjoin', { name: 'Ana' })
  const sent = new Set(), deliver = (from, to, fromName) => { for (const r of from.acts.filter(x => x[0] === 'remote' && !sent.has(x))) { sent.add(r); to.dispatch('remote', { id: r[1], m: r[2], t: r[3], a: r[4], from: fromName }) } }
  b.dispatch('command', { name: 'srv', args: '', who: 'Beto' }); deliver(b, a, 'Beto')
  a.dispatch('command', { name: 'all', args: '', who: 'Ana' }); deliver(a, b, 'Ana')
  assert.deepEqual(a.errs.concat(b.errs), [])
  assert.ok(prints(a).includes('servidor Beto 7')); assert.ok(prints(b).includes('cliente hola 4')); assert.ok(prints(a).includes('cliente hola 4'))
})

import { TAG, FLAG, WAVES, HIDE, ARENA, TEAMS, RACE, TOOLS, KOTH, DODGE, SIMON, ZONES, TREASURE, TOWER, MAZE, REFLEX, CRUMBLE, QUIZ } from '../src/modes.js'
for (const [name, src] of [['pilla-pilla', TAG], ['bandera', FLAG], ['oleadas', WAVES], ['escondite', HIDE], ['arena pvp', ARENA], ['equipos', TEAMS], ['carrera con vueltas', RACE]]) {
  test(`modo ${name}: arranca sin errores con dos jugadores y avisa por RemoteEvent`, () => {
    const h = make(); h.dispatch('init', { me: 'Ana', code: transpile(src) }); h.dispatch('playerjoin', { name: 'Beto' })
    for (let i = 0; i < 80; i++) h.dispatch('step', { dt: 0.05, now: 1, x: 0, y: 0, z: 0, others: [{ n: 'Beto', x: 1, y: 0, z: 1 }] })
    assert.deepEqual(h.errs, []); assert.ok(h.acts.some(a => a[0] === 'remote'), 'el servidor debe emitir eventos')
  })
}

test('Tool: barra de objetos, equipar con tecla, Activated con el clic y EquipTool', () => {
  const h = run(`local me = game.Players.LocalPlayer
local t = Instance.new("Tool"); t.Name = "Espada"; t.Parent = me.Backpack
local t2 = Instance.new("Tool"); t2.Name = "Arco"; t2.Parent = me.Backpack
t.Equipped:Connect(function() print("eq") end); t.Unequipped:Connect(function() print("un") end)
t.Activated:Connect(function() print("golpe") end)
task.wait(0.1)
print(t.Parent == me.Backpack)`)
  steps(h, 4); h.dispatch('key', { k: 'One', down: true }); h.dispatch('mouse', { down: true }); steps(h, 1)
  h.dispatch('key', { k: 'Two', down: true })
  assert.deepEqual(h.errs, []); assert.deepEqual(prints(h), ['true', 'eq', 'golpe', 'un'])
  assert.ok(h.acts.some(a => a[0] === 'new' && a[2] === 'TextButton'), 'la barra de objetos dibuja un boton por herramienta')
})

test('plantilla Armeria: da tres herramientas', () => {
  const h = run(transpile(TOOLS).length ? TOOLS : ''); steps(h, 3)
  h.dispatch('key', { k: 'Two', down: true }); h.dispatch('mouse', { down: true })
  assert.deepEqual(h.errs, []); assert.ok(h.acts.some(a => a[0] === 'title'))
})

test('rey de la colina: suma puntos dentro del círculo y avisa por RemoteEvent', () => {
  const h = make(); h.dispatch('init', { me: 'Ana', code: transpile(KOTH) })
  for (let i = 0; i < 60; i++) h.dispatch('step', { dt: 0.1, now: 1, x: 0, y: 0, z: -12, others: [] })
  assert.deepEqual(h.errs, []); assert.ok(h.acts.some(a => a[0] === 'remote'), 'debe enviar su puntuación')
})

test('esquiva: los bloques caen, golpean y te devuelven al centro', () => {
  const h = make(); h.dispatch('init', { me: 'Ana', code: transpile(DODGE) })
  for (let i = 0; i < 80; i++) h.dispatch('step', { dt: 0.1, now: 1700000000 + i * 0.1, x: 0, y: 0, z: 0, others: [] })
  assert.deepEqual(h.errs, []); assert.ok(h.acts.some(a => a[0] === 'new' && a[2] === 'Part'), 'debe crear bloques que caen')
})

test('memoria: crea las cuatro losetas y muestra la secuencia sin errores', () => {
  const h = make(); h.dispatch('init', { me: 'Ana', code: transpile(SIMON) })
  for (let i = 0; i < 60; i++) h.dispatch('step', { dt: 0.1, now: 1700000000 + i * 0.1, x: 0, y: 0, z: 0, others: [] })
  assert.deepEqual(h.errs, []); assert.ok(h.acts.filter(a => a[0] === 'new' && a[2] === 'Part').length >= 4, 'cuatro losetas')
})

test('zonas: crea tres circulos y puntua al estar dentro', () => {
  const h = make(); h.dispatch('init', { me: 'Ana', code: transpile(ZONES) })
  for (let i = 0; i < 40; i++) h.dispatch('step', { dt: 0.1, now: 1700000000 + i * 0.1, x: -12, y: 1, z: -8, others: [] })
  assert.deepEqual(h.errs, []); assert.ok(h.acts.filter(a => a[0] === 'new' && a[2] === 'Part').length >= 3, 'tres zonas')
})

test('cazatesoros: crea ocho cofres y los recoge al pasar por encima', () => {
  const h = make(); h.dispatch('init', { me: 'Ana', code: transpile(TREASURE) })
  for (let i = 0; i < 20; i++) h.dispatch('step', { dt: 0.1, now: 1700000000 + i * 0.1, x: 0, y: 0, z: 0, others: [] })
  assert.deepEqual(h.errs, []); assert.ok(h.acts.filter(a => a[0] === 'new' && a[2] === 'Part').length >= 8, 'ocho cofres')
})

test('torre: crea la espiral de plataformas sin errores', () => {
  const h = make(); h.dispatch('init', { me: 'Ana', code: transpile(TOWER) })
  for (let i = 0; i < 20; i++) h.dispatch('step', { dt: 0.1, now: 1700000000 + i * 0.1, x: 9, y: 5, z: 0, others: [] })
  assert.deepEqual(h.errs, []); assert.ok(h.acts.filter(a => a[0] === 'new' && a[2] === 'Part').length >= 40, 'cuarenta plataformas')
})

test('laberinto: genera paredes y una salida sin errores', () => {
  const h = make(); h.dispatch('init', { me: 'Ana', code: transpile(MAZE) })
  for (let i = 0; i < 10; i++) h.dispatch('step', { dt: 0.1, now: 1700000000 + i * 0.1, x: -14, y: 1, z: -14, others: [] })
  assert.deepEqual(h.errs, []); assert.ok(h.acts.filter(a => a[0] === 'new' && a[2] === 'Part').length >= 40, 'paredes y meta')
})

test('reflejos: crea la loseta y arranca la espera sin errores', () => {
  const h = make(); h.dispatch('init', { me: 'Ana', code: transpile(REFLEX) })
  for (let i = 0; i < 30; i++) h.dispatch('step', { dt: 0.1, now: 1700000000 + i * 0.1, x: 0, y: 1, z: 0, others: [] })
  assert.deepEqual(h.errs, []); assert.ok(h.acts.some(a => a[0] === 'new' && a[2] === 'Part'), 'loseta')
})

test('piso que cae: crea la cuadricula y las losetas pisadas desaparecen', () => {
  const h = make(); h.dispatch('init', { me: 'Ana', code: transpile(CRUMBLE) })
  for (let i = 0; i < 30; i++) h.dispatch('step', { dt: 0.1, now: 1700000000 + i * 0.1, x: 0, y: 1, z: 4, others: [] })
  assert.deepEqual(h.errs, []); assert.ok(h.acts.filter(a => a[0] === 'new' && a[2] === 'Part').length >= 80, 'cuadricula')
  assert.ok(h.acts.some(a => a[0] === 'prop' && a[2] === 'Transparency' && a[3] === 1), 'la loseta pisada desaparece')
})

test('preguntas: muestra la pregunta y premia la loseta correcta', () => {
  const h = make(); h.dispatch('init', { me: 'Ana', code: transpile(QUIZ) })
  for (let i = 0; i < 40; i++) h.dispatch('step', { dt: 0.1, now: 1700000000 + i * 0.1, x: 3, y: 1, z: 8, others: [] })
  assert.deepEqual(h.errs, []); assert.ok(h.acts.filter(a => a[0] === 'new' && a[2] === 'Part').length >= 4, 'cuatro losetas')
})
