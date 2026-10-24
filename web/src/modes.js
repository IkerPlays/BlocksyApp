// Modos multijugador escritos en Lua con la API estilo Roblox. Todos los jugadores ejecutan el mismo script:
// el "servidor" (RunService:IsServer(), el jugador con el nombre alfabéticamente menor) decide y avisa al resto con un RemoteEvent.
const HEAD = `local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local me = Players.LocalPlayer
local function root(p) local c = p.Character; return c and c:FindFirstChild("HumanoidRootPart") end
local function dist(a, b) local ra, rb = root(a), root(b); if not ra or not rb then return 1e9 end return (ra.Position - rb.Position).Magnitude end
local function byName(n) for _, p in ipairs(Players:GetPlayers()) do if p.Name == n then return p end end end
local remote = Instance.new("RemoteEvent"); remote.Name = "Mode"; remote.Parent = game.ReplicatedStorage
local gui = Instance.new("ScreenGui"); gui.Parent = me.PlayerGui
local status = Instance.new("TextLabel"); status.Size = UDim2.new(0, 360, 0, 46); status.Position = UDim2.new(0.5, 0, 0, 14); status.AnchorPoint = Vector2.new(0.5, 0)
status.BackgroundColor3 = Color3.fromRGB(20, 20, 30); status.BackgroundTransparency = 0.25; status.TextColor3 = Color3.new(1, 1, 1); status.TextSize = 22; status.Text = "..."; status.Parent = gui
Instance.new("UICorner", status).CornerRadius = UDim.new(0, 12)
local red = Instance.new("Team", game.Teams); red.Name = "Rojo"; red.TeamColor = BrickColor.new("Bright red")
local grey = Instance.new("Team", game.Teams); grey.Name = "Fuera"; grey.TeamColor = BrickColor.new("Medium stone grey")
local function names() local t = {} for _, p in ipairs(Players:GetPlayers()) do t[#t + 1] = p.Name end table.sort(t) return t end
`
export const TAG = HEAD + `-- PILLA-PILLA: uno la lleva; toca a otro para pasársela. Gana quien menos tiempo la lleve.
local it, left, score, cooldown = nil, 90, {}, 0
local function apply()
  for _, p in ipairs(Players:GetPlayers()) do p.Team = (p.Name == it) and red or nil end
  local h = me.Character and me.Character:FindFirstChildOfClass("Humanoid"); if h then h.WalkSpeed = (it == me.Name) and 20 or 16 end
  status.Text = it == nil and "Esperando a más jugadores..." or (it == me.Name and "¡La llevas tú! Toca a alguien" or (it .. " la lleva")) .. "  ·  " .. math.max(0, math.floor(left)) .. " s"
end
remote.OnClientEvent:Connect(function(kind, a, b)
  if kind == "it" then it = a; apply()
  elseif kind == "time" then left = a; score = b or score; apply()
  elseif kind == "end" then game.title("Gana " .. tostring(a) .. "!", 5000); game.sound("win") end
end)
me.CharacterAdded:Connect(function() task.wait(0.5); apply() end)
task.spawn(function()
  local acc = 0
  while true do
    task.wait(0.2)
    if RunService:IsServer() then
      local list = Players:GetPlayers()
      if #list < 2 then it = nil; left = 90; remote:FireAllClients("it", nil)
      else
        if not it or not byName(it) then it = list[math.random(#list)].Name; remote:FireAllClients("it", it) end
        cooldown -= 0.2
        local holder = byName(it)
        if holder and cooldown <= 0 then
          for _, p in ipairs(list) do
            if p ~= holder and dist(holder, p) < 2.2 then it = p.Name; cooldown = 1.5; remote:FireAllClients("it", it) break end
          end
        end
        acc += 0.2; left -= 0.2
        if acc >= 1 then acc = 0; for _, p in ipairs(list) do if p.Name ~= it then score[p.Name] = (score[p.Name] or 0) + 1 end end; remote:FireAllClients("time", left, score) end
        if left <= 0 then
          local best, bn = -1, "nadie"; for n, s in pairs(score) do if s > best then best, bn = s, n end end
          remote:FireAllClients("end", bn); task.wait(6); left = 90; score = {}
        end
      end
    end
  end
end)
apply()`
export const FLAG = HEAD + `-- ROBA LA BANDERA: quien la lleva suma 1 punto por segundo; acércate al que la tiene para robársela. Gana quien llegue a 30.
local flag = Instance.new("Part"); flag.Size = Vector3.new(1, 3, 1); flag.Color = Color3.fromRGB(255, 210, 40); flag.Material = Enum.Material.Neon; flag.Anchored = true; flag.CanCollide = false
flag.Position = Vector3.new(0, 2, 0); flag.Parent = workspace
local light = Instance.new("PointLight", flag); light.Range = 14
local holder, points, steal = nil, {}, 0
local function refresh()
  local list = {}; for n, v in pairs(points) do list[#list + 1] = n .. " " .. v end table.sort(list)
  status.Text = (holder and (holder .. " tiene la bandera") or "La bandera está libre") .. "  ·  " .. table.concat(list, "  ")
  for _, p in ipairs(Players:GetPlayers()) do p.Team = (p.Name == holder) and red or nil end
end
remote.OnClientEvent:Connect(function(kind, a, b)
  if kind == "holder" then holder = a; refresh()
  elseif kind == "points" then points = a; refresh()
  elseif kind == "win" then game.title("Gana " .. tostring(a) .. "!", 5000); game.sound("win"); points = {} end
end)
RunService.Heartbeat:Connect(function()
  local p = holder and byName(holder); local r = p and root(p)
  if r then flag.Position = r.Position + Vector3.new(0, 3, 0) else flag.Position = Vector3.new(0, 2 + math.sin(os.clock() * 2) * 0.3, 0) end
end)
task.spawn(function()
  local acc = 0
  while true do
    task.wait(0.2)
    if RunService:IsServer() then
      local list = Players:GetPlayers(); steal -= 0.2
      local hp = holder and byName(holder); if holder and not hp then holder = nil; remote:FireAllClients("holder", nil) end
      for _, p in ipairs(list) do
        local r = root(p)
        if r and p.Name ~= holder and steal <= 0 then
          local near = hp and dist(hp, p) < 2.3 or (not hp and (r.Position - Vector3.new(0, 2, 0)).Magnitude < 3)
          if near then holder = p.Name; steal = 2; remote:FireAllClients("holder", holder) break end
        end
      end
      acc += 0.2
      if acc >= 1 and holder then
        acc = 0; points[holder] = (points[holder] or 0) + 1; remote:FireAllClients("points", points)
        if points[holder] >= 30 then remote:FireAllClients("win", holder); points = {}; holder = nil; remote:FireAllClients("holder", nil) end
      end
    end
  end
end)
refresh()`
export const WAVES = HEAD + `-- OLEADAS: sobrevive a los monstruos que te persiguen. Salta encima de ellos para derrotarlos.
local enemies, wave, lastHit, alive = {}, 0, 0, true
local parts = {}
local function enemyPart(i)
  if parts[i] then return parts[i] end
  local p = Instance.new("Part"); p.Size = Vector3.new(1.4, 1.6, 1.4); p.Color = Color3.fromRGB(180, 40, 60); p.Material = Enum.Material.Neon; p.Anchored = true; p.CanCollide = false; p.Parent = workspace
  parts[i] = p; return p
end
remote.OnClientEvent:Connect(function(kind, a, b)
  if kind == "enemies" then
    enemies = a
    for i = 1, math.max(#enemies, #parts) do
      local e = enemies[i]
      if e then enemyPart(i).Position = Vector3.new(e[1], 1, e[2]); parts[i].Transparency = 0 elseif parts[i] then parts[i].Transparency = 1 end
    end
  elseif kind == "wave" then wave = a; game.title("Oleada " .. a, 2500); status.Text = "Oleada " .. a
  elseif kind == "over" then game.title("Todos eliminados. Llegasteis a la oleada " .. a, 5000) end
end)
RunService.Heartbeat:Connect(function()
  local r = root(me); if not r or not alive then return end
  for i, e in ipairs(enemies) do
    local d = (Vector3.new(e[1], 1, e[2]) - r.Position)
    if d.Magnitude < 1.6 then
      if r.Position.Y > 1.8 + 0.2 and tick() - lastHit > 0.3 then remote:FireServer("kill", i); lastHit = tick()
      elseif tick() - lastHit > 1.2 then
        lastHit = tick(); local h = me.Character:FindFirstChildOfClass("Humanoid"); h.Health -= 25; game.sound("hit")
        if h.Health <= 0 then alive = false; remote:FireServer("dead"); task.delay(5, function() alive = true end) end
      end
    end
  end
end)
if true then
  local dead = {}
  remote.OnServerEvent:Connect(function(p, kind, i)
    if kind == "kill" and enemies[i] then enemies[i][3] = 0 elseif kind == "dead" then dead[p.Name] = os.clock() end
  end)
  task.spawn(function()
    while true do
      task.wait(0.25)
      if RunService:IsServer() then
        local list = Players:GetPlayers()
        if #list > 0 then
          local count = 0; for _, e in ipairs(enemies) do if (e[3] or 1) ~= 0 then count += 1 end end
          if count == 0 then
            wave += 1; enemies = {}
            for i = 1, math.min(12, 2 + wave * 2) do local a = math.random() * math.pi * 2; enemies[i] = { math.cos(a) * 24, math.sin(a) * 24, 1 } end
            remote:FireAllClients("wave", wave)
          end
          for _, e in ipairs(enemies) do
            if (e[3] or 1) ~= 0 then
              local best, bp = 1e9, nil; for _, p in ipairs(list) do local r = root(p); if r and (not dead[p.Name] or os.clock() - dead[p.Name] > 5) then local d = (Vector3.new(e[1], 1, e[2]) - r.Position).Magnitude; if d < best then best, bp = d, r end end end
              if bp then local dx, dz = bp.Position.X - e[1], bp.Position.Z - e[2]; local m = math.sqrt(dx * dx + dz * dz) + 0.001; e[1] += dx / m * (1.1 + wave * 0.12); e[2] += dz / m * (1.1 + wave * 0.12) end
            end
          end
          local out = {}; for _, e in ipairs(enemies) do if (e[3] or 1) ~= 0 then out[#out + 1] = { math.floor(e[1] * 10) / 10, math.floor(e[2] * 10) / 10 } end end
          remote:FireAllClients("enemies", out)
          enemies = (function() local keep = {} for _, e in ipairs(enemies) do if (e[3] or 1) ~= 0 then keep[#keep + 1] = e end end return keep end)()
        end
      end
    end
  end)
end
status.Text = "Oleada 0 — esperando"`
export const HIDE = HEAD + `-- ESCONDITE: uno busca y los demás se esconden. 20 s para esconderse, luego 90 s para encontrar a todos.
local seeker, phase, left, found = nil, "wait", 0, {}
local function apply()
  for _, p in ipairs(Players:GetPlayers()) do p.Team = (p.Name == seeker) and red or (found[p.Name] and grey or nil) end
  local h = me.Character and me.Character:FindFirstChildOfClass("Humanoid"); if h then h.WalkSpeed = (me.Name == seeker and phase == "hide") and 0 or 16 end
  local what = phase == "hide" and (me.Name == seeker and "Cuenta hasta " or "Escóndete! Busca ") or phase == "seek" and (me.Name == seeker and "Encuéntralos" or "Busca: ") or "Esperando jugadores"
  status.Text = what .. (phase == "hide" and (seeker or "") or "") .. "  ·  " .. math.max(0, math.floor(left)) .. " s"
end
remote.OnClientEvent:Connect(function(kind, a, b, c)
  if kind == "state" then seeker, phase, left, found = a, b, c.left, c.found or {}; apply()
  elseif kind == "end" then game.title(a, 5000); game.sound("win") end
end)
task.spawn(function()
  while true do
    task.wait(1)
    if RunService:IsServer() then
      local list = Players:GetPlayers()
      if #list < 2 then phase = "wait"; seeker = nil; found = {}
      elseif phase == "wait" then seeker = list[math.random(#list)].Name; phase = "hide"; left = 20; found = {}
      else
        left -= 1
        if phase == "hide" and left <= 0 then phase = "seek"; left = 90 end
        if phase == "seek" then
          local s = byName(seeker); local pending = 0
          for _, p in ipairs(list) do if p.Name ~= seeker then if not found[p.Name] and s and dist(s, p) < 2.5 then found[p.Name] = true end if not found[p.Name] then pending += 1 end end end
          if not s then phase = "wait" elseif pending == 0 then remote:FireAllClients("end", seeker .. " los encontró a todos"); phase = "wait"; task.wait(5)
          elseif left <= 0 then remote:FireAllClients("end", "Ganan los que se escondieron"); phase = "wait"; task.wait(5) end
        end
      end
      remote:FireAllClients("state", seeker, phase, { left = left, found = found })
    end
  end
end)
apply()`

