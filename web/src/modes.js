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
