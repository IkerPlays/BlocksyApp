// Scripts de juego (editor avanzado). Se ejecutan en un Worker aislado: sin DOM, sin red y sin acceso a tu sesión.
// El script solo puede pedir acciones a través de mensajes; el juego decide si las aplica.
const PRELUDE = `
'use strict';
const __post = self.postMessage.bind(self);
for (const k of ['fetch','XMLHttpRequest','WebSocket','EventSource','importScripts','indexedDB','caches','BroadcastChannel','Worker','SharedWorker','navigator']) { try { Object.defineProperty(self, k, { value: undefined, configurable: false }) } catch {} }
const __h = { join: [], playerjoin: [], chat: [], tick: [], reach: [], command: {} };
let __me = { name: '' }, __n = 0;
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const str = v => String(v ?? '').slice(0, 200);
const act = (type, a) => { if (++__n < 400) __post({ t: 'act', type, a }) };
const game = {
  say: s => act('say', [str(s)]), title: (s, ms) => act('title', [str(s), num(ms, 3000)]),
  teleport: (x, y, z) => act('teleport', [num(x), num(y), num(z)]),
  setSpeed: n => act('speed', [num(n, 6)]), setJump: n => act('jump', [num(n, 8.6)]), setGravity: n => act('gravity', [num(n, 24)]),
  emote: n => act('emote', [str(n)]), sky: n => act('sky', [str(n)]), sound: n => act('sound', [str(n)]),
  get me() { return __me },
};
function on(ev, fn) { if (ev === 'command') throw new Error('usa command("nombre", fn)'); if (!__h[ev]) throw new Error('evento desconocido: ' + ev); __h[ev].push(fn) }
function command(name, fn) { __h.command[String(name).toLowerCase()] = fn }
const say = game.say, title = game.title, teleport = game.teleport, emote = game.emote;
self.onmessage = e => {
  const m = e.data;
  if (m.t === 'init') { __me = m.me; try { (0, eval)(m.code); } catch (err) { __post({ t: 'error', msg: String(err && err.message || err) }) } __post({ t: 'ready' }); return }
  __n = 0;
  try {
    if (m.ev === 'command') { const f = __h.command[m.name]; if (f) f(m.args, m.who) }
    else for (const f of __h[m.ev] || []) f(m.data, m.who);
  } catch (err) { __post({ t: 'error', msg: String(err && err.message || err) }) }
  __post({ t: 'ack', id: m.id });
};
`

export function checkSyntax(code) {
  try { new Function(code); return null } catch (e) { return e.message }
}
// Comprobación de sintaxis de Lua (en un Worker aparte, sin tocar la página)
export function checkLua(code) {
  return new Promise(resolve => {
    const w = new LuaWorker(), done = v => { w.terminate(); resolve(v) }
    w.onmessage = e => { if (e.data.t === 'checked') done(e.data.err) }
    w.onerror = e => done(e.message || 'error')
    w.postMessage({ t: 'check', code })
    setTimeout(() => done('timeout'), 8000)
  })
}
import LuaWorker from './lua-worker.js?worker'

export function createRunner(code, me, onAction, onError, lang = 'js', extra = {}) {
  if (!code || !code.trim()) return { fire() {}, has: () => false, dispose() {} }
  let w, alive = true, seq = 0, pending = new Map()
  try {
    if (lang === 'lua') w = new LuaWorker()
    else { const url = URL.createObjectURL(new Blob([PRELUDE], { type: 'text/javascript' })); w = new Worker(url); URL.revokeObjectURL(url) }
  } catch (e) { onError?.(e.message); return { fire() {}, has: () => false, dispose() {} } }
  const kill = why => { if (!alive) return; alive = false; w.terminate(); onError?.(why) }
  w.onmessage = e => {
    const m = e.data
    if (m.t === 'act') onAction(m.type, m.a)
    else if (m.t === 'error') onError?.(m.msg)
    else if (m.t === 'ack') pending.delete(m.id)
  }
  w.onerror = e => kill(e.message || 'error')
  w.postMessage({ t: 'init', code, me, ...extra })
  const watchdog = setInterval(() => { for (const [, at] of pending) if (Date.now() - at > 3000) return kill('El script tardó demasiado y se detuvo') }, 1000)
  return {
    has: () => alive,
    fire(ev, data = {}) { if (!alive) return; if (ev === 'step' && pending.size > 1) return; const id = ++seq; pending.set(id, Date.now()); w.postMessage({ id, ev, ...data }) },
    dispose() { alive = false; clearInterval(watchdog); w.terminate() },
  }
}