// ---------- Arena PvP, Equipos y Carreras con vueltas ----------
// Combate compartido: clic (o F) golpea con la espada al jugador más cercano a menos de 5 m. El golpe viaja por el servidor (el jugador con el nombre
// alfabéticamente menor), cada cliente se resta su propia vida y, al morir, avisa quién lo mató para que el servidor cuente la baja.
const COMBAT = `local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UIS = game:GetService("UserInputService")
local me = Players.LocalPlayer
local function root(p) local c = p.Character; return c and c:FindFirstChild("HumanoidRootPart") end
local function dist(a, b) local ra, rb = root(a), root(b); if not ra or not rb then return 1e9 end return (ra.Position - rb.Position).Magnitude end
local function byName(n) for _, p in ipairs(Players:GetPlayers()) do if p.Name == n then return p end end end
local remote = Instance.new("RemoteEvent"); remote.Name = "Arena"; remote.Parent = game.ReplicatedStorage
local gui = Instance.new("ScreenGui"); gui.Parent = me.PlayerGui
local function label(w, h, x, y, ax, size)
  local l = Instance.new("TextLabel"); l.Size = UDim2.new(0, w, 0, h); l.Position = UDim2.new(x, 0, 0, y); l.AnchorPoint = Vector2.new(ax, 0)
  l.BackgroundColor3 = Color3.fromRGB(20, 20, 30); l.BackgroundTransparency = 0.25; l.TextColor3 = Color3.new(1, 1, 1); l.TextSize = size; l.Parent = gui
  Instance.new("UICorner", l).CornerRadius = UDim.new(0, 12); return l
end
local status = label(380, 44, 0.5, 14, 0.5, 20)
local board = label(220, 150, 1, 70, 1, 16); board.TextXAlignment = Enum.TextXAlignment.Left
local hpBar = label(140, 36, 0, 14, 0, 20)
hpBar.Position = UDim2.new(0, 14, 1, -96); hpBar.TextColor3 = Color3.fromRGB(255, 120, 120)
local DMG, RANGE, COOLDOWN, GOAL = 25, 5, 0.55, GOAL_VALUE
local kills, deaths, lastAttacker, cd, protect, over = {}, {}, nil, 0, 0, false
local function hum() return me.Character and me.Character:FindFirstChildOfClass("Humanoid") end
local function swingFx(name)
  local p = byName(name); local r = p and root(p); if not r then return end
  local s = Instance.new("Part"); s.Size = Vector3.new(0.3, 0.3, 3.2); s.Color = Color3.fromRGB(200, 230, 255); s.Material = Enum.Material.Neon; s.Anchored = true; s.CanCollide = false
  s.Position = r.Position + Vector3.new(0, 1.2, 0); s.Parent = workspace; task.delay(0.18, function() s:Destroy() end)
end
local function nearest()
  local best, bd = nil, RANGE
  for _, p in ipairs(Players:GetPlayers()) do if p ~= me and canHit(p) then local d = dist(me, p); if d < bd then best, bd = p, d end end end
  return best
end
local function attack()
  if cd > 0 or over then return end
  cd = COOLDOWN; game.sound("laser"); remote:FireServer("swing")
  local t = nearest(); if t then remote:FireServer("hit", t.Name, DMG) end
end
UIS.InputBegan:Connect(function(inp, gp)
  if inp.UserInputType == Enum.UserInputType.MouseButton1 or inp.KeyCode == Enum.KeyCode.F or inp.KeyCode == Enum.KeyCode.E then attack() end
end)
local function setup()
  local h = hum(); if not h then return end
  h.MaxHealth = 100; h.Health = 100; protect = 2.5
  h.Died:Connect(function() remote:FireServer("died", lastAttacker); lastAttacker = nil; protect = 2.5 end)
end
me.CharacterAdded:Connect(function() task.wait(0.3); setup() end)
remote.OnClientEvent:Connect(function(kind, a, b, c)
  if kind == "swing" then if a ~= me.Name then swingFx(a) else swingFx(me.Name) end
  elseif kind == "dmg" then
    if a == me.Name and protect <= 0 and not over then local h = hum(); if h and h.Health > 0 and canBeHit(b) then lastAttacker = b; h:TakeDamage(c); game.sound("hit") end end
  elseif kind == "feed" then status.Text = tostring(a) .. "  >  " .. tostring(b); if a == me.Name then game.sound("coin") end
  elseif kind == "score" then kills, deaths = a, b; render()
  elseif kind == "win" then over = true; game.title(tostring(a) .. " gana!", 5000); game.sound("win"); status.Text = tostring(a) .. " gana!"
  elseif kind == "reset" then over = false; kills, deaths = {}, {}; render() end
end)
task.spawn(function()
  local tick = 0
  remote.OnServerEvent:Connect(function(player, kind, a, b)
    if kind == "swing" then remote:FireAllClients("swing", player.Name)
    elseif kind == "hit" and not over then local v = byName(a); if v and dist(player, v) < RANGE + 2 and canHitServer(player, v) then remote:FireAllClients("dmg", a, player.Name, math.min(b or DMG, 40)) end
    elseif kind == "died" then
      deaths[player.Name] = (deaths[player.Name] or 0) + 1
      if a and a ~= player.Name then kills[a] = (kills[a] or 0) + 1; onKill(a, player.Name) end
      if a and a ~= player.Name then remote:FireAllClients("feed", a, player.Name) end
      remote:FireAllClients("score", kills, deaths)
    end
  end)
  while true do
    task.wait(0.1)
    cd -= 0.1; protect -= 0.1
    tick += 1
    if RunService:IsServer() then checkWin(); if tick % 20 == 0 then remote:FireAllClients("score", kills, deaths) end end
    local hh = hum(); hpBar.Text = hh and ("Vida " .. math.floor(hh.Health) .. (protect > 0 and " (protegido)" or "")) or ""
    local h = hum(); if h and h.Health > 0 and protect < -5 and h.Health < h.MaxHealth then h.Health += 0.6 end        -- se recupera poco a poco sin recibir golpes
  end
end)
setup()
`
export const ARENA = COMBAT.replace('GOAL_VALUE', '15') + `
-- ARENA PVP: todos contra todos. Gana quien llegue a 15 bajas.
function canHit(p) return true end
function canBeHit(attacker) return true end
function canHitServer(a, v) return true end
function onKill(a, v) end
function render()
  local list = {}; for _, p in ipairs(Players:GetPlayers()) do list[#list + 1] = { n = p.Name, k = kills[p.Name] or 0, d = deaths[p.Name] or 0 } end
  table.sort(list, function(x, y) return x.k > y.k end)
  local t = "BAJAS  (meta " .. GOAL .. ")\\n"; for i = 1, math.min(6, #list) do t = t .. list[i].n .. "  " .. list[i].k .. " / " .. list[i].d .. "\\n" end
  board.Text = t; status.Text = over and status.Text or "Clic o F para golpear"
end
function checkWin()
  if over then return end
  for n, k in pairs(kills) do if k >= GOAL then over = true; remote:FireAllClients("win", n); task.delay(7, function() kills, deaths = {}, {}; over = false; remote:FireAllClients("reset") end) return end end
end
render()`
export const TEAMS = COMBAT.replace('GOAL_VALUE', '20') + `
-- EQUIPOS: Rojo contra Azul. Cada baja suma un punto a tu equipo; gana el primero en llegar a 20. No hay fuego amigo.
local redT = Instance.new("Team", game.Teams); redT.Name = "Rojo"; redT.TeamColor = BrickColor.new("Bright red")
local blueT = Instance.new("Team", game.Teams); blueT.Name = "Azul"; blueT.TeamColor = BrickColor.new("Bright blue")
local teamScore = { Rojo = 0, Azul = 0 }
local function teamOf(name)                                    -- reparto estable: los nombres ordenados se alternan entre equipos
  local t = {}; for _, p in ipairs(Players:GetPlayers()) do t[#t + 1] = p.Name end; table.sort(t)
  for i, n in ipairs(t) do if n == name then return (i % 2 == 1) and "Rojo" or "Azul" end end
  return "Rojo"
end
local function assign() for _, p in ipairs(Players:GetPlayers()) do p.Team = (teamOf(p.Name) == "Rojo") and redT or blueT end end
function canHit(p) return teamOf(p.Name) ~= teamOf(me.Name) end
function canBeHit(attacker) return teamOf(attacker) ~= teamOf(me.Name) end
function canHitServer(a, v) return teamOf(a.Name) ~= teamOf(v.Name) end
function onKill(a, v) local t = teamOf(a); teamScore[t] += 1; remote:FireAllClients("team", teamScore.Rojo, teamScore.Azul) end
remote.OnClientEvent:Connect(function(kind, a, b) if kind == "team" then teamScore.Rojo, teamScore.Azul = a, b; render() elseif kind == "reset" then teamScore.Rojo, teamScore.Azul = 0, 0; render() end end)
function render()
  assign()
  local mine = teamOf(me.Name)
  status.Text = over and status.Text or ("ROJO " .. teamScore.Rojo .. "  —  " .. teamScore.Azul .. " AZUL   ·   eres " .. string.upper(mine))
  local list = {}; for _, p in ipairs(Players:GetPlayers()) do list[#list + 1] = { n = p.Name, k = kills[p.Name] or 0, t = teamOf(p.Name) } end
  table.sort(list, function(x, y) return x.k > y.k end)
  local t = "JUGADORES\\n"; for i = 1, math.min(6, #list) do t = t .. "[" .. string.sub(list[i].t, 1, 1) .. "] " .. list[i].n .. "  " .. list[i].k .. "\\n" end
  board.Text = t
end
function checkWin()
  if over then return end
  for team, s in pairs(teamScore) do if s >= GOAL then over = true; remote:FireAllClients("win", "Equipo " .. team); task.delay(7, function() teamScore.Rojo, teamScore.Azul = 0, 0; kills, deaths = {}, {}; over = false; remote:FireAllClients("reset"); remote:FireAllClients("team", 0, 0) end) return end end
end
Players.PlayerAdded:Connect(function() task.wait(0.5); render() end)
render()`
export const RACE = `-- CARRERA CON VUELTAS: pasa por las puertas en orden, completa 3 vueltas y gana. El servidor cuenta atrás y reparte los puestos.
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local me = Players.LocalPlayer
local remote = Instance.new("RemoteEvent"); remote.Name = "Race"; remote.Parent = game.ReplicatedStorage
local GATES, LAPS, R = 8, 3, 38
local gui = Instance.new("ScreenGui"); gui.Parent = me.PlayerGui
local function label(w, h, x, y, ax, size)
  local l = Instance.new("TextLabel"); l.Size = UDim2.new(0, w, 0, h); l.Position = UDim2.new(x, 0, 0, y); l.AnchorPoint = Vector2.new(ax, 0)
  l.BackgroundColor3 = Color3.fromRGB(20, 20, 30); l.BackgroundTransparency = 0.25; l.TextColor3 = Color3.new(1, 1, 1); l.TextSize = size; l.Parent = gui
  Instance.new("UICorner", l).CornerRadius = UDim.new(0, 12); return l
end
local status, board = label(420, 46, 0.5, 14, 0.5, 22), label(210, 130, 1, 70, 1, 16)
board.TextXAlignment = Enum.TextXAlignment.Left
local gates = {}
for i = 1, GATES do
  local a = (i - 1) / GATES * math.pi * 2
  local cx, cz = math.cos(a) * R, math.sin(a) * R
  local g = Instance.new("Part"); g.Shape = Enum.PartType.Cylinder; g.Size = Vector3.new(0.6, 9, 9); g.Anchored = true; g.CanCollide = false
  g.Material = Enum.Material.Neon; g.Transparency = 0.45; g.Color = (i == 1) and Color3.fromRGB(80, 255, 120) or Color3.fromRGB(80, 180, 255)
  g.Position = Vector3.new(cx, 4.5, cz); g.Name = "Gate" .. i; g.Parent = workspace; gates[i] = { part = g, x = cx, z = cz }
end
local state, left, lap, nextGate, startAt, finished = "wait", 0, 1, 2, 0, false
local progress, order = {}, {}
local best = nil
local function paint()
  for i, g in ipairs(gates) do g.part.Color = (i == nextGate and state == "go") and Color3.fromRGB(255, 220, 60) or ((i == 1) and Color3.fromRGB(80, 255, 120) or Color3.fromRGB(80, 180, 255)) end
  if state == "wait" then status.Text = "Esperando jugadores..."
  elseif state == "count" then status.Text = "Salida en " .. math.max(0, math.ceil(left))
  elseif state == "go" and not finished then status.Text = "Vuelta " .. math.min(lap, LAPS) .. "/" .. LAPS .. "  ·  puerta " .. nextGate .. "  ·  " .. string.format("%.1f", os.clock() - startAt) .. " s"
  end
  local t = "CLASIFICACION\\n"; for i = 1, math.min(6, #order) do t = t .. i .. ". " .. order[i] .. "\\n" end; board.Text = t
end
local function toStart()
  local h = me.Character and me.Character:FindFirstChildOfClass("Humanoid"); if h then h.WalkSpeed = 0 end
  local names = {}; for _, p in ipairs(Players:GetPlayers()) do names[#names + 1] = p.Name end; table.sort(names)
  local idx = 1; for i, n in ipairs(names) do if n == me.Name then idx = i end end
  game.teleport(R + 4, 3, (idx - 1) * 3 - 3)
end
remote.OnClientEvent:Connect(function(kind, a, b)
  if kind == "state" then
    local was = state; state, left = a, b
    if state == "count" and was ~= "count" then lap, nextGate, finished = 1, 2, false; toStart()
    elseif state == "go" and was ~= "go" then startAt = os.clock(); local h = me.Character and me.Character:FindFirstChildOfClass("Humanoid"); if h then h.WalkSpeed = 22 end; game.title("¡YA!", 1500); game.sound("powerup")
    elseif state == "wait" then local h = me.Character and me.Character:FindFirstChildOfClass("Humanoid"); if h then h.WalkSpeed = 16 end end
    paint()
  elseif kind == "order" then order = a; paint()
  elseif kind == "end" then game.title(tostring(a) .. " gana la carrera!", 5000); game.sound("win") end
end)
task.spawn(function()
  local prog, winner, t0 = {}, nil, 0
  remote.OnServerEvent:Connect(function(player, kind, a, b)
    if kind == "prog" then prog[player.Name] = (a - 1) * GATES + b
    elseif kind == "finish" and not winner then winner = player.Name; remote:FireAllClients("end", winner) end
  end)
  local sstate, sleft = "wait", 0
  while true do
    task.wait(0.25)
    if RunService:IsServer() then
      local n = #Players:GetPlayers()
      if sstate == "wait" and n >= 1 then sstate, sleft, prog, winner = "count", 10, {}, nil
      elseif sstate == "count" then sleft -= 0.25; if sleft <= 0 then sstate, sleft = "go", 0 end
      elseif sstate == "go" then sleft += 0.25; if winner and sleft > 8 then sstate = "wait" end; if winner then sleft += 0 end end
      local names = {}; for k in pairs(prog) do names[#names + 1] = k end
      table.sort(names, function(x, y) return prog[x] > prog[y] end)
      remote:FireAllClients("state", sstate, sleft); remote:FireAllClients("order", names)
    end
    if state == "go" and not finished then
      local r = me.Character and me.Character:FindFirstChild("HumanoidRootPart")
      if r then
        local g = gates[nextGate]
        if g and (Vector3.new(g.x, r.Position.Y, g.z) - r.Position).Magnitude < 6 then
          if nextGate == 1 then lap += 1 end
          if lap > LAPS then finished = true; remote:FireServer("finish"); local tt = os.clock() - startAt; if not best or tt < best then best = tt end; status.Text = "¡Has terminado! " .. string.format("%.1f", tt) .. " s  ·  mejor " .. string.format("%.1f", best) .. " s"
          else nextGate = nextGate % GATES + 1; remote:FireServer("prog", lap, nextGate); game.sound("checkpoint") end
        end
      end
      paint()
    end
  end
end)
paint()`

