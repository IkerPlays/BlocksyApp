import { TAG, FLAG, WAVES, HIDE, ARENA, TEAMS, RACE, TOOLS } from './modes.js'
// Plantillas de juego completas para empezar rápido en la página Crear (modo, reglas, script Lua y piezas ya puestas)
const COINS = `-- Recoge 10 monedas para ganar
local Players = game:GetService("Players")
local total = 0
local gui = Instance.new("ScreenGui"); gui.Parent = Players.LocalPlayer.PlayerGui
local label = Instance.new("TextLabel"); label.Size = UDim2.new(0, 260, 0, 44); label.Position = UDim2.new(0.5, 0, 0, 14); label.AnchorPoint = Vector2.new(0.5, 0)
label.BackgroundTransparency = 0.3; label.BackgroundColor3 = Color3.fromRGB(20, 20, 30); label.TextColor3 = Color3.new(1, 1, 1); label.TextSize = 24; label.Text = "Monedas: 0 / 10"; label.Parent = gui
Instance.new("UICorner", label).CornerRadius = UDim.new(0, 12)
local function spawnCoin(i)
  local a = (i / 12) * math.pi * 2
  local coin = Instance.new("Part"); coin.Shape = Enum.PartType.Ball; coin.Size = Vector3.new(1.2, 1.2, 1.2)
  coin.Position = Vector3.new(math.cos(a) * 12, 1.6, math.sin(a) * 12); coin.Color = Color3.fromRGB(255, 210, 60); coin.Material = Enum.Material.Neon
  coin.Anchored = true; coin.CanCollide = false; coin.Parent = workspace
  coin.Touched:Connect(function(hit)
    if coin.Parent == nil then return end
    coin:Destroy(); total += 1; label.Text = "Monedas: " .. total .. " / 10"
    game.sound("checkpoint")
    if total >= 10 then game.title("Has ganado!", 4000); game.sound("win") end
  end)
end
for i = 1, 12 do spawnCoin(i) end`
const SKY = `-- Salta entre plataformas que suben y bajan; si tocas la lava, vuelves al inicio
local TweenService = game:GetService("TweenService")
for i = 1, 6 do
  local p = Instance.new("Part"); p.Size = Vector3.new(5, 1, 5); p.Anchored = true; p.Color = Color3.fromHSV(i / 7, 0.6, 1)
  p.Position = Vector3.new(i * 7, 4, 0); p.Parent = workspace
  local info = TweenInfo.new(2 + i * 0.3, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true)
  TweenService:Create(p, info, { Position = Vector3.new(i * 7, 4 + (i % 2 == 0 and 5 or -2), 0) }):Play()
end
local lava = Instance.new("Part"); lava.Size = Vector3.new(80, 1, 24); lava.Position = Vector3.new(20, 0.5, 0); lava.Anchored = true; lava.CanCollide = false
lava.Color = Color3.fromRGB(255, 80, 20); lava.Material = Enum.Material.Neon; lava.Parent = workspace
lava.Touched:Connect(function(hit)
  local hum = hit.Parent:FindFirstChildOfClass("Humanoid")
  if hum then hum.Health = 0 end
end)
local goal = Instance.new("Part"); goal.Size = Vector3.new(6, 1, 6); goal.Position = Vector3.new(52, 4, 0); goal.Anchored = true; goal.Color = Color3.fromRGB(80, 255, 120); goal.Parent = workspace
goal.Touched:Connect(function() game.title("Meta!", 3000); game.sound("win") end)`
export const TEMPLATES = [
  { id: 'blank', key: 'tpl_blank', mode: 'build', config: {}, script: '' },
  { id: 'obby', key: 'tpl_obby', mode: 'obby', config: { world: 'obby', allow_build: false, welcome: 'Llega a la meta' }, script: '' },
  { id: 'plaza', key: 'tpl_plaza', mode: 'social', config: { world: 'plaza', allow_build: false, welcome: 'Charla, baila y haz amigos' }, script: '' },
  { id: 'coins', key: 'tpl_coins', mode: 'arena', config: { world: 'checker', allow_build: false, script_lang: 'lua', welcome: 'Recoge 10 monedas' }, script: COINS },
  { id: 'tag', key: 'tpl_tag', mode: 'arena', config: { world: 'plaza', allow_build: false, script_lang: 'lua', welcome: 'Pilla-pilla: ¡no la lleves!' }, script: TAG },
  { id: 'tools', key: 'tpl_tools', mode: 'adventure', config: { world: 'plaza', allow_build: false, script_lang: 'lua', welcome: 'Armeria: 1, 2 y 3 equipan herramientas' }, script: TOOLS },
  { id: 'arena', key: 'tpl_arena', mode: 'arena', config: { world: 'plaza', allow_build: false, script_lang: 'lua', double_jump: true, welcome: 'Arena: clic o F para golpear. Gana quien llegue a 15 bajas' }, script: ARENA },
  { id: 'teams', key: 'tpl_teams', mode: 'arena', config: { world: 'plaza', allow_build: false, script_lang: 'lua', welcome: 'Rojo contra Azul: gana el primero en 20 bajas' }, script: TEAMS },
  { id: 'race', key: 'tpl_race', mode: 'obby', config: { world: 'flat', allow_build: false, script_lang: 'lua', welcome: 'Carrera de 3 vueltas: pasa por las puertas en orden' }, script: RACE },
  { id: 'flag', key: 'tpl_flag', mode: 'arena', config: { world: 'plaza', allow_build: false, script_lang: 'lua', welcome: 'Roba la bandera y llega a 30 puntos' }, script: FLAG },
  { id: 'waves', key: 'tpl_waves', mode: 'arena', config: { world: 'checker', allow_build: false, script_lang: 'lua', welcome: 'Sobrevive a las oleadas. Salta sobre los monstruos' }, script: WAVES },
  { id: 'hide', key: 'tpl_hide', mode: 'arena', config: { world: 'hills', allow_build: false, script_lang: 'lua', welcome: 'Escondite: uno busca, los demás se esconden' }, script: HIDE },
  { id: 'sky', key: 'tpl_sky', mode: 'arena', config: { world: 'void', allow_build: false, script_lang: 'lua', welcome: 'Salta entre plataformas y evita la lava' }, script: SKY },
]