export const EXAMPLES = {
  'Bienvenida': `on('join', () => {\n  title('Bienvenido, ' + game.me.name, 3500);\n  say('Escribe /saltar para un super salto');\n});\n\ncommand('saltar', () => { game.setJump(14); say('Super salto activado'); });\ncommand('normal', () => { game.setJump(8.6); game.setSpeed(6); say('Vuelves a la normalidad'); });`,
  'Luna (baja gravedad)': `on('join', () => { game.setGravity(7); game.sky('night'); title('Bienvenido a la Luna', 3000); });`,
  'Teletransportes': `command('inicio', () => teleport(0.5, 3, 0.5));\ncommand('cielo', () => teleport(0.5, 60, 0.5));\ncommand('tp', a => { const [x, y, z] = String(a).split(' ').map(Number); teleport(x, y, z); });`,
  'Reloj y anuncios': `let n = 0;\non('tick', () => {\n  n++;\n  if (n % 60 === 0) say('Han pasado ' + (n / 60) + ' minutos. ¡Sigue construyendo!');\n});`,
  'Respuesta del chat': `on('chat', m => {\n  if (/hola/i.test(m.text) && m.name !== game.me.name) say('Hola, ' + m.name + '!');\n});`,
}

export const EXAMPLES_LUA = {
  'Roblox: plataforma que sube y baja': `local TweenService = game:GetService("TweenService")
local plataforma = Instance.new("Part")
plataforma.Size = Vector3.new(6, 1, 6)
plataforma.Position = Vector3.new(6, 2, 0)
plataforma.Color = Color3.fromRGB(80, 180, 255)
plataforma.Anchored = true
plataforma.Parent = workspace

local info = TweenInfo.new(2, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true)
TweenService:Create(plataforma, info, { Position = Vector3.new(6, 8, 0) }):Play()`,
  'Roblox: monedas y puntuacion': `local Players = game:GetService("Players")

Players.PlayerAdded:Connect(function(player)
  local stats = Instance.new("Folder")
  stats.Name = "leaderstats"
  stats.Parent = player
  local coins = Instance.new("IntValue")
  coins.Name = "Monedas"
  coins.Value = 0
  coins.Parent = stats
end)

for i = 1, 5 do
  local coin = Instance.new("Part")
  coin.Shape = Enum.PartType.Ball
  coin.Size = Vector3.new(1, 1, 1)
  coin.Position = Vector3.new(i * 3, 1.5, 6)
  coin.Color = Color3.fromRGB(255, 210, 60)
  coin.Anchored = true
  coin.CanCollide = false
  coin.Parent = workspace
  coin.Touched:Connect(function(hit)
    local player = Players:GetPlayerFromCharacter(hit.Parent)
    if player and coin.Parent then
      player.leaderstats.Monedas.Value += 1
      coin:Destroy()
    end
  end)
end`,
  'Roblox: boton en pantalla': `local player = game.Players.LocalPlayer
local gui = Instance.new("ScreenGui")
gui.Parent = player.PlayerGui

local boton = Instance.new("TextButton")
boton.Size = UDim2.new(0, 160, 0, 48)
boton.Position = UDim2.new(0.5, 0, 1, -80)
boton.AnchorPoint = Vector2.new(0.5, 0)
boton.Text = "Super salto"
boton.TextSize = 22
boton.BackgroundColor3 = Color3.fromRGB(255, 120, 60)
boton.Parent = gui
Instance.new("UICorner", boton).CornerRadius = UDim.new(0, 12)

boton.MouseButton1Click:Connect(function()
  local humanoid = player.Character:FindFirstChildOfClass("Humanoid")
  humanoid.JumpPower = 100
  task.wait(5)
  humanoid.JumpPower = 50
end)`,
  'Roblox: lava que mata': `local lava = Instance.new("Part")
lava.Size = Vector3.new(8, 1, 8)
lava.Position = Vector3.new(-8, 0.5, 0)
lava.Color = Color3.fromRGB(255, 80, 20)
lava.Material = Enum.Material.Neon
lava.Anchored = true
lava.Parent = workspace

lava.Touched:Connect(function(hit)
  local humanoid = hit.Parent:FindFirstChildOfClass("Humanoid")
  if humanoid then humanoid.Health = 0 end
end)`,

  'Bienvenida': `on("join", function(p)
  game.title("Bienvenido, " .. game.me.name, 3500)
  game.say("Escribe /saltar para un super salto")
end)

command("saltar", function()
  game.setJump(14)
  game.say("Super salto activado")
end)
command("normal", function() game.setJump(8.6); game.setSpeed(6) end)`,
  'Luna (baja gravedad)': `on("join", function()
  game.setGravity(7)
  game.sky("night")
  game.title("Bienvenido a la Luna", 3000)
end)`,
  'Marcador en pantalla': `-- Necesita un texto de UI con id "marcador" (añádelo en Studio)
local segundos = 0
on("tick", function()
  segundos = segundos + 1
  ui.setText("marcador", "Tiempo: " .. segundos .. " s")
end)`,
  'Respuesta del chat': `on("chat", function(m)
  if string.find(string.lower(m.text), "hola") and m.name ~= game.me.name then
    game.say("Hola, " .. m.name .. "!")
  end
end)`,
}