// Herramientas equipables: aparecen en la barra de abajo (teclas 1-9). El clic las usa (Activated).
export const TOOLS = `-- ARMERIA: tres herramientas en tu inventario. Pulsa 1, 2 o 3 para equiparlas y haz clic para usarlas.
local Players = game:GetService("Players")
local me = Players.LocalPlayer
local function root() local c = me.Character; return c and c:FindFirstChild("HumanoidRootPart") end
local function give(name, tip, fn)
  local t = Instance.new("Tool"); t.Name = name; t.ToolTip = tip; t.Parent = me.Backpack
  t.Activated:Connect(fn); return t
end
give("Espada", "Golpea", function()
  local r = root(); if not r then return end
  local s = Instance.new("Part"); s.Size = Vector3.new(0.3, 0.3, 3.2); s.Color = Color3.fromRGB(200, 230, 255); s.Material = Enum.Material.Neon
  s.Anchored = true; s.CanCollide = false; s.Position = r.Position + Vector3.new(0, 1.2, 0); s.Parent = workspace
  game.sound("laser"); task.delay(0.2, function() s:Destroy() end)
end)
give("Botiquin", "Cura 30 de vida", function()
  local h = me.Character and me.Character:FindFirstChildOfClass("Humanoid")
  if h then h.Health = h.Health + 30; game.sound("powerup"); game.title("+30 vida", 800) end
end)
give("Bengala", "Deja una luz", function()
  local r = root(); if not r then return end
  local p = Instance.new("Part"); p.Size = Vector3.new(0.6, 0.6, 0.6); p.Color = Color3.fromRGB(255, 150, 60); p.Material = Enum.Material.Neon
  p.Anchored = true; p.CanCollide = false; p.Position = r.Position + Vector3.new(0, 0.5, 0); p.Parent = workspace
  local l = Instance.new("PointLight"); l.Range = 18; l.Brightness = 2; l.Color = Color3.fromRGB(255, 160, 80); l.Parent = p
  task.delay(15, function() p:Destroy() end)
end)
game.title("Pulsa 1, 2 o 3", 2500)`

// Rey de la colina: quien permanezca dentro del círculo dorado suma un punto por segundo. Gana quien llegue a 60.
export const KOTH = `local Players = game:GetService("Players")
local me = Players.LocalPlayer
local remote = Instance.new("RemoteEvent"); remote.Name = "Koth"; remote.Parent = game.ReplicatedStorage
local GOAL, R, CX, CZ = 60, 6, 0, -12
local hill = Instance.new("Part"); hill.Shape = Enum.PartType.Cylinder; hill.Size = Vector3.new(0.4, R * 2, R * 2); hill.Anchored = true; hill.CanCollide = false
hill.Material = Enum.Material.Neon; hill.Color = Color3.fromRGB(255, 200, 60); hill.Transparency = 0.5; hill.Position = Vector3.new(CX, 0.25, CZ); hill.Parent = workspace
local gui = Instance.new("ScreenGui"); gui.Parent = me.PlayerGui
local function label(w, h, x, y, ax, size)
  local l = Instance.new("TextLabel"); l.Size = UDim2.new(0, w, 0, h); l.Position = UDim2.new(x, 0, 0, y); l.AnchorPoint = Vector2.new(ax, 0)
  l.BackgroundColor3 = Color3.fromRGB(20, 20, 30); l.BackgroundTransparency = 0.25; l.TextColor3 = Color3.new(1, 1, 1); l.TextSize = size; l.Parent = gui
  Instance.new("UICorner", l).CornerRadius = UDim.new(0, 12); return l
end
local status, board = label(420, 44, 0.5, 14, 0.5, 20), label(220, 140, 1, 70, 1, 16)
board.TextXAlignment = Enum.TextXAlignment.Left
local scores, mine, over = {}, 0, false
local function render()
  local list = {}; for n, v in pairs(scores) do list[#list + 1] = { n = n, v = v } end
  table.sort(list, function(a, b) return a.v > b.v end)
  local t = "REY DE LA COLINA (meta " .. GOAL .. ")\\n"; for i = 1, math.min(5, #list) do t = t .. list[i].n .. "  " .. list[i].v .. "\\n" end
  board.Text = t
  if not over then status.Text = (#list > 0 and ("Rey: " .. list[1].n .. " (" .. list[1].v .. ")") or "Entra en el círculo dorado") end
end
remote.OnClientEvent:Connect(function(kind, a, b)
  if kind == "pts" then scores[a] = b; render()
  elseif kind == "win" then over = true; status.Text = tostring(a) .. " es el rey!"; game.title(tostring(a) .. " es el rey!", 4000); game.sound("win")
  elseif kind == "reset" then over = false; scores = {}; mine = 0; render() end
end)
remote.OnServerEvent:Connect(function(player, kind, v)
  if kind == "pt" and not over and type(v) == "number" then
    scores[player.Name] = math.min(v, GOAL); remote:FireAllClients("pts", player.Name, scores[player.Name])
    if v >= GOAL then over = true; remote:FireAllClients("win", player.Name); task.delay(7, function() scores = {}; over = false; remote:FireAllClients("reset") end) end
  end
end)
task.spawn(function()
  while true do
    task.wait(1)
    local c = me.Character; local r = c and c:FindFirstChild("HumanoidRootPart")
    if r and not over and (Vector3.new(CX, r.Position.Y, CZ) - r.Position).Magnitude < R then mine += 1; game.sound("click"); remote:FireServer("pt", mine) end
  end
end)
render()`

// Esquiva: caen bloques en posiciones que todos calculan igual a partir del reloj (sin enviar nada). Cada golpe te devuelve al centro y reinicia tu tiempo.
export const DODGE = `local Players = game:GetService("Players")
local TS = game:GetService("TweenService")
local me = Players.LocalPlayer
local R = 13
local gui = Instance.new("ScreenGui"); gui.Parent = me.PlayerGui
local label = Instance.new("TextLabel"); label.Size = UDim2.new(0, 360, 0, 44); label.Position = UDim2.new(0.5, 0, 0, 14); label.AnchorPoint = Vector2.new(0.5, 0)
label.BackgroundColor3 = Color3.fromRGB(20, 20, 30); label.BackgroundTransparency = 0.25; label.TextColor3 = Color3.new(1, 1, 1); label.TextSize = 20; label.Parent = gui
Instance.new("UICorner", label).CornerRadius = UDim.new(0, 12)
local ring = Instance.new("Part"); ring.Shape = Enum.PartType.Cylinder; ring.Size = Vector3.new(0.3, R * 2, R * 2); ring.Anchored = true; ring.CanCollide = false
ring.Material = Enum.Material.Neon; ring.Color = Color3.fromRGB(255, 90, 90); ring.Transparency = 0.7; ring.Position = Vector3.new(0, 0.2, 0); ring.Parent = workspace
local alive, best, falling = 0, 0, {}
local function spawnAt(x, z)
  local p = Instance.new("Part"); p.Size = Vector3.new(2.4, 2.4, 2.4); p.Anchored = true; p.CanCollide = false; p.Color = Color3.fromRGB(255, 120, 60)
  p.Material = Enum.Material.Neon; p.Position = Vector3.new(x, 22, z); p.Parent = workspace
  TS:Create(p, TweenInfo.new(1.4, Enum.EasingStyle.Linear), { Position = Vector3.new(x, 0.9, z) }):Play()
  falling[#falling + 1] = { part = p, x = x, z = z, born = os.clock() }
end
local function field(k, mul, add) local v = ((k % 10007) * mul + add) % 2003; return (v / 2003 - 0.5) * (R * 1.8) end
local lastK = 0
task.spawn(function()
  while true do
    task.wait(0.1)
    local k = os.time()
    if k ~= lastK then
      lastK = k; alive += 1; if alive > best then best = alive end
      spawnAt(field(k, 9973, 17), field(k, 7919, 311)); spawnAt(field(k, 6571, 977), field(k, 8609, 53))
      if (k % 2 == 0) then spawnAt(field(k, 4513, 421), field(k, 3571, 1291)) end                -- más bloques a medida que pasa el tiempo
      if alive >= 20 then spawnAt(field(k, 2399, 733), field(k, 6173, 89)) end
      label.Text = "Aguantas " .. alive .. " s  ·  mejor " .. best .. " s"
      if alive % 10 == 0 then game.sound("coin"); game.title(alive .. " s!", 700) end
    end
    local c = me.Character; local r = c and c:FindFirstChild("HumanoidRootPart")
    for i = #falling, 1, -1 do
      local f = falling[i]; local age = os.clock() - f.born
      if r and age > 1.0 and age < 1.7 and (Vector3.new(f.x, r.Position.Y, f.z) - r.Position).Magnitude < 1.7 then
        game.sound("hit"); alive = 0; game.teleport(0, 2, 0); f.born = -100
      end
      if age > 2.2 then f.part:Destroy(); table.remove(falling, i) end
    end
  end
end)
game.teleport(0, 2, 0)
game.title("Esquiva los bloques", 2500)`

// Memoria (Simon): cuatro losetas de colores se iluminan en orden; tienes que pisarlas en el mismo orden. Cada ronda añade una más.
export const SIMON = `local Players = game:GetService("Players")
local me = Players.LocalPlayer
local COLS = { Color3.fromRGB(231, 76, 60), Color3.fromRGB(46, 204, 113), Color3.fromRGB(52, 152, 219), Color3.fromRGB(241, 196, 15) }
local POS = { { -6, -6 }, { 6, -6 }, { -6, 6 }, { 6, 6 } }
local gui = Instance.new("ScreenGui"); gui.Parent = me.PlayerGui
local label = Instance.new("TextLabel"); label.Size = UDim2.new(0, 420, 0, 44); label.Position = UDim2.new(0.5, 0, 0, 14); label.AnchorPoint = Vector2.new(0.5, 0)
label.BackgroundColor3 = Color3.fromRGB(20, 20, 30); label.BackgroundTransparency = 0.25; label.TextColor3 = Color3.new(1, 1, 1); label.TextSize = 20; label.Parent = gui
Instance.new("UICorner", label).CornerRadius = UDim.new(0, 12)
local pads = {}
for i = 1, 4 do
  local p = Instance.new("Part"); p.Size = Vector3.new(6, 0.5, 6); p.Anchored = true; p.Color = COLS[i]; p.Transparency = 0.5
  p.Position = Vector3.new(POS[i][1], 0.25, POS[i][2]); p.Parent = workspace; pads[i] = p
end
local function flash(i) pads[i].Transparency = 0; game.sound("click"); task.wait(0.5); pads[i].Transparency = 0.5; task.wait(0.2) end
local function padUnder()
  local c = me.Character; local r = c and c:FindFirstChild("HumanoidRootPart"); if not r then return 0 end
  for i = 1, 4 do if math.abs(r.Position.X - POS[i][1]) < 3 and math.abs(r.Position.Z - POS[i][2]) < 3 then return i end end
  return 0
end
local seq, best = {}, 0
task.spawn(function()
  while true do
    seq[#seq + 1] = math.random(1, 4)
    label.Text = "Mira la secuencia (" .. #seq .. ")"
    task.wait(1)
    for _, v in ipairs(seq) do flash(v) end
    label.Text = "Tu turno: pisa los colores en orden"
    local ok = true
    for i, v in ipairs(seq) do
      local got, t0 = 0, os.clock()
      while got == 0 and os.clock() - t0 < 10 do task.wait(0.1); got = padUnder() end
      if got ~= v then ok = false; break end
      flash(got)
      while padUnder() ~= 0 do task.wait(0.1) end
    end
    if ok then
      if #seq > best then best = #seq end
      game.sound("coin"); game.title("Ronda " .. #seq .. " superada", 1200)
    else
      game.sound("hit"); game.title("Fallaste. Llegaste a " .. (#seq - 1) .. " (mejor " .. math.max(best, #seq - 1) .. ")", 2500)
      seq = {}; task.wait(2.5)
    end
    task.wait(1)
  end
end)
game.teleport(0, 2, 0)
game.title("Memoriza y repite la secuencia", 2500)`

// Zonas: tres círculos; quien está dentro suma un punto por segundo y se queda con la zona (se pinta de su color). Gana quien llega a la meta.
export const ZONES = `local Players = game:GetService("Players")
local me = Players.LocalPlayer
local remote = Instance.new("RemoteEvent"); remote.Name = "Zones"; remote.Parent = game.ReplicatedStorage
local GOAL, R = 40, 5
local ZP = { { -12, -8 }, { 12, -8 }, { 0, 14 } }
local gui = Instance.new("ScreenGui"); gui.Parent = me.PlayerGui
local function label(w, h, x, y, ax, size)
  local l = Instance.new("TextLabel"); l.Size = UDim2.new(0, w, 0, h); l.Position = UDim2.new(x, 0, 0, y); l.AnchorPoint = Vector2.new(ax, 0)
  l.BackgroundColor3 = Color3.fromRGB(20, 20, 30); l.BackgroundTransparency = 0.25; l.TextColor3 = Color3.new(1, 1, 1); l.TextSize = size; l.Parent = gui
  Instance.new("UICorner", l).CornerRadius = UDim.new(0, 12); return l
end
local status, board = label(420, 44, 0.5, 14, 0.5, 20), label(220, 140, 1, 70, 1, 16)
board.TextXAlignment = Enum.TextXAlignment.Left
local zones, owner, scores, mine, over = {}, {}, {}, 0, false
for i = 1, 3 do
  local z = Instance.new("Part"); z.Shape = Enum.PartType.Cylinder; z.Size = Vector3.new(0.4, R * 2, R * 2); z.Anchored = true; z.CanCollide = false
  z.Material = Enum.Material.Neon; z.Color = Color3.fromRGB(255, 200, 60); z.Transparency = 0.5; z.Position = Vector3.new(ZP[i][1], 0.25, ZP[i][2]); z.Parent = workspace; zones[i] = z
end
local function paint(i)
  local o = owner[i]
  zones[i].Color = o == nil and Color3.fromRGB(255, 200, 60) or (o == me.Name and Color3.fromRGB(80, 220, 120) or Color3.fromRGB(235, 80, 80))
end
local function render()
  local list = {}; for n, v in pairs(scores) do list[#list + 1] = { n = n, v = v } end
  table.sort(list, function(a, b) return a.v > b.v end)
  local t = "ZONAS (meta " .. GOAL .. ")\\n"; for i = 1, math.min(5, #list) do t = t .. list[i].n .. "  " .. list[i].v .. "\\n" end
  board.Text = t
  if not over then status.Text = "Conquista los círculos: verde = tuyo, rojo = rival" end
end
remote.OnClientEvent:Connect(function(kind, a, b, c)
  if kind == "zone" then owner[a] = b; scores[b] = c; paint(a); render()
  elseif kind == "win" then over = true; status.Text = tostring(a) .. " domina el mapa!"; game.title(tostring(a) .. " gana!", 4000); game.sound("win")
  elseif kind == "reset" then over = false; scores = {}; owner = {}; mine = 0; for i = 1, 3 do paint(i) end; render() end
end)
remote.OnServerEvent:Connect(function(player, kind, i, v)
  if kind == "hold" and not over and type(v) == "number" and ZP[i] then
    scores[player.Name] = math.min(v, GOAL); owner[i] = player.Name; remote:FireAllClients("zone", i, player.Name, scores[player.Name])
    if v >= GOAL then over = true; remote:FireAllClients("win", player.Name); task.delay(7, function() scores = {}; owner = {}; over = false; remote:FireAllClients("reset") end) end
  end
end)
task.spawn(function()
  while true do
    task.wait(1)
    local c = me.Character; local r = c and c:FindFirstChild("HumanoidRootPart")
    if r and not over then
      for i = 1, 3 do
        if (Vector3.new(ZP[i][1], r.Position.Y, ZP[i][2]) - r.Position).Magnitude < R then mine += 1; game.sound("click"); remote:FireServer("hold", i, mine); break end
      end
    end
  end
end)
render()`

// Cazatesoros: ocho cofres escondidos en posiciones que salen de una semilla (todos ven los mismos); gana el tiempo.
export const TREASURE = `local Players = game:GetService("Players")
local me = Players.LocalPlayer
local N = 8
local gui = Instance.new("ScreenGui"); gui.Parent = me.PlayerGui
local label = Instance.new("TextLabel"); label.Size = UDim2.new(0, 420, 0, 44); label.Position = UDim2.new(0.5, 0, 0, 14); label.AnchorPoint = Vector2.new(0.5, 0)
label.BackgroundColor3 = Color3.fromRGB(20, 20, 30); label.BackgroundTransparency = 0.25; label.TextColor3 = Color3.new(1, 1, 1); label.TextSize = 20; label.Parent = gui
Instance.new("UICorner", label).CornerRadius = UDim.new(0, 12)
local chests, found, t0, best, round = {}, 0, os.clock(), 0, 0
local function build()
  round += 1; found = 0; t0 = os.clock()
  local seed = 1234 + round * 977
  for i = 1, N do
    seed = (seed * 1103 + 12345) % 65521; local x = (seed / 65521 - 0.5) * 44
    seed = (seed * 1103 + 12345) % 65521; local z = (seed / 65521 - 0.5) * 44
    local c = Instance.new("Part"); c.Size = Vector3.new(1.2, 1, 1.2); c.Anchored = true; c.CanCollide = false; c.Material = Enum.Material.Neon
    c.Color = Color3.fromRGB(255, 200, 40); c.Position = Vector3.new(x, 0.9, z); c.Parent = workspace; chests[i] = c
  end
end
build()
task.spawn(function()
  while true do
    task.wait(0.15)
    local c = me.Character; local r = c and c:FindFirstChild("HumanoidRootPart")
    if r then
      for i = N, 1, -1 do
        local ch = chests[i]
        if ch and (Vector3.new(ch.Position.X, r.Position.Y, ch.Position.Z) - r.Position).Magnitude < 2.2 then
          ch:Destroy(); chests[i] = nil; found += 1; game.sound("coin")
          if found >= N then
            local t = math.floor((os.clock() - t0) * 10) / 10
            if best == 0 or t < best then best = t end
            game.sound("win"); game.title("Todos! " .. t .. " s (mejor " .. best .. " s)", 3500)
            task.wait(4); build()
          end
        end
      end
    end
    label.Text = "Cofres " .. found .. "/" .. N .. "  ·  " .. math.floor(os.clock() - t0) .. " s" .. (best > 0 and ("  ·  mejor " .. best .. " s") or "")
  end
end)
game.teleport(0, 2, 0)
game.title("Encuentra los 8 cofres dorados", 2500)`

// Torre: una espiral de plataformas hacia el cielo con puntos de control cada 10; si caes vuelves al último.
export const TOWER = `local Players = game:GetService("Players")
local me = Players.LocalPlayer
local TOP = 40
local gui = Instance.new("ScreenGui"); gui.Parent = me.PlayerGui
local label = Instance.new("TextLabel"); label.Size = UDim2.new(0, 360, 0, 44); label.Position = UDim2.new(0.5, 0, 0, 14); label.AnchorPoint = Vector2.new(0.5, 0)
label.BackgroundColor3 = Color3.fromRGB(20, 20, 30); label.BackgroundTransparency = 0.25; label.TextColor3 = Color3.new(1, 1, 1); label.TextSize = 20; label.Parent = gui
Instance.new("UICorner", label).CornerRadius = UDim.new(0, 12)
local pos = {}
for i = 1, TOP do
  local a = i * 0.85; local x, y, z = math.cos(a) * 9, i * 2.4, math.sin(a) * 9
  pos[i] = { x, y, z }
  local p = Instance.new("Part"); p.Size = Vector3.new(i % 10 == 0 and 7 or 4.5, 0.6, i % 10 == 0 and 7 or 4.5); p.Anchored = true
  p.Color = i % 10 == 0 and Color3.fromRGB(80, 220, 120) or Color3.fromHSV((i * 0.037) % 1, 0.65, 1); p.Position = Vector3.new(x, y, z); p.Parent = workspace
end
local check, best, won = 0, 0, false
task.spawn(function()
  while true do
    task.wait(0.2)
    local c = me.Character; local r = c and c:FindFirstChild("HumanoidRootPart")
    if r then
      local y = r.Position.Y
      if y > best then best = y end
      for i = 10, TOP, 10 do if y > pos[i][2] - 1 and check < i then check = i; game.sound("coin"); game.title("Punto de control " .. i, 1200) end end
      if y < -4 then
        game.sound("hit")
        if check == 0 then game.teleport(9, 3, 0) else game.teleport(pos[check][1], pos[check][2] + 2, pos[check][3]) end
      end
      if y > pos[TOP][2] - 1 and not won then won = true; game.sound("win"); game.title("Llegaste a la cima!", 4000); task.delay(8, function() won = false; check = 0; game.teleport(9, 3, 0) end) end
      label.Text = "Altura " .. math.floor(y) .. " m  ·  máx " .. math.floor(best) .. " m  ·  control " .. check
    end
  end
end)
game.teleport(9, 3, 0)
game.title("Sube la torre en espiral", 2500)`
