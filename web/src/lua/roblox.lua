-- Capa de compatibilidad con la API de Roblox sobre Lua 5.3 (fengari). Se ejecuta dentro del Worker de scripts.
-- El script solo puede pedir acciones al juego con act(...); el juego decide si las aplica.
-- 1 stud = 1 bloque. Cada jugador ejecuta el script en su navegador (como un LocalScript): el estado no se comparte entre jugadores.
local act, guard, report = __act, __guard, __err
local floor, sqrt, sin, cos, abs, min, max, pi = math.floor, math.sqrt, math.sin, math.cos, math.abs, math.min, math.max, math.pi
for _, n in ipairs({ "dofile", "loadfile", "require", "collectgarbage" }) do _G[n] = nil end

local NOW, EPOCH = 0, 0                 -- segundos desde que arrancó el script / hora real (s)
local function typeof(v)
  local mt = type(v) == "table" and getmetatable(v)
  if mt and mt.__rbx then return mt.__rbx end
  return type(v)
end
_G.typeof = typeof
_G.unpack = table.unpack

-- ---------- utilidades de librería ----------
function math.clamp(x, a, b) if x < a then return a elseif x > b then return b end return x end
function math.sign(x) return x > 0 and 1 or x < 0 and -1 or 0 end
function math.round(x) return floor(x + 0.5) end
function math.lerp(a, b, t) return a + (b - a) * t end
function string.split(s, sep)
  sep = sep or ","; local out, i = {}, 1
  if sep == "" then for c in s:gmatch(".") do out[#out + 1] = c end return out end
  while true do
    local a, b = s:find(sep, i, true)
    if not a then out[#out + 1] = s:sub(i); break end
    out[#out + 1] = s:sub(i, a - 1); i = b + 1
  end
  return out
end
function table.find(t, v, init) for i = init or 1, #t do if t[i] == v then return i end end return nil end
function table.clear(t) for k in pairs(t) do t[k] = nil end end
function table.create(n, v) local t = {} if v ~= nil then for i = 1, n do t[i] = v end end return t end
function table.freeze(t) return t end
function table.isfrozen() return false end
function table.getn(t) return #t end
local function civil(days) -- días desde 1970-01-01 -> año, mes, día
  local z = days + 719468; local era = floor(z / 146097); local doe = z - era * 146097
  local yoe = floor((doe - floor(doe / 1460) + floor(doe / 36524) - floor(doe / 146096)) / 365)
  local y = yoe + era * 400; local doy = doe - (365 * yoe + floor(yoe / 4) - floor(yoe / 100)); local mp = floor((5 * doy + 2) / 153)
  local d = doy - floor((153 * mp + 2) / 5) + 1; local m = mp < 10 and mp + 3 or mp - 9
  return m <= 2 and y + 1 or y, m, d
end
os = {
  time = function(t) if type(t) == "table" then return floor(EPOCH) end return floor(EPOCH + NOW) end,
  clock = function() return NOW end,
  date = function(fmt, t)
    t = floor(t or (EPOCH + NOW)); fmt = fmt or "%c"; local utc = fmt:sub(1, 1) == "!"; if utc then fmt = fmt:sub(2) end
    local days = floor(t / 86400); local s = t - days * 86400; local y, m, d = civil(days)
    local h, mi, se = floor(s / 3600), floor(s % 3600 / 60), s % 60
    if fmt:sub(1, 2) == "*t" then return { year = y, month = m, day = d, hour = h, min = mi, sec = se, wday = (days + 4) % 7 + 1, yday = 1, isdst = false } end
    return (fmt:gsub("%%(%a)", function(c)
      if c == "Y" then return string.format("%04d", y) elseif c == "m" then return string.format("%02d", m) elseif c == "d" then return string.format("%02d", d)
      elseif c == "H" then return string.format("%02d", h) elseif c == "M" then return string.format("%02d", mi) elseif c == "S" then return string.format("%02d", se)
      elseif c == "y" then return string.format("%02d", y % 100) elseif c == "c" then return string.format("%04d-%02d-%02d %02d:%02d:%02d", y, m, d, h, mi, se) end
      return "%" .. c
    end))
  end,
  difftime = function(a, b) return a - (b or 0) end,
}
function tick() return EPOCH + NOW end
function time() return NOW end
function elapsedTime() return NOW end
function version() return "blocksy-lua-1" end
function print(...)
  local p = table.pack(...); local out = {}
  for i = 1, p.n do out[i] = tostring(p[i]) end
  act("print", table.concat(out, " "))
end
function warn(...) local p = table.pack(...); local out = {} for i = 1, p.n do out[i] = tostring(p[i]) end act("print", "! " .. table.concat(out, " ")) end

-- ---------- hilos y planificador (task, wait, spawn, delay) ----------
local sleeping, dead = {}, {}
local function resume(co, ...)
  if dead[co] or coroutine.status(co) ~= "suspended" then return end
  guard(co)
  local ok, e = coroutine.resume(co, ...)
  if not ok then report(tostring(e)) end
end
local task = {}
function task.wait(t)
  t = tonumber(t) or 0; if t < 0.03 then t = 0.03 end
  local co = coroutine.running(); sleeping[#sleeping + 1] = { co = co, at = NOW + t, t0 = NOW }
  return coroutine.yield()
end
function task.spawn(f, ...)
  if type(f) == "thread" then resume(f, ...) return f end
  local co = coroutine.create(f); resume(co, ...); return co
end
function task.defer(f, ...)
  local args = table.pack(...); local co = coroutine.create(function() f(table.unpack(args, 1, args.n)) end)
  sleeping[#sleeping + 1] = { co = co, at = NOW, t0 = NOW }; return co
end
function task.delay(t, f, ...)
  local args = table.pack(...)
  local co = coroutine.create(function() task.wait(t); f(table.unpack(args, 1, args.n)) end); resume(co); return co
end
function task.cancel(co) dead[co] = true end
function task.synchronize() end
function task.desynchronize() end
_G.task = task
function wait(t) local e = task.wait(t); return e, NOW end
spawn, delay = task.spawn, function(t, f) return task.delay(t, f) end
local function runSleepers()
  local list = sleeping; sleeping = {}
  for _, s in ipairs(list) do
    if dead[s.co] then
    elseif s.at <= NOW then resume(s.co, NOW - s.t0)
    else sleeping[#sleeping + 1] = s end
  end
end

-- ---------- señales (eventos) ----------
local Conn = { __rbx = "RBXScriptConnection" }; Conn.__index = Conn
function Conn.Disconnect(c) c.Connected = false; local l = c._sig and c._sig._c; if l then for i = #l, 1, -1 do if l[i] == c then table.remove(l, i) end end end end
local Signal = { __rbx = "RBXScriptSignal" }; Signal.__index = Signal
local function newSignal(onfirst) return setmetatable({ _c = {}, _w = {}, _first = onfirst }, Signal) end
local function fireFn(fn, ...)
  local co = coroutine.create(fn); resume(co, ...)
end
function Signal:Connect(fn)
  if type(fn) ~= "function" then error("Connect: se esperaba una funcion", 2) end
  if self._first then local f = self._first; self._first = nil; f() end
  local c = setmetatable({ Connected = true, _fn = fn, _sig = self }, Conn); self._c[#self._c + 1] = c; return c
end
function Signal:Once(fn) local c; c = self:Connect(function(...) c:Disconnect(); fn(...) end); return c end
function Signal:Wait()
  if self._first then local f = self._first; self._first = nil; f() end
  self._w[#self._w + 1] = coroutine.running(); return coroutine.yield()
end
function Signal:Fire(...)
  local list = {}; for i, c in ipairs(self._c) do list[i] = c end
  for _, c in ipairs(list) do if c.Connected then fireFn(c._fn, ...) end end
  local ws = self._w; if #ws > 0 then self._w = {}; for _, co in ipairs(ws) do resume(co, ...) end end
end
Signal.fire = Signal.Fire

-- ---------- tipos de datos ----------
local Vector3 = {}
local V3m = { __rbx = "Vector3" }
local V3methods = {}
local function v3(x, y, z) return setmetatable({ X = x, Y = y, Z = z }, V3m) end
V3m.__index = function(t, k)
  if k == "Magnitude" then return sqrt(t.X * t.X + t.Y * t.Y + t.Z * t.Z) end
  if k == "Unit" then local m = sqrt(t.X * t.X + t.Y * t.Y + t.Z * t.Z); if m == 0 then return t end return v3(t.X / m, t.Y / m, t.Z / m) end
  return V3methods[k]
end
V3m.__add = function(a, b) return v3(a.X + b.X, a.Y + b.Y, a.Z + b.Z) end
V3m.__sub = function(a, b) return v3(a.X - b.X, a.Y - b.Y, a.Z - b.Z) end
V3m.__mul = function(a, b)
  if type(a) == "number" then return v3(a * b.X, a * b.Y, a * b.Z) elseif type(b) == "number" then return v3(a.X * b, a.Y * b, a.Z * b) end
  return v3(a.X * b.X, a.Y * b.Y, a.Z * b.Z)
end
V3m.__div = function(a, b) if type(b) == "number" then return v3(a.X / b, a.Y / b, a.Z / b) end return v3(a.X / b.X, a.Y / b.Y, a.Z / b.Z) end
V3m.__unm = function(a) return v3(-a.X, -a.Y, -a.Z) end
V3m.__eq = function(a, b) return a.X == b.X and a.Y == b.Y and a.Z == b.Z end
V3m.__tostring = function(a) return a.X .. ", " .. a.Y .. ", " .. a.Z end
function V3methods.Dot(a, b) return a.X * b.X + a.Y * b.Y + a.Z * b.Z end
function V3methods.Cross(a, b) return v3(a.Y * b.Z - a.Z * b.Y, a.Z * b.X - a.X * b.Z, a.X * b.Y - a.Y * b.X) end
function V3methods.Lerp(a, b, t) return v3(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t, a.Z + (b.Z - a.Z) * t) end
function V3methods.FuzzyEq(a, b, e) e = e or 1e-5 return abs(a.X - b.X) <= e and abs(a.Y - b.Y) <= e and abs(a.Z - b.Z) <= e end
function V3methods.Max(a, b) return v3(max(a.X, b.X), max(a.Y, b.Y), max(a.Z, b.Z)) end
function V3methods.Min(a, b) return v3(min(a.X, b.X), min(a.Y, b.Y), min(a.Z, b.Z)) end
function Vector3.new(x, y, z) return v3(tonumber(x) or 0, tonumber(y) or 0, tonumber(z) or 0) end
Vector3.zero, Vector3.one = v3(0, 0, 0), v3(1, 1, 1)
Vector3.xAxis, Vector3.yAxis, Vector3.zAxis = v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1)
_G.Vector3 = Vector3

local Vector2 = {}
local V2m = { __rbx = "Vector2" }
local function v2(x, y) return setmetatable({ X = x, Y = y }, V2m) end
V2m.__index = function(t, k)
  if k == "Magnitude" then return sqrt(t.X * t.X + t.Y * t.Y) end
  if k == "Unit" then local m = sqrt(t.X * t.X + t.Y * t.Y); if m == 0 then return t end return v2(t.X / m, t.Y / m) end
  if k == "Dot" then return function(a, b) return a.X * b.X + a.Y * b.Y end end
  if k == "Lerp" then return function(a, b, f) return v2(a.X + (b.X - a.X) * f, a.Y + (b.Y - a.Y) * f) end end
end
V2m.__add = function(a, b) return v2(a.X + b.X, a.Y + b.Y) end
V2m.__sub = function(a, b) return v2(a.X - b.X, a.Y - b.Y) end
V2m.__mul = function(a, b) if type(a) == "number" then return v2(a * b.X, a * b.Y) elseif type(b) == "number" then return v2(a.X * b, a.Y * b) end return v2(a.X * b.X, a.Y * b.Y) end
V2m.__div = function(a, b) if type(b) == "number" then return v2(a.X / b, a.Y / b) end return v2(a.X / b.X, a.Y / b.Y) end
V2m.__eq = function(a, b) return a.X == b.X and a.Y == b.Y end
V2m.__tostring = function(a) return a.X .. ", " .. a.Y end
function Vector2.new(x, y) return v2(tonumber(x) or 0, tonumber(y) or 0) end
Vector2.zero, Vector2.one = v2(0, 0), v2(1, 1)
_G.Vector2 = Vector2

local Color3 = {}
local C3m = { __rbx = "Color3" }
local C3methods = {}
local function c3(r, g, b) return setmetatable({ R = r, G = g, B = b }, C3m) end
C3m.__index = C3methods
C3m.__eq = function(a, b) return a.R == b.R and a.G == b.G and a.B == b.B end
C3m.__tostring = function(a) return a.R .. ", " .. a.G .. ", " .. a.B end
function C3methods.Lerp(a, b, t) return c3(a.R + (b.R - a.R) * t, a.G + (b.G - a.G) * t, a.B + (b.B - a.B) * t) end
function C3methods.ToHex(a) return string.format("%02X%02X%02X", floor(a.R * 255 + 0.5), floor(a.G * 255 + 0.5), floor(a.B * 255 + 0.5)) end
function C3methods.ToHSV(a)
  local mx, mn = max(a.R, a.G, a.B), min(a.R, a.G, a.B); local d = mx - mn; local h = 0
  if d > 0 then
    if mx == a.R then h = ((a.G - a.B) / d) % 6 elseif mx == a.G then h = (a.B - a.R) / d + 2 else h = (a.R - a.G) / d + 4 end
    h = h / 6
  end
  return h, mx == 0 and 0 or d / mx, mx
end
function Color3.new(r, g, b) return c3(tonumber(r) or 0, tonumber(g) or 0, tonumber(b) or 0) end
function Color3.fromRGB(r, g, b) return c3((tonumber(r) or 0) / 255, (tonumber(g) or 0) / 255, (tonumber(b) or 0) / 255) end
function Color3.fromHSV(h, s, v)
  h = (h % 1) * 6; local i = floor(h); local f = h - i; local p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f)); i = i % 6
  if i == 0 then return c3(v, t, p) elseif i == 1 then return c3(q, v, p) elseif i == 2 then return c3(p, v, t) elseif i == 3 then return c3(p, q, v) elseif i == 4 then return c3(t, p, v) end
  return c3(v, p, q)
end
function Color3.fromHex(s) s = tostring(s):gsub("#", ""); return Color3.fromRGB(tonumber(s:sub(1, 2), 16) or 0, tonumber(s:sub(3, 4), 16) or 0, tonumber(s:sub(5, 6), 16) or 0) end
_G.Color3 = Color3

local BC = { ["White"] = { 242, 243, 243 }, ["Black"] = { 27, 42, 53 }, ["Bright red"] = { 196, 40, 28 }, ["Bright blue"] = { 13, 105, 172 }, ["Bright yellow"] = { 245, 205, 48 },
  ["Bright green"] = { 75, 151, 75 }, ["Medium stone grey"] = { 163, 162, 165 }, ["Dark stone grey"] = { 99, 95, 98 }, ["Hot pink"] = { 255, 102, 204 }, ["Bright orange"] = { 218, 133, 65 },
  ["Royal purple"] = { 98, 37, 209 }, ["Cyan"] = { 4, 175, 236 }, ["Brown"] = { 124, 92, 70 }, ["Lime green"] = { 0, 255, 0 } }
local BrickColor = {}
local BCm = { __rbx = "BrickColor" }; BCm.__index = BCm
function BrickColor.new(n) local c = BC[n] or BC["Medium stone grey"]; return setmetatable({ Name = BC[n] and n or "Medium stone grey", Color = Color3.fromRGB(c[1], c[2], c[3]) }, BCm) end
function BrickColor.Random() local ks = {}; for k in pairs(BC) do ks[#ks + 1] = k end table.sort(ks); return BrickColor.new(ks[math.random(#ks)]) end
for _, n in ipairs({ "White", "Black" }) do BrickColor[n] = function() return BrickColor.new(n) end end
BrickColor.Red = function() return BrickColor.new("Bright red") end
BrickColor.Blue = function() return BrickColor.new("Bright blue") end
BrickColor.Yellow = function() return BrickColor.new("Bright yellow") end
BrickColor.Green = function() return BrickColor.new("Bright green") end
_G.BrickColor = BrickColor

local UDim, UDim2 = {}, {}
local UDm = { __rbx = "UDim" }; UDm.__index = UDm
local UD2m = { __rbx = "UDim2" }; UD2m.__index = UD2m
local function ud(s, o) return setmetatable({ Scale = s, Offset = o }, UDm) end
local function ud2(xs, xo, ys, yo) return setmetatable({ X = ud(xs, xo), Y = ud(ys, yo) }, UD2m) end
function UDim.new(s, o) return ud(tonumber(s) or 0, tonumber(o) or 0) end
function UDim2.new(xs, xo, ys, yo)
  if type(xs) == "table" then return ud2(xs.Scale, xs.Offset, xo.Scale, xo.Offset) end
  return ud2(tonumber(xs) or 0, tonumber(xo) or 0, tonumber(ys) or 0, tonumber(yo) or 0)
end
function UDim2.fromScale(x, y) return ud2(x, 0, y, 0) end
function UDim2.fromOffset(x, y) return ud2(0, x, 0, y) end
UD2m.__add = function(a, b) return ud2(a.X.Scale + b.X.Scale, a.X.Offset + b.X.Offset, a.Y.Scale + b.Y.Scale, a.Y.Offset + b.Y.Offset) end
UD2m.__sub = function(a, b) return ud2(a.X.Scale - b.X.Scale, a.X.Offset - b.X.Offset, a.Y.Scale - b.Y.Scale, a.Y.Offset - b.Y.Offset) end
UD2m.__eq = function(a, b) return a.X.Scale == b.X.Scale and a.X.Offset == b.X.Offset and a.Y.Scale == b.Y.Scale and a.Y.Offset == b.Y.Offset end
UD2m.__tostring = function(a) return "{" .. a.X.Scale .. ", " .. a.X.Offset .. "}, {" .. a.Y.Scale .. ", " .. a.Y.Offset .. "}" end
function UD2m.Lerp(a, b, t) return ud2(a.X.Scale + (b.X.Scale - a.X.Scale) * t, a.X.Offset + (b.X.Offset - a.X.Offset) * t, a.Y.Scale + (b.Y.Scale - a.Y.Scale) * t, a.Y.Offset + (b.Y.Offset - a.Y.Offset) * t) end
_G.UDim, _G.UDim2 = UDim, UDim2

-- CFrame: posicion + matriz de rotacion 3x3 (filas r1..r3)
local CFrame = {}
local CFm = { __rbx = "CFrame" }
local CFmethods = {}
local function cf(p, r) return setmetatable({ p = p, r = r }, CFm) end
local ID = { 1, 0, 0, 0, 1, 0, 0, 0, 1 }
local function rmul(a, b)
  local o = {}
  for i = 0, 2 do for j = 0, 2 do o[i * 3 + j + 1] = a[i * 3 + 1] * b[j + 1] + a[i * 3 + 2] * b[j + 4] + a[i * 3 + 3] * b[j + 7] end end
  return o
end
local function rapply(r, v) return v3(r[1] * v.X + r[2] * v.Y + r[3] * v.Z, r[4] * v.X + r[5] * v.Y + r[6] * v.Z, r[7] * v.X + r[8] * v.Y + r[9] * v.Z) end
local function rtrans(r) return { r[1], r[4], r[7], r[2], r[5], r[8], r[3], r[6], r[9] } end
local function eulerR(rx, ry, rz)
  local cx, sx, cy, sy, cz, sz = cos(rx), sin(rx), cos(ry), sin(ry), cos(rz), sin(rz)
  local X = { 1, 0, 0, 0, cx, -sx, 0, sx, cx }; local Y = { cy, 0, sy, 0, 1, 0, -sy, 0, cy }; local Z = { cz, -sz, 0, sz, cz, 0, 0, 0, 1 }
  return rmul(rmul(X, Y), Z)
end
local function toEuler(r)   -- orden XYZ (Roblox ToEulerAnglesXYZ)
  local sy = max(-1, min(1, r[3])); local y = math.asin(sy)
  if abs(sy) < 0.99999 then return math.atan(-r[6], r[9]), y, math.atan(-r[2], r[1]) end
  return math.atan(r[8], r[5]), y, 0
end
CFm.__index = function(t, k)
  if k == "Position" then return t.p elseif k == "X" then return t.p.X elseif k == "Y" then return t.p.Y elseif k == "Z" then return t.p.Z
  elseif k == "LookVector" then return v3(-t.r[3], -t.r[6], -t.r[9]) elseif k == "RightVector" then return v3(t.r[1], t.r[4], t.r[7]) elseif k == "UpVector" then return v3(t.r[2], t.r[5], t.r[8])
  elseif k == "Rotation" then return cf(v3(0, 0, 0), t.r) end
  return CFmethods[k]
end
CFm.__mul = function(a, b)
  if getmetatable(b) == V3m then local v = rapply(a.r, b); return v3(v.X + a.p.X, v.Y + a.p.Y, v.Z + a.p.Z) end
  local v = rapply(a.r, b.p); return cf(v3(v.X + a.p.X, v.Y + a.p.Y, v.Z + a.p.Z), rmul(a.r, b.r))
end
CFm.__add = function(a, v) return cf(a.p + v, a.r) end
CFm.__sub = function(a, v) return cf(a.p - v, a.r) end
CFm.__tostring = function(a) return tostring(a.p) end
CFm.__eq = function(a, b) return a.p == b.p and a.r[1] == b.r[1] and a.r[5] == b.r[5] and a.r[9] == b.r[9] and a.r[3] == b.r[3] end
function CFmethods.Inverse(a) local rt = rtrans(a.r); local v = rapply(rt, a.p); return cf(v3(-v.X, -v.Y, -v.Z), rt) end
function CFmethods.ToWorldSpace(a, b) return a * b end
function CFmethods.ToObjectSpace(a, b) return a:Inverse() * b end
function CFmethods.PointToWorldSpace(a, v) return a * v end
function CFmethods.PointToObjectSpace(a, v) return a:Inverse() * v end
function CFmethods.VectorToWorldSpace(a, v) return rapply(a.r, v) end
function CFmethods.VectorToObjectSpace(a, v) return rapply(rtrans(a.r), v) end
function CFmethods.ToEulerAnglesXYZ(a) return toEuler(a.r) end
CFmethods.ToOrientation = CFmethods.ToEulerAnglesXYZ
function CFmethods.Lerp(a, b, t) return cf(a.p:Lerp(b.p, t), t < 0.5 and a.r or b.r) end
function CFrame.new(x, y, z, ...)
  if x == nil then return cf(v3(0, 0, 0), ID) end
  if type(x) == "table" then
    if getmetatable(x) == V3m then
      if y and getmetatable(y) == V3m then return CFrame.lookAt(x, y) end
      return cf(x, ID)
    end
  end
  return cf(v3(x or 0, y or 0, z or 0), ID)
end
function CFrame.Angles(rx, ry, rz) return cf(v3(0, 0, 0), eulerR(rx or 0, ry or 0, rz or 0)) end
CFrame.fromEulerAnglesXYZ = CFrame.Angles
function CFrame.fromOrientation(rx, ry, rz) return cf(v3(0, 0, 0), eulerR(rx, ry, rz)) end
function CFrame.lookAt(from, to, up)
  local f = (to - from); if f.Magnitude < 1e-6 then return cf(from, ID) end
  f = f.Unit; local u = up or v3(0, 1, 0); local r = f:Cross(u); if r.Magnitude < 1e-6 then r = v3(1, 0, 0) end r = r.Unit
  local uu = r:Cross(f)
  return cf(from, { r.X, uu.X, -f.X, r.Y, uu.Y, -f.Y, r.Z, uu.Z, -f.Z })
end
CFrame.identity = cf(v3(0, 0, 0), ID)
_G.CFrame = CFrame

-- Enum: se crea al vuelo (Enum.Material.Neon, Enum.KeyCode.E ...)
local EnumItem = { __rbx = "EnumItem" }; EnumItem.__index = EnumItem; EnumItem.__tostring = function(e) return "Enum." .. e.EnumType.Name .. "." .. e.Name end
local enumVals = { KeyCode = { "Unknown", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Space", "LeftShift", "RightShift", "LeftControl", "Return", "Escape", "Tab", "Backspace", "Up", "Down", "Left", "Right" } }
local Enum = setmetatable({}, { __index = function(root, tname)
  local et = { Name = tname, _items = {} }
  local vals = enumVals[tname]
  if vals then for i, n in ipairs(vals) do et._items[n] = setmetatable({ Name = n, Value = i - 1, EnumType = et }, EnumItem) end end
  setmetatable(et, { __index = function(t, n)
    if n == "GetEnumItems" then return function() local l = {} for _, v in pairs(t._items) do l[#l + 1] = v end return l end end
    local it = t._items[n]; if not it then it = setmetatable({ Name = n, Value = 0, EnumType = t }, EnumItem); t._items[n] = it end
    return it
  end })
  rawset(root, tname, et); return et
end })
_G.Enum = Enum

local Random = {}
local Rm = { __rbx = "Random" }; Rm.__index = Rm
function Random.new(seed) local r = setmetatable({ s = (seed or os.time()) % 2147483647 }, Rm); if r.s == 0 then r.s = 1 end return r end
function Rm:NextNumber(a, b) self.s = (self.s * 16807) % 2147483647; local u = self.s / 2147483647; if a then return a + (b - a) * u end return u end
function Rm:NextInteger(a, b) return floor(self:NextNumber(a, b + 1 - 1e-9)) end
function Rm:NextUnitVector() local x, y, z = self:NextNumber(-1, 1), self:NextNumber(-1, 1), self:NextNumber(-1, 1); local m = sqrt(x * x + y * y + z * z); if m == 0 then return v3(0, 1, 0) end return v3(x / m, y / m, z / m) end
_G.Random = Random

local TweenInfo = {}
local TIm = { __rbx = "TweenInfo" }; TIm.__index = TIm
function TweenInfo.new(t, style, dir, rep, rev, delay)
  return setmetatable({ Time = t or 1, EasingStyle = style or Enum.EasingStyle.Quad, EasingDirection = dir or Enum.EasingDirection.Out, RepeatCount = rep or 0, Reverses = rev or false, DelayTime = delay or 0 }, TIm)
end
_G.TweenInfo = TweenInfo

-- ---------- codificacion de valores hacia el juego ----------
local SEP1, SEP2 = "\1", "\2"
local function enc(v)
  local t = typeof(v)
  if t == "number" or t == "string" then return v end
  if t == "boolean" then return v and "b:1" or "b:0" end
  if t == "Vector3" then return string.format("v:%.4f,%.4f,%.4f", v.X, v.Y, v.Z) end
  if t == "Vector2" then return string.format("w:%.4f,%.4f", v.X, v.Y) end
  if t == "Color3" then return string.format("c:%.4f,%.4f,%.4f", v.R, v.G, v.B) end
  if t == "UDim2" then return string.format("u:%.4f,%.2f,%.4f,%.2f", v.X.Scale, v.X.Offset, v.Y.Scale, v.Y.Offset) end
  if t == "UDim" then return string.format("d:%.4f,%.2f", v.Scale, v.Offset) end
  if t == "EnumItem" then return "e:" .. v.Name end
  if t == "CFrame" then local rx, ry, rz = toEuler(v.r); return string.format("f:%.4f,%.4f,%.4f,%.4f,%.4f,%.4f", v.p.X, v.p.Y, v.p.Z, rx, ry, rz) end
  if t == "BrickColor" then return enc(v.Color) end
  if t == "Instance" then return "i:" .. tostring(rawget(v, "_id")) end
  if v == nil then return "n:" end
  return tostring(v)
end

-- ---------- Instancias ----------
local classes, nextId, nInst = {}, 0, 0
local Methods = {}
local Imt = {}
local function isA(cls, n) while cls do if cls.name == n then return true end cls = cls.base end return false end
local function def(name, base, o)
  o = o or {}
  local b = base and classes[base]
  local c = { name = name, base = b, props = {}, events = {}, methods = {}, get = {}, set = {}, rep = {}, known = {} }
  if b then for _, f in ipairs({ "props", "events", "methods", "get", "set", "rep", "known" }) do for k, v in pairs(b[f]) do c[f][k] = v end end c.render = b.render; c.gui = b.gui; c.part = b.part; c.nosend = b.nosend end
  for k, v in pairs(o.props or {}) do c.props[k] = v; c.known[k] = true end
  for _, k in ipairs(o.nilprops or {}) do c.known[k] = true end
  for _, e in ipairs(o.events or {}) do c.events[e] = true end
  for k, v in pairs(o.methods or {}) do c.methods[k] = v end
  for k, v in pairs(o.get or {}) do c.get[k] = v end
  for k, v in pairs(o.set or {}) do c.set[k] = v end
  for _, k in ipairs(o.rep or {}) do c.rep[k] = true end
  if o.render ~= nil then c.render = o.render end
  if o.gui ~= nil then c.gui = o.gui end
  if o.part ~= nil then c.part = o.part end
  if o.nosend ~= nil then c.nosend = o.nosend end
  c.onconnect = o.onconnect or (b and b.onconnect)
  c.oncreate = o.oncreate or (b and b.oncreate)
  classes[name] = c
end

local root = {}                     -- id -> instancia raiz de replicacion (Workspace / PlayerGui)
local function isAttached(i)
  while i do if rawget(i, "_root") then return true end i = rawget(i, "_parent") end
  return false
end
local function removeFrom(list, v) for i = #list, 1, -1 do if list[i] == v then table.remove(list, i) return end end end
local function fire(i, name, ...) local s = rawget(i, "_sig")[name]; if s then s:Fire(...) end end
local function packProps(i)
  local cls, out = rawget(i, "_class"), {}
  for k in pairs(cls.rep) do local v = rawget(i, "_props")[k]; if v ~= nil then out[#out + 1] = k .. SEP2 .. tostring(enc(v)) end end
  return table.concat(out, SEP1)
end
local function replicateNew(i)
  local cls = rawget(i, "_class")
  if cls.render and not cls.nosend then
    local p = rawget(i, "_parent")
    act("new", rawget(i, "_id"), cls.name, p and rawget(p, "_id") or 0, packProps(i), rawget(i, "_name"))
  end
  for _, c in ipairs(rawget(i, "_kids")) do replicateNew(c) end
end
local function replicateDel(i) if rawget(i, "_class").render and not rawget(i, "_class").nosend then act("del", rawget(i, "_id")) else for _, c in ipairs(rawget(i, "_kids")) do replicateDel(c) end end end

local function descendantsFire(i, name, d) local p = i; while p do fire(p, name, d); p = rawget(p, "_parent") end end
local function setParent(i, np)
  local old = rawget(i, "_parent")
  if old == np then return end
  if np ~= nil then
    local a = np; while a do if a == i then error("Parent: no puedes meter un objeto dentro de si mismo", 3) end a = rawget(a, "_parent") end
  end
  local was, nowA = isAttached(old), isAttached(np)
  if old then removeFrom(rawget(old, "_kids"), i); fire(old, "ChildRemoved", i); local p = old; while p do fire(p, "DescendantRemoving", i); p = rawget(p, "_parent") end end
  rawset(i, "_parent", np)
  if np then table.insert(rawget(np, "_kids"), i) end
  if was and not nowA then replicateDel(i)
  elseif nowA and not was then replicateNew(i)
  elseif nowA and was and rawget(i, "_class").render and not rawget(i, "_class").nosend then act("parent", rawget(i, "_id"), rawget(np, "_id")) end
  if np then fire(np, "ChildAdded", i); local p = np; while p do fire(p, "DescendantAdded", i); p = rawget(p, "_parent") end end
  fire(i, "AncestryChanged", i, np)
  local oc = rawget(i, "_class").onparent; if oc then oc(i, old, np) end
end
local function setProp(i, k, v)
  local props = rawget(i, "_props")
  if props[k] == v then return end
  props[k] = v
  local cls = rawget(i, "_class")
  if cls.rep[k] and isAttached(i) and not cls.nosend then act("prop", rawget(i, "_id"), k, enc(v)) end
  fire(i, "Changed", k)
  local ch = rawget(i, "_ch"); if ch and ch[k] then ch[k]:Fire() end
  if cls.onchange then cls.onchange(i, k, v) end
end

Imt.__rbx = "Instance"
Imt.__index = function(self, k)
  local m = Methods[k]; if m then return m end
  if k == "Name" then return rawget(self, "_name") elseif k == "ClassName" then return rawget(self, "_class").name elseif k == "Parent" then return rawget(self, "_parent") end
  local cls = rawget(self, "_class")
  local g = cls.get[k]; if g then return g(self) end
  local v = rawget(self, "_props")[k]; if v ~= nil then return v end
  if cls.known[k] then return nil end
  if cls.events[k] then
    local s = rawget(self, "_sig"); local sg = s[k]
    if not sg then sg = newSignal(cls.onconnect and function() cls.onconnect(self, k) end or nil); s[k] = sg end
    return sg
  end
  local cm = cls.methods[k]; if cm ~= nil then return cm end
  for _, c in ipairs(rawget(self, "_kids")) do if rawget(c, "_name") == k then return c end end
  error(tostring(k) .. " no es un miembro valido de " .. cls.name, 2)
end
Imt.__newindex = function(self, k, v)
  local cls = rawget(self, "_class")
  if k == "Name" then rawset(self, "_name", tostring(v)); fire(self, "Changed", "Name") return end
  if k == "Parent" then setParent(self, v) return end
  local s = cls.set[k]; if s then s(self, v) return end
  if cls.known[k] or cls.rep[k] then setProp(self, k, v) return end
  error(tostring(k) .. " no es un miembro valido de " .. cls.name, 2)
end
Imt.__tostring = function(self) return rawget(self, "_name") end

local function newInstance(cname, parent)
  local cls = classes[cname]
  if not cls then error("Instance.new: clase desconocida '" .. tostring(cname) .. "'", 3) end
  nInst = nInst + 1; if nInst > 4000 then error("demasiados objetos (maximo 4000)", 3) end
  nextId = nextId + 1
  local i = setmetatable({ _id = nextId, _class = cls, _name = cname, _kids = {}, _props = {}, _sig = {}, _attrs = {} }, Imt)
  for k, v in pairs(cls.props) do rawget(i, "_props")[k] = v end
  if cls.oncreate then cls.oncreate(i) end
  if parent then setParent(i, parent) end
  return i
end
local Instance = { new = newInstance }
_G.Instance = Instance

-- metodos comunes de Instance
function Methods.Destroy(i)
  if rawget(i, "_destroyed") then return end
  rawset(i, "_destroyed", true); nInst = max(0, nInst - 1)
  fire(i, "Destroying")
  for _, c in ipairs({ table.unpack(rawget(i, "_kids")) }) do Methods.Destroy(c) end
  setParent(i, nil)
end
function Methods.Remove(i) Methods.Destroy(i) end
function Methods.ClearAllChildren(i) for _, c in ipairs({ table.unpack(rawget(i, "_kids")) }) do Methods.Destroy(c) end end
function Methods.GetChildren(i) return { table.unpack(rawget(i, "_kids")) } end
local function walk(i, out) for _, c in ipairs(rawget(i, "_kids")) do out[#out + 1] = c; walk(c, out) end return out end
function Methods.GetDescendants(i) return walk(i, {}) end
function Methods.FindFirstChild(i, n, rec)
  for _, c in ipairs(rawget(i, "_kids")) do if rawget(c, "_name") == n then return c end end
  if rec then for _, c in ipairs(walk(i, {})) do if rawget(c, "_name") == n then return c end end end
  return nil
end
function Methods.FindFirstChildOfClass(i, cn) for _, c in ipairs(rawget(i, "_kids")) do if rawget(c, "_class").name == cn then return c end end return nil end
function Methods.FindFirstChildWhichIsA(i, cn, rec)
  local list = rec and walk(i, {}) or rawget(i, "_kids")
  for _, c in ipairs(list) do if isA(rawget(c, "_class"), cn) then return c end end return nil
end
function Methods.FindFirstAncestor(i, n) local p = rawget(i, "_parent"); while p do if rawget(p, "_name") == n then return p end p = rawget(p, "_parent") end return nil end
function Methods.FindFirstAncestorOfClass(i, cn) local p = rawget(i, "_parent"); while p do if rawget(p, "_class").name == cn then return p end p = rawget(p, "_parent") end return nil end
function Methods.FindFirstAncestorWhichIsA(i, cn) local p = rawget(i, "_parent"); while p do if isA(rawget(p, "_class"), cn) then return p end p = rawget(p, "_parent") end return nil end
function Methods.WaitForChild(i, n, timeout)
  local c = Methods.FindFirstChild(i, n); if c then return c end
  local t0, co = NOW, coroutine.running(); local done = false
  local cn; cn = i.ChildAdded:Connect(function(x) if rawget(x, "_name") == n and not done then done = true; cn:Disconnect(); resume(co, x) end end)
  if timeout then task.delay(timeout, function() if not done then done = true; cn:Disconnect(); resume(co, nil) end end) end
  return coroutine.yield()
end
function Methods.IsA(i, cn) return isA(rawget(i, "_class"), cn) or cn == "Instance" end
function Methods.IsDescendantOf(i, a) local p = rawget(i, "_parent"); while p do if p == a then return true end p = rawget(p, "_parent") end return false end
function Methods.IsAncestorOf(i, d) return Methods.IsDescendantOf(d, i) end
function Methods.GetFullName(i) local n, p = rawget(i, "_name"), rawget(i, "_parent"); while p and rawget(p, "_class").name ~= "DataModel" do n = rawget(p, "_name") .. "." .. n; p = rawget(p, "_parent") end return n end
function Methods.GetAttribute(i, n) return rawget(i, "_attrs")[n] end
function Methods.SetAttribute(i, n, v) rawget(i, "_attrs")[n] = v; local ch = rawget(i, "_chA"); if ch and ch[n] then ch[n]:Fire() end fire(i, "AttributeChanged", n) end
function Methods.GetAttributes(i) local o = {} for k, v in pairs(rawget(i, "_attrs")) do o[k] = v end return o end
function Methods.GetAttributeChangedSignal(i, n) local ch = rawget(i, "_chA"); if not ch then ch = {}; rawset(i, "_chA", ch) end if not ch[n] then ch[n] = newSignal() end return ch[n] end
function Methods.GetPropertyChangedSignal(i, n) local ch = rawget(i, "_ch"); if not ch then ch = {}; rawset(i, "_ch", ch) end if not ch[n] then ch[n] = newSignal() end return ch[n] end
function Methods.Clone(i)
  local cls = rawget(i, "_class"); local c = newInstance(cls.name); rawset(c, "_name", rawget(i, "_name"))
  for k, v in pairs(rawget(i, "_props")) do rawget(c, "_props")[k] = v end
  for k, v in pairs(rawget(i, "_attrs")) do rawget(c, "_attrs")[k] = v end
  for _, ch in ipairs(rawget(i, "_kids")) do local cc = Methods.Clone(ch); setParent(cc, c) end
  return c
end
function Methods.GetDebugId(i) return tostring(rawget(i, "_id")) end

local function standard(name, base, o) def(name, base, o) end
def("Instance", nil, {})
rawget(classes.Instance, "events").Changed = true
for _, e in ipairs({ "ChildAdded", "ChildRemoved", "DescendantAdded", "DescendantRemoving", "Destroying", "AncestryChanged", "AttributeChanged" }) do classes.Instance.events[e] = true end
standard("Folder", "Instance"); standard("Configuration", "Instance")
standard("Model", "Instance", { nilprops = { "PrimaryPart" } })
standard("Script", "Instance"); standard("LocalScript", "Script"); standard("ModuleScript", "Script")
standard("BindableEvent", "Instance", { events = { "Event" }, methods = { Fire = function(self, ...) self.Event:Fire(...) end } })
-- RemoteEvent de verdad: viaja por la red a todos los jugadores de la partida (maximo ~600 caracteres por mensaje).
-- El "servidor" es el jugador con el nombre alfabeticamente menor (RunService:IsServer() solo es true en su navegador).
local function rpack(v)
  local t = typeof(v)
  if t == "Vector3" then return { ["$v"] = { v.X, v.Y, v.Z } } elseif t == "Color3" then return { ["$c"] = { v.R, v.G, v.B } }
  elseif t == "Instance" then return { ["$i"] = v:GetFullName() }
  elseif t == "table" then local o = {} for k, x in pairs(v) do o[k] = rpack(x) end return o end
  return v
end
local function runpack(v)
  if type(v) ~= "table" then return v end
  if v["$v"] then return Vector3.new(v["$v"][1], v["$v"][2], v["$v"][3]) elseif v["$c"] then return Color3.new(v["$c"][1], v["$c"][2], v["$c"][3])
  elseif v["$i"] then local cur = game; for part in tostring(v["$i"]):gmatch("[^%.]+") do cur = rawget(cur, "_kids") and Methods.FindFirstChild(cur, part) or nil; if not cur then return nil end end return cur end
  local o = {} for k, x in pairs(v) do o[k] = runpack(x) end return o
end
local function isHost()
  local me = rawget(_G.__localPlayer, "_name"); for name in pairs(_G.__nameToPlayer or {}) do if name < me then return false end end return true
end
local function sendRemote(ev, mode, target, ...)
  local args = table.pack(...); local list = {}; for i = 1, args.n do list[i] = rpack(args[i]) end
  local j = _G.__jenc({ n = args.n, a = list }); if #j > 600 then error("RemoteEvent: mensaje demasiado grande (" .. #j .. " caracteres)", 3) end
  act("remote", ev:GetFullName(), mode, target or "", j)
end
standard("RemoteEvent", "Instance", { events = { "OnServerEvent", "OnClientEvent" }, methods = {
  FireServer = function(self, ...) if isHost() then self.OnServerEvent:Fire(_G.__localPlayer, ...) else sendRemote(self, "srv", nil, ...) end end,
  FireClient = function(self, player, ...) if player == _G.__localPlayer then self.OnClientEvent:Fire(...) else sendRemote(self, "cl", rawget(player, "_name"), ...) end end,
  FireAllClients = function(self, ...) self.OnClientEvent:Fire(...); sendRemote(self, "all", nil, ...) end } })
standard("BindableFunction", "Instance", { methods = { Invoke = function(self, ...) local f = rawget(self, "_props").OnInvoke; if f then return f(...) end end } })
classes.BindableFunction.set.OnInvoke = function(self, f) rawget(self, "_props").OnInvoke = f end
standard("RemoteFunction", "Instance", { methods = { InvokeServer = function(self, ...) local f = rawget(self, "_props").OnServerInvoke; if f then return f(_G.__localPlayer, ...) end end, InvokeClient = function(self, _, ...) local f = rawget(self, "_props").OnClientInvoke; if f then return f(...) end end } })
classes.RemoteFunction.set.OnServerInvoke = function(self, f) rawget(self, "_props").OnServerInvoke = f end
classes.RemoteFunction.set.OnClientInvoke = function(self, f) rawget(self, "_props").OnClientInvoke = f end
for _, vt in ipairs({ { "IntValue", 0 }, { "NumberValue", 0 }, { "StringValue", "" }, { "BoolValue", false }, { "ObjectValue", nil }, { "Color3Value", Color3.new(0, 0, 0) }, { "Vector3Value", Vector3.new(0, 0, 0) } }) do
  standard(vt[1], "Instance", { props = { Value = vt[2] }, nilprops = { "Value" }, events = {} })
  classes[vt[1]].onchange = function(i, k, v)
    if k ~= "Value" then return end
    local p = rawget(i, "_parent")
    if p and rawget(p, "_name") == "leaderstats" and rawget(p, "_parent") and rawget(rawget(p, "_parent"), "_class").name == "Player" then act("lb", rawget(rawget(p, "_parent"), "_name"), rawget(i, "_name"), tostring(v)) end
  end
  classes[vt[1]].onparent = function(i, old, np)
    if np and rawget(np, "_name") == "leaderstats" and rawget(np, "_parent") and rawget(rawget(np, "_parent"), "_class").name == "Player" then act("lb", rawget(rawget(np, "_parent"), "_name"), rawget(i, "_name"), tostring(rawget(i, "_props").Value)) end
  end
end
classes.IntValue.set.Value = function(i, v) setProp(i, "Value", floor(tonumber(v) or 0)) end

-- partes del mundo
local partProps = { Position = Vector3.new(0, 0, 0), Rot = Vector3.new(0, 0, 0), Size = Vector3.new(4, 1, 2), Color = Color3.new(0.63, 0.63, 0.63), Anchored = false, CanCollide = true, CanTouch = true,
  Transparency = 0, Reflectance = 0, Material = Enum.Material.Plastic, Shape = Enum.PartType.Block }
def("BasePart", "Instance", {
  props = partProps, events = { "Touched", "TouchEnded" }, part = true, render = true, rep = { "Position", "Rot", "Size", "Color", "Anchored", "CanCollide", "CanTouch", "Transparency", "Material", "Shape" },
  get = {
    CFrame = function(i) local p = rawget(i, "_props"); local r = p.Rot; return CFrame.new(p.Position) * CFrame.Angles(r.X * pi / 180, r.Y * pi / 180, r.Z * pi / 180) end,
    Orientation = function(i) return rawget(i, "_props").Rot end,
    Rotation = function(i) return rawget(i, "_props").Rot end,
    BrickColor = function(i) return BrickColor.new("Medium stone grey") end,
    Color3 = function(i) return rawget(i, "_props").Color end,
    Mass = function(i) local s = rawget(i, "_props").Size; return s.X * s.Y * s.Z end,
    AssemblyLinearVelocity = function() return Vector3.new(0, 0, 0) end, Velocity = function() return Vector3.new(0, 0, 0) end,
  },
  set = {
    CFrame = function(i, c) local rx, ry, rz = toEuler(c.r); setProp(i, "Position", c.p); setProp(i, "Rot", v3(rx * 180 / pi, ry * 180 / pi, rz * 180 / pi)) end,
    Orientation = function(i, v) setProp(i, "Rot", v) end, Rotation = function(i, v) setProp(i, "Rot", v) end,
    BrickColor = function(i, b) setProp(i, "Color", b.Color) end, Color3 = function(i, c) setProp(i, "Color", c) end,
    Velocity = function() end, AssemblyLinearVelocity = function() end, Massless = function() end, Locked = function() end, CastShadow = function() end, CanQuery = function() end, TopSurface = function() end, BottomSurface = function() end,
  },
  methods = {
    GetPivot = function(i) return i.CFrame end, PivotTo = function(i, c) i.CFrame = c end,
    SetNetworkOwner = function() end, ApplyImpulse = function() end, GetTouchingParts = function() return {} end,
    GetMass = function(i) local s = rawget(i, "_props").Size; return s.X * s.Y * s.Z end,
    Resize = function() end,
  },
  onconnect = function(i, ev) if ev == "Touched" or ev == "TouchEnded" then act("touch", rawget(i, "_id"), 1) end end,
})
standard("Part", "BasePart"); standard("WedgePart", "BasePart"); standard("MeshPart", "BasePart"); standard("TrussPart", "BasePart")
standard("SpawnLocation", "BasePart", { props = { Anchored = true, Neutral = true, Duration = 0 } })
classes.SpawnLocation.props.Anchored = true
classes.SpawnLocation.onparent = function(i, old, np) if np and isAttached(np) then act("spawnpoint", rawget(i, "_id")) end end
standard("PointLight", "Instance", { props = { Brightness = 1, Range = 12, Color = Color3.new(1, 1, 1), Enabled = true, Shadows = false }, render = true, rep = { "Brightness", "Range", "Color", "Enabled" } })
standard("SpotLight", "PointLight"); standard("SurfaceLight", "PointLight")
standard("ClickDetector", "Instance", { props = { MaxActivationDistance = 32 }, events = { "MouseClick", "MouseHoverEnter", "MouseHoverLeave", "RightMouseClick" }, render = true, rep = { "MaxActivationDistance" } })
standard("ProximityPrompt", "Instance", { props = { ActionText = "Interactuar", ObjectText = "", MaxActivationDistance = 10, HoldDuration = 0, Enabled = true, KeyboardKeyCode = Enum.KeyCode.E, RequiresLineOfSight = false }, events = { "Triggered", "TriggerEnded", "PromptShown", "PromptHidden" }, render = true, rep = { "ActionText", "ObjectText", "MaxActivationDistance", "HoldDuration", "Enabled" } })
local SOUNDS = { "click", "coin", "win", "jump", "laser", "boom", "powerup", "hit", "notify", "join" }
function soundName(id)                                    -- "blocksy://win" usa el efecto por su nombre; cualquier otro id de Roblox se reparte entre los efectos
  id = tostring(id or "")
  local named = id:match("^blocksy://(%w+)$"); if named then return named end
  local n = tonumber(id:match("(%d+)")) or 0
  return SOUNDS[n % #SOUNDS + 1]
end
standard("Sound", "Instance", { props = { SoundId = "", Volume = 0.5, Looped = false, Playing = false, PlaybackSpeed = 1 }, events = { "Ended", "Played" }, methods = {
  Play = function(i) act("sound", soundName(rawget(i, "_props").SoundId)); rawget(i, "_props").Playing = true; task.delay(0.8, function() rawget(i, "_props").Playing = false; fire(i, "Ended") end) end,
  Stop = function(i) rawget(i, "_props").Playing = false end, Pause = function() end, Resume = function() end } })
standard("Attachment", "Instance", { props = { Position = Vector3.new(0, 0, 0) } })
standard("Camera", "Instance", { props = { FieldOfView = 70, CFrame = CFrame.new(0, 10, 0), Focus = CFrame.new(0, 0, 0) }, nilprops = { "CameraSubject", "CameraType" } })
standard("Terrain", "Instance")

-- interfaz (se dibuja encima del juego)
local guiProps = { Position = UDim2.new(0, 0, 0, 0), Size = UDim2.new(0, 100, 0, 50), AnchorPoint = Vector2.new(0, 0), BackgroundColor3 = Color3.new(1, 1, 1), BackgroundTransparency = 0, BorderSizePixel = 1,
  Visible = true, ZIndex = 1, Rotation = 0, ClipsDescendants = false }
local guiRep = { "Position", "Size", "AnchorPoint", "BackgroundColor3", "BackgroundTransparency", "Visible", "ZIndex", "Rotation", "ClipsDescendants" }
local textProps = { Text = "", TextColor3 = Color3.new(0, 0, 0), TextSize = 14, TextTransparency = 0, TextXAlignment = Enum.TextXAlignment.Center, TextYAlignment = Enum.TextYAlignment.Center, TextWrapped = false, TextScaled = false, Font = Enum.Font.SourceSans, RichText = false }
local textRep = { "Text", "TextColor3", "TextSize", "TextTransparency", "TextXAlignment", "TextYAlignment", "TextWrapped", "TextScaled", "Font" }
standard("LayerCollector", "Instance", { props = { Enabled = true, ResetOnSpawn = true, IgnoreGuiInset = false, DisplayOrder = 0 }, render = true, gui = true, rep = { "Enabled", "DisplayOrder" } })
standard("ScreenGui", "LayerCollector")
standard("GuiObject", "Instance", { props = guiProps, render = true, gui = true, rep = guiRep, events = { "MouseEnter", "MouseLeave", "InputBegan", "InputEnded" },
  get = { AbsoluteSize = function() return Vector2.new(0, 0) end, AbsolutePosition = function() return Vector2.new(0, 0) end } })
standard("Frame", "GuiObject")
standard("TextLabel", "GuiObject", { props = textProps, rep = textRep })
standard("TextButton", "GuiObject", { props = textProps, rep = textRep, events = { "MouseButton1Click", "MouseButton1Down", "MouseButton1Up", "Activated", "MouseButton2Click" }, onconnect = function(i, ev) act("guiclick", rawget(i, "_id"), 1) end })
standard("ImageLabel", "GuiObject", { props = { Image = "" }, rep = { "Image" } })
standard("UICorner", "Instance", { props = { CornerRadius = UDim.new(0, 8) }, render = true, rep = { "CornerRadius" } })
standard("UIStroke", "Instance", { props = { Color = Color3.new(0, 0, 0), Thickness = 1, Transparency = 0 }, render = true, rep = { "Color", "Thickness", "Transparency" } })
standard("UIListLayout", "Instance", { props = { Padding = UDim.new(0, 0), FillDirection = Enum.FillDirection.Vertical, HorizontalAlignment = Enum.HorizontalAlignment.Left, VerticalAlignment = Enum.VerticalAlignment.Top, SortOrder = Enum.SortOrder.LayoutOrder }, render = true, rep = { "Padding", "FillDirection", "HorizontalAlignment", "VerticalAlignment" } })
standard("UIPadding", "Instance", { props = { PaddingLeft = UDim.new(0, 0), PaddingRight = UDim.new(0, 0), PaddingTop = UDim.new(0, 0), PaddingBottom = UDim.new(0, 0) }, render = true, rep = { "PaddingLeft", "PaddingRight", "PaddingTop", "PaddingBottom" } })
standard("BillboardGui", "Instance", { props = { Size = UDim2.new(0, 100, 0, 40), StudsOffset = Vector3.new(0, 2, 0), AlwaysOnTop = false, Enabled = true }, nilprops = { "Adornee" }, render = true, gui = true, rep = { "Size", "StudsOffset", "AlwaysOnTop", "Enabled", "Adornee" } })

-- humanoide y personajes
standard("Humanoid", "Instance", { props = { WalkSpeed = 16, JumpPower = 50, JumpHeight = 7.2, Health = 100, MaxHealth = 100, DisplayName = "", UseJumpPower = true, AutoRotate = true, HipHeight = 2, Sit = false }, events = { "Died", "HealthChanged", "Jumping", "Running", "Seated" }, methods = {
  TakeDamage = function(i, n) i.Health = i.Health - n end, Move = function() end, MoveTo = function() end, ChangeState = function() end, GetState = function() return Enum.HumanoidStateType.Running end,
  EquipTool = function() end, UnequipTools = function() end, GetPlayingAnimationTracks = function() return {} end, LoadAnimation = function() return { Play = function() end, Stop = function() end } end } })
classes.Humanoid.set.Health = function(i, v)
  local p = rawget(i, "_props"); v = max(0, min(v, p.MaxHealth)); if p.Health == v then return end
  local was = p.Health; p.Health = v; fire(i, "HealthChanged", v); if rawget(i, "_local") then act("health", v, p.MaxHealth) end
  if v <= 0 and was > 0 then fire(i, "Died"); if rawget(i, "_local") then act("respawn"); task.delay(0.2, function() p.Health = p.MaxHealth; fire(i, "HealthChanged", p.Health) end) end end
end
classes.Humanoid.set.WalkSpeed = function(i, v) setProp(i, "WalkSpeed", v); if rawget(i, "_local") then act("speed", v * 6 / 16) end end
classes.Humanoid.set.JumpPower = function(i, v) setProp(i, "JumpPower", v); if rawget(i, "_local") then act("jump", v * 8.6 / 50) end end
classes.Humanoid.set.JumpHeight = function(i, v) setProp(i, "JumpHeight", v); if rawget(i, "_local") then act("jump", v * 8.6 / 7.2) end end
classes.Humanoid.set.MaxHealth = function(i, v) setProp(i, "MaxHealth", v); if rawget(i, "_local") then act("health", rawget(i, "_props").Health, v) end end
def("CharPart", "BasePart", { nosend = true, render = false })
classes.CharPart.set.Position = function(i, v)
  setProp(i, "Position", v); if rawget(i, "_local") and rawget(i, "_name") == "HumanoidRootPart" and not rawget(i, "_sync") then act("teleport", v.X, v.Y, v.Z) end
end
classes.CharPart.set.CFrame = function(i, c) classes.CharPart.set.Position(i, c.p) end
def("Player", "Instance", { props = { DisplayName = "", UserId = 0, AccountAge = 365, Neutral = true }, nilprops = { "Character", "Team", "MembershipType" }, events = { "CharacterAdded", "CharacterRemoving", "Chatted" },
  methods = { Kick = function(_, m) act("print", "Kick: " .. tostring(m or "")) end, LoadCharacter = function(i) act("respawn") end, GetMouse = function() return _G.__mouse end, DistanceFromCharacter = function(i, p)
    local c = rawget(i, "_props").Character; local r = c and c:FindFirstChild("HumanoidRootPart"); if not r then return 0 end return (r.Position - p).Magnitude end } })
local function hashName(s) local h = 7; for k = 1, #s do h = (h * 31 + s:byte(k)) % 1000000007 end return h end        -- (fengari usa enteros de 32 bits: nada de operaciones a nivel de bit)
local function makeCharacter(player, isLocal)
  local ch = newInstance("Model"); rawset(ch, "_name", rawget(player, "_name"))
  local hrp = newInstance("CharPart"); rawset(hrp, "_name", "HumanoidRootPart"); rawset(hrp, "_local", isLocal); rawget(hrp, "_props").Size = Vector3.new(2, 2, 1); rawget(hrp, "_props").Transparency = 1
  local head = newInstance("CharPart"); rawset(head, "_name", "Head"); rawget(head, "_props").Size = Vector3.new(1, 1, 1); rawset(head, "_local", false)
  local hum = newInstance("Humanoid"); rawset(hum, "_local", isLocal); rawset(hum, "_name", "Humanoid"); rawget(hum, "_props").DisplayName = rawget(player, "_name")
  setParent(hrp, ch); setParent(head, ch); setParent(hum, ch); rawget(ch, "_props").PrimaryPart = hrp
  return ch
end

-- servicios
local services = {}
local function service(name, base, o) def(name, base or "Instance", o or {}); local i = newInstance(name); rawset(i, "_name", name); services[name] = i; return i end
-- piezas del mundo y rayos (sobre las piezas que crea el script; los bloques del mundo no cuentan)
function allParts() local out = {} for _, d in ipairs(walk(services.Workspace, {})) do if isA(rawget(d, "_class"), "BasePart") and rawget(d, "_class").name ~= "CharPart" then out[#out + 1] = d end end return out end
function aabb(p) local pr = rawget(p, "_props"); local h = pr.Size / 2; local r = pr.Rot; local sy = math.abs(math.sin((r.Y or 0) * pi / 180)); local c = pr.Position
  local hx, hz = h.X * (1 - sy) + h.Z * sy, h.Z * (1 - sy) + h.X * sy; return { min = Vector3.new(c.X - hx, c.Y - h.Y, c.Z - hz), max = Vector3.new(c.X + hx, c.Y + h.Y, c.Z + hz) } end
function raycast(o, d, params)
  local len = d.Magnitude; if len == 0 then return nil end
  local dir = d / len; local best, bestT, bestN = nil, len, nil
  local ignore = {}; if params and params.FilterDescendantsInstances then for _, x in ipairs(params.FilterDescendantsInstances) do ignore[x] = true end end
  for _, p in ipairs(allParts()) do
    if not ignore[p] and rawget(p, "_props").CanCollide ~= false or (params and params.IgnoreCollide == false) then
      local b = aabb(p); local t0, t1, n = 0, bestT, nil
      for _, ax in ipairs({ "X", "Y", "Z" }) do
        local oo, dd, lo, hi = o[ax], dir[ax], b.min[ax], b.max[ax]
        if math.abs(dd) < 1e-9 then if oo < lo or oo > hi then t0 = nil break end
        else local a, c = (lo - oo) / dd, (hi - oo) / dd; local sgn = -1; if a > c then a, c = c, a; sgn = 1 end
          if a > t0 then t0 = a; n = { X = 0, Y = 0, Z = 0 }; n[ax] = sgn end
          if c < t1 then t1 = c end
          if t0 > t1 then t0 = nil break end end
      end
      if t0 and t0 <= bestT and not ignore[p] then best, bestT, bestN = p, t0, n end
    end
  end
  if not best then return nil end
  return { Instance = best, Position = o + dir * bestT, Distance = bestT, Normal = bestN and Vector3.new(bestN.X, bestN.Y, bestN.Z) or Vector3.new(0, 1, 0), Material = rawget(best, "_props").Material }
end
local Workspace = service("Workspace", "Instance", { props = { Gravity = 196.2, FallenPartsDestroyHeight = -500 }, nilprops = { "CurrentCamera", "Terrain" }, events = {}, render = false,
  methods = { GetServerTimeNow = function() return EPOCH + NOW end, Raycast = function(_, o, d, params) return raycast(o, d, params) end,
    GetPartBoundsInRadius = function(_, c, r) local out = {} for _, p in ipairs(allParts()) do local b = aabb(p); local dx, dy, dz = math.max(b.min.X - c.X, 0, c.X - b.max.X), math.max(b.min.Y - c.Y, 0, c.Y - b.max.Y), math.max(b.min.Z - c.Z, 0, c.Z - b.max.Z); if dx * dx + dy * dy + dz * dz <= r * r then out[#out + 1] = p end end return out end,
    GetPartBoundsInBox = function(_, cf, size) local c, h = cf.Position, size / 2; local out = {} for _, p in ipairs(allParts()) do local b = aabb(p); if b.max.X >= c.X - h.X and b.min.X <= c.X + h.X and b.max.Y >= c.Y - h.Y and b.min.Y <= c.Y + h.Y and b.max.Z >= c.Z - h.Z and b.min.Z <= c.Z + h.Z then out[#out + 1] = p end end return out end,
    GetPartsInPart = function(_, part) local pb = aabb(part); local out = {} for _, p in ipairs(allParts()) do if p ~= part then local b = aabb(p); if b.max.X >= pb.min.X and b.min.X <= pb.max.X and b.max.Y >= pb.min.Y and b.min.Y <= pb.max.Y and b.max.Z >= pb.min.Z and b.min.Z <= pb.max.Z then out[#out + 1] = p end end end return out end } })
rawset(Workspace, "_root", true)
rawget(Workspace, "_props").CurrentCamera = newInstance("Camera"); rawset(rawget(Workspace, "_props").CurrentCamera, "_name", "Camera")
rawget(Workspace, "_props").Terrain = newInstance("Terrain")
classes.Workspace.set.Gravity = function(i, v) setProp(i, "Gravity", v); act("gravity", v * 24 / 196.2) end
local PlayersS
PlayersS = service("Players", "Instance", { props = { MaxPlayers = 12, RespawnTime = 5 }, events = { "PlayerAdded", "PlayerRemoving" }, get = { LocalPlayer = function() return _G.__localPlayer end }, methods = {
  GetPlayers = function() local o = {} for _, p in ipairs(rawget(PlayersS, "_kids")) do if rawget(p, "_joined") then o[#o + 1] = p end end return o end,
  GetPlayerByUserId = function(_, id) for _, p in ipairs(rawget(PlayersS, "_kids")) do if p.UserId == id then return p end end end,
  GetPlayerFromCharacter = function(_, ch) for _, p in ipairs(rawget(PlayersS, "_kids")) do if rawget(p, "_props").Character == ch then return p end end end,
  GetUserIdFromNameAsync = function(_, n) return hashName(n) end } })
-- Equipos: Teams, Team y Player.Team (el color del equipo pinta el nombre del jugador)
def("Team", "Instance", { props = { TeamColor = BrickColor.new("White"), AutoAssignable = true }, events = { "PlayerAdded", "PlayerRemoved" }, methods = {
  GetPlayers = function(tm) local out = {} for _, p in ipairs(rawget(PlayersS, "_kids")) do if rawget(p, "_props").Team == tm then out[#out + 1] = p end end return out end } })
classes.Player.set.Team = function(p, tm)
  local old = rawget(p, "_props").Team; if old == tm then return end
  setProp(p, "Team", tm); if old then fire(old, "PlayerRemoved", p) end
  act("team", rawget(p, "_name"), tm and enc(rawget(tm, "_props").TeamColor.Color) or ""); if tm then fire(tm, "PlayerAdded", p) end
end
classes.Player.get.TeamColor = function(p) local tm = rawget(p, "_props").Team; return tm and rawget(tm, "_props").TeamColor or BrickColor.new("White") end
classes.Player.set.TeamColor = function(p, bc) for _, tm in ipairs(rawget(services.Teams, "_kids")) do if rawget(tm, "_props").TeamColor.Name == bc.Name then p.Team = tm return end end end
-- Animaciones: una Animation con id "blocksy://wave" (o cualquier id de Roblox) se reproduce como uno de los emotes
local EMOTE_IDS = { "wave", "dance", "cheer", "clap", "sit", "jumpjoy", "cry", "point", "flex" }
def("Animation", "Instance", { props = { AnimationId = "" } })
local function emoteName(id) id = tostring(id or ""); local n = id:match("^blocksy://(%w+)$"); if n then return n end return EMOTE_IDS[(tonumber(id:match("(%d+)")) or 0) % #EMOTE_IDS + 1] end
local function animTrack(anim)
  local tr = { Animation = anim, IsPlaying = false, Looped = false, Speed = 1, Length = 2.5, Stopped = newSignal(), Ended = newSignal() }
  function tr:Play() act("emote", emoteName(rawget(anim, "_props").AnimationId)); self.IsPlaying = true; task.delay(self.Length, function() if self.IsPlaying then self.IsPlaying = false; self.Stopped:Fire(); self.Ended:Fire() end end) end
  function tr:Stop() if self.IsPlaying then self.IsPlaying = false; self.Stopped:Fire() end end
  function tr:AdjustSpeed(s) self.Speed = s end
  function tr:AdjustWeight() end
  return tr
end
classes.Humanoid.methods.LoadAnimation = function(_, anim) return animTrack(anim) end
classes.Humanoid.get.Animator = function(h) return { LoadAnimation = function(_, anim) return animTrack(anim) end } end
local ReplicatedStorage = service("ReplicatedStorage"); local ServerStorage = service("ServerStorage"); local ServerScriptService = service("ServerScriptService")
local StarterGui = service("StarterGui"); local StarterPack = service("StarterPack"); local StarterPlayer = service("StarterPlayer"); service("Teams"); service("Chat"); service("MarketplaceService"); service("ReplicatedFirst"); service("TextService"); service("PathfindingService"); service("PhysicsService"); service("GuiService"); service("TeleportService"); service("RunService"); service("SoundService")
local Lighting = service("Lighting", "Instance", { props = { ClockTime = 14, TimeOfDay = "14:00:00", Brightness = 2, Ambient = Color3.new(0.27, 0.27, 0.27), OutdoorAmbient = Color3.new(0.5, 0.5, 0.5), FogEnd = 100000, FogStart = 0, FogColor = Color3.new(0.75, 0.75, 0.75), GlobalShadows = true, ExposureCompensation = 0 },
  methods = { GetMinutesAfterMidnight = function(i) return rawget(i, "_props").ClockTime * 60 end, SetMinutesAfterMidnight = function(i, m) i.ClockTime = m / 60 end } })
classes.Lighting.set.ClockTime = function(i, h) h = (tonumber(h) or 0) % 24; setProp(i, "ClockTime", h); setProp(i, "TimeOfDay", string.format("%02d:%02d:00", floor(h), floor((h % 1) * 60))); act("hour", h == 0 and 0.01 or h) end
classes.Lighting.set.TimeOfDay = function(i, s) local h, m = tostring(s):match("(%d+):(%d+)"); classes.Lighting.set.ClockTime(i, (tonumber(h) or 0) + (tonumber(m) or 0) / 60) end
classes.Lighting.set.FogEnd = function(i, v) setProp(i, "FogEnd", v); act("fog", v) end
classes.Lighting.set.FogColor = function(i, c) setProp(i, "FogColor", c); act("fogcolor", enc(c)) end
classes.Lighting.set.Brightness = function(i, v) setProp(i, "Brightness", v); act("bright", v) end
classes.Lighting.set.Ambient = function(i, c) setProp(i, "Ambient", c) end
classes.Lighting.set.OutdoorAmbient = function(i, c) setProp(i, "OutdoorAmbient", c) end
local RunService = services.RunService
def("RunService", "Instance", { events = { "Heartbeat", "Stepped", "RenderStepped", "PreRender", "PreSimulation", "PostSimulation" }, methods = { IsClient = function() return true end, IsServer = function() return isHost() end, IsStudio = function() return false end, IsRunning = function() return true end, BindToRenderStep = function(_, n, p, f) _G.__rs = _G.__rs or {}; _G.__rs[n] = f end, UnbindFromRenderStep = function(_, n) if _G.__rs then _G.__rs[n] = nil end end } })
rawset(RunService, "_class", classes.RunService)
rawset(services.SoundService, "_class", (function() def("SoundService", "Instance", { methods = { PlayLocalSound = function(_, s) s:Play() end } }); return classes.SoundService end)())
def("StarterPlayer", "Instance", { props = { CharacterWalkSpeed = 16, CharacterJumpPower = 50 } }); rawset(StarterPlayer, "_class", classes.StarterPlayer)
rawget(StarterPlayer, "_props").CharacterWalkSpeed = 16; rawget(StarterPlayer, "_props").CharacterJumpPower = 50

-- Debris
local Debris = service("Debris", "Instance", { methods = { AddItem = function(_, inst, t) sleeping[#sleeping + 1] = { co = coroutine.create(function() if not rawget(inst, "_destroyed") then Methods.Destroy(inst) end end), at = NOW + (t or 10), t0 = NOW } end } })

-- CollectionService
local tagged = {}
service("CollectionService", "Instance", { methods = {
  AddTag = function(_, i, t) tagged[t] = tagged[t] or {}; tagged[t][i] = true end,
  RemoveTag = function(_, i, t) if tagged[t] then tagged[t][i] = nil end end,
  HasTag = function(_, i, t) return tagged[t] ~= nil and tagged[t][i] == true end,
  GetTagged = function(_, t) local o = {}; for i in pairs(tagged[t] or {}) do if not rawget(i, "_destroyed") then o[#o + 1] = i end end return o end,
  GetTags = function(_, i) local o = {} for t, s in pairs(tagged) do if s[i] then o[#o + 1] = t end end return o end } })

-- HttpService (sin red): JSON y GUID
local function jenc(v)
  local t = type(v)
  if t == "nil" then return "null" elseif t == "boolean" or t == "number" then return tostring(v) elseif t == "string" then return '"' .. v:gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end) .. '"' end
  if t == "table" then
    if #v > 0 or next(v) == nil then local o = {} for k = 1, #v do o[k] = jenc(v[k]) end return "[" .. table.concat(o, ",") .. "]" end
    local o = {} for k, x in pairs(v) do o[#o + 1] = jenc(tostring(k)) .. ":" .. jenc(x) end return "{" .. table.concat(o, ",") .. "}"
  end
  error("JSONEncode: tipo no valido " .. t)
end
local function jdec(s)
  local i = 1
  local function ws() i = s:find("%S", i) or #s + 1 end
  local val
  local function str() local j = i + 1; local o = {} while true do local c = s:sub(j, j); if c == '"' then i = j + 1; return table.concat(o) elseif c == "\\" then local n = s:sub(j + 1, j + 1); if n == "u" then o[#o + 1] = utf8.char(tonumber(s:sub(j + 2, j + 5), 16)); j = j + 6 else o[#o + 1] = ({ n = "\n", t = "\t", r = "\r", b = "\b", f = "\f" })[n] or n; j = j + 2 end elseif c == "" then error("JSON incompleto") else o[#o + 1] = c; j = j + 1 end end end
  function val()
    ws(); local c = s:sub(i, i)
    if c == "{" then i = i + 1; local o = {}; ws(); if s:sub(i, i) == "}" then i = i + 1 return o end
      while true do ws(); local k = str(); ws(); i = i + 1; o[k] = val(); ws(); local d = s:sub(i, i); i = i + 1; if d == "}" then return o elseif d ~= "," then error("JSON invalido") end end
    elseif c == "[" then i = i + 1; local o = {}; ws(); if s:sub(i, i) == "]" then i = i + 1 return o end
      while true do o[#o + 1] = val(); ws(); local d = s:sub(i, i); i = i + 1; if d == "]" then return o elseif d ~= "," then error("JSON invalido") end end
    elseif c == '"' then return str() elseif s:sub(i, i + 3) == "true" then i = i + 4 return true elseif s:sub(i, i + 4) == "false" then i = i + 5 return false elseif s:sub(i, i + 3) == "null" then i = i + 4 return nil end
    local num = s:match("^-?%d+%.?%d*[eE]?[+-]?%d*", i); if not num or num == "" then error("JSON invalido") end i = i + #num; return tonumber(num)
  end
  return val()
end
_G.__jenc, _G.__jdec = jenc, jdec
service("HttpService", "Instance", { methods = { JSONEncode = function(_, v) return jenc(v) end, JSONDecode = function(_, s) return jdec(s) end,
  GenerateGUID = function(_, wrap) local g = string.format("%08X-%04X-%04X-%04X-%06X%06X", math.random(0, 2 ^ 31 - 1), math.random(0, 65535), math.random(0, 65535), math.random(0, 65535), math.random(0, 16777215), math.random(0, 16777215)); return wrap == false and g or "{" .. g .. "}" end,
  GetAsync = function() error("HttpService: las peticiones HTTP no estan permitidas", 2) end, PostAsync = function() error("HttpService: las peticiones HTTP no estan permitidas", 2) end, RequestAsync = function() error("HttpService: las peticiones HTTP no estan permitidas", 2) end } })

-- DataStoreService: se guarda en este navegador (por juego y jugador); GetAsync / SetAsync / UpdateAsync / IncrementAsync / RemoveAsync
local dsCache = {}
local function dsStore(name)
  local st = { _name = tostring(name) }
  dsCache[st._name] = dsCache[st._name] or {}
  local function save(key, v) local j = v == nil and "" or jenc(v); dsCache[st._name][tostring(key)] = j ~= "" and j or nil; act("dsset", st._name, tostring(key), j) end
  local function load(key) local j = dsCache[st._name][tostring(key)]; if j == nil then return nil end return jdec(j) end
  function st:GetAsync(key) return load(key) end
  function st:SetAsync(key, v) save(key, v); return v end
  function st:RemoveAsync(key) local old = load(key); save(key, nil); return old end
  function st:IncrementAsync(key, d) local v = (tonumber(load(key)) or 0) + (d or 1); save(key, v); return v end
  function st:UpdateAsync(key, fn) local v = fn(load(key)); if v ~= nil then save(key, v) end return v end
  return st
end
service("DataStoreService", "Instance", { methods = { GetDataStore = function(_, name) return dsStore(name) end, GetOrderedDataStore = function(_, name) return dsStore(name) end } })

-- ---------- Tweens ----------
local Easing = {}
local function eIn(style, t)
  if style == "Linear" then return t elseif style == "Quad" then return t * t elseif style == "Cubic" then return t ^ 3 elseif style == "Quart" then return t ^ 4 elseif style == "Quint" then return t ^ 5
  elseif style == "Sine" then return 1 - cos(t * pi / 2) elseif style == "Expo" then return t == 0 and 0 or 2 ^ (10 * t - 10) elseif style == "Circ" then return 1 - sqrt(1 - t * t)
  elseif style == "Back" then local c = 1.70158; return (c + 1) * t ^ 3 - c * t * t
  elseif style == "Elastic" then if t == 0 or t == 1 then return t end return -(2 ^ (10 * t - 10)) * sin((t * 10 - 10.75) * (2 * pi / 3))
  elseif style == "Bounce" then t = 1 - t; local n, d = 7.5625, 2.75; local v
    if t < 1 / d then v = n * t * t elseif t < 2 / d then t = t - 1.5 / d; v = n * t * t + 0.75 elseif t < 2.5 / d then t = t - 2.25 / d; v = n * t * t + 0.9375 else t = t - 2.625 / d; v = n * t * t + 0.984375 end
    return 1 - v end
  return t
end
local function ease(style, dir, t)
  if t <= 0 then return 0 elseif t >= 1 then return 1 end
  if dir == "In" then return eIn(style, t) elseif dir == "Out" then return 1 - eIn(style, 1 - t) end
  if t < 0.5 then return eIn(style, t * 2) / 2 end return 1 - eIn(style, (1 - t) * 2) / 2
end
local function lerpv(a, b, t)
  local ty = typeof(a)
  if ty == "number" then return a + (b - a) * t elseif ty == "Vector3" or ty == "Vector2" or ty == "Color3" or ty == "UDim2" then return a:Lerp(b, t)
  elseif ty == "CFrame" then return a:Lerp(b, t) end
  return t >= 1 and b or a
end
local tweens = {}
local Tween = {}
def("Tween", "Instance", { events = { "Completed" }, props = { PlaybackState = Enum.PlaybackState.Begin }, methods = {
  Play = function(tw) local p = rawget(tw, "_tw"); if p.state == "playing" then return end if p.state ~= "paused" then p.t = -p.info.DelayTime; p.from = {}; for k in pairs(p.goals) do p.from[k] = p.inst[k] end p.rep = 0; p.dir = 1 end p.state = "playing"; rawget(tw, "_props").PlaybackState = Enum.PlaybackState.Playing; tweens[tw] = true end,
  Pause = function(tw) local p = rawget(tw, "_tw"); if p.state == "playing" then p.state = "paused"; tweens[tw] = nil; rawget(tw, "_props").PlaybackState = Enum.PlaybackState.Paused end end,
  Cancel = function(tw) local p = rawget(tw, "_tw"); p.state = "idle"; tweens[tw] = nil; rawget(tw, "_props").PlaybackState = Enum.PlaybackState.Cancelled end } })
local TweenService = service("TweenService", "Instance", { methods = { Create = function(_, inst, info, goals)
  local tw = newInstance("Tween"); rawset(tw, "_tw", { inst = inst, info = info, goals = goals, state = "idle", t = 0 }); return tw end,
  GetValue = function(_, a, style, dir) return ease(style.Name, dir.Name, a) end } })
local function stepTweens(dt)
  for tw in pairs(tweens) do
    local p = rawget(tw, "_tw"); p.t = p.t + dt
    if p.t >= 0 then
      local info = p.info; local a = info.Time > 0 and min(1, p.t / info.Time) or 1
      local e = ease(info.EasingStyle.Name, info.EasingDirection.Name, p.dir == 1 and a or 1 - a)
      for k, goal in pairs(p.goals) do if not rawget(p.inst, "_destroyed") then p.inst[k] = lerpv(p.from[k], goal, e) end end
      if a >= 1 then
        if info.Reverses and p.dir == 1 then p.dir = -1; p.t = 0
        elseif info.RepeatCount ~= 0 and (info.RepeatCount < 0 or p.rep < info.RepeatCount) then p.rep = p.rep + 1; p.dir = 1; p.t = 0
        else p.state = "done"; tweens[tw] = nil; rawget(tw, "_props").PlaybackState = Enum.PlaybackState.Completed; fire(tw, "Completed", Enum.PlaybackState.Completed) end
      end
    end
  end
end

-- ---------- entrada del jugador ----------
local keysDown = {}
local UIS = service("UserInputService", "Instance", { props = { MouseEnabled = true, KeyboardEnabled = true, TouchEnabled = false, GamepadEnabled = false }, events = { "InputBegan", "InputEnded", "InputChanged", "TouchTap", "JumpRequest" }, methods = {
  IsKeyDown = function(_, k) return keysDown[k.Name] == true end, GetMouseLocation = function() return Vector2.new(0, 0) end, GetKeysPressed = function() local o = {} for k, v in pairs(keysDown) do if v then o[#o + 1] = { KeyCode = Enum.KeyCode[k] } end end return o end,
  IsMouseButtonPressed = function() return false end } })
local CAS = service("ContextActionService", "Instance", { methods = {
  BindAction = function(_, name, fn, _, ...) _G.__cas = _G.__cas or {}; _G.__cas[name] = { fn = fn, keys = { ... } } end,
  UnbindAction = function(_, name) if _G.__cas then _G.__cas[name] = nil end end } })
local function inputObject(kcName, utype, state) return { KeyCode = Enum.KeyCode[kcName], UserInputType = utype or Enum.UserInputType.Keyboard, UserInputState = state, Delta = Vector3.new(0, 0, 0), Position = Vector3.new(0, 0, 0) } end

-- DataModel
def("DataModel", "Instance", { methods = {
  GetService = function(_, n) local s = services[n]; if not s then error("'" .. tostring(n) .. "' no es un servicio valido", 2) end return s end,
  FindService = function(_, n) return services[n] end, IsLoaded = function() return true end, BindToClose = function() end, GetObjects = function() return {} end,
  say = function(s) act("say", tostring(s)) end, title = function(s, ms) act("title", tostring(s), ms or 3000) end,
  teleport = function(x, y, z) act("teleport", x, y, z) end, setSpeed = function(n) act("speed", n) end, setJump = function(n) act("jump", n) end, setGravity = function(n) act("gravity", n) end,
  emote = function(n) act("emote", tostring(n)) end, sky = function(n) act("sky", tostring(n)) end, weather = function(n) act("weather", tostring(n or "")) end, sound = function(n) act("sound", tostring(n)) end } })
local game = newInstance("DataModel"); rawset(game, "_name", "Game")
for n, s in pairs(services) do rawset(s, "_parent", game); table.insert(rawget(game, "_kids"), s) end
rawget(game, "_props").PlaceId = 1; rawget(game, "_props").JobId = "blocksy"; rawget(game, "_props").GameId = 1
_G.game, _G.workspace, _G.Workspace = game, Workspace, Workspace
rawget(classes.DataModel, "methods").me = { name = "" }
classes.DataModel.get.PlaceId = function() return 1 end

-- jugador local y resto de jugadores
local localPlayer
local function addPlayer(name, isLocal)
  local p = newInstance("Player"); rawset(p, "_name", name); rawget(p, "_props").DisplayName = name; rawget(p, "_props").UserId = hashName(name)
  local pg = newInstance("Folder"); rawset(pg, "_name", "PlayerGui"); setParent(pg, p)
  if isLocal then rawset(pg, "_root", true) end
  local bp = newInstance("Folder"); rawset(bp, "_name", "Backpack"); setParent(bp, p)
  setParent(p, PlayersS); return p
end
local function spawnCharacter(p, isLocal)
  local ch = makeCharacter(p, isLocal); rawget(p, "_props").Character = ch; setParent(ch, Workspace)
  fire(p, "CharacterAdded", ch)
  return ch
end
local others, nameToPlayer = {}, {}
_G.__nameToPlayer = nameToPlayer
local function joinPlayer(p) rawset(p, "_joined", true); fire(PlayersS, "PlayerAdded", p) end
local function playerJoined(name)
  if nameToPlayer[name] then return end
  local p = addPlayer(name, false); nameToPlayer[name] = p; others[#others + 1] = p
  if rawget(PlayersS, "_started") then joinPlayer(p); spawnCharacter(p, false) end
end
local function playerLeft(name)
  local p = nameToPlayer[name]; if not p then return end
  nameToPlayer[name] = nil; removeFrom(others, p); rawset(p, "_joined", false)
  fire(PlayersS, "PlayerRemoving", p); local ch = rawget(p, "_props").Character; if ch then Methods.Destroy(ch) end; Methods.Destroy(p)
end

-- ---------- API clasica de Blocksy (on / command / game.* / ui) ----------
local handlers, commands = { join = {}, playerjoin = {}, chat = {}, tick = {} }, {}
function on(ev, fn) if not handlers[ev] then error("evento desconocido: " .. tostring(ev)) end table.insert(handlers[ev], fn) end
function command(name, fn) commands[string.lower(tostring(name))] = fn; act("cmd", string.lower(tostring(name))) end
ui = { setText = function(id, text) act("uitext", tostring(id), tostring(text)) end }
local function legacyFire(ev, name, text) for _, f in ipairs(handlers[ev] or {}) do fireFn(f, { name = name, text = text }) end end

-- ---------- punto de entrada para el juego ----------
local started = false
local function startGame(me)
  local lp = addPlayer(me, true); localPlayer = lp; _G.__localPlayer = lp; classes.DataModel.methods.me = { name = me }
  rawset(lp, "_joined", false)
  local mouse = newInstance("Folder"); _G.__mouse = { Hit = CFrame.new(0, 0, 0), Target = nil }
  -- lo que haya en StarterGui se copia al PlayerGui del jugador (como en Roblox)
  for _, c in ipairs(rawget(StarterGui, "_kids")) do local cc = Methods.Clone(c); setParent(cc, Methods.FindFirstChild(lp, "PlayerGui")) end
  for _, c in ipairs(rawget(StarterPack, "_kids")) do end
end
local function firstStep()
  if rawget(PlayersS, "_started") then return end
  rawset(PlayersS, "_started", true)
  rawset(localPlayer, "_joined", true); fire(PlayersS, "PlayerAdded", localPlayer); spawnCharacter(localPlayer, true)
  for _, p in ipairs(others) do joinPlayer(p); spawnCharacter(p, false) end
end
local DISPATCH = {}
function DISPATCH.init(m)
  for store, kv in pairs(m.ds or {}) do dsCache[store] = {}; for k, j in pairs(kv) do dsCache[store][k] = j end end
  startGame(m.me)
  if _G.__hotbarInit then pcall(_G.__hotbarInit) end
  for _, d in ipairs(m.parts or {}) do                                    -- piezas hechas en el Studio: estan en Workspace con su nombre
    local part = newInstance(d.type == "spawn" and "SpawnLocation" or "Part"); rawset(part, "_name", d.name or "Part")
    local pr = rawget(part, "_props")
    pr.Position = Vector3.new(d.x, d.y, d.z); pr.Size = Vector3.new(d.sx or 4, d.sy or 1, d.sz or 2); pr.Rot = Vector3.new(0, d.ry or 0, 0)
    pr.Color = Color3.fromHex(d.color or "#a3a2a5"); pr.Anchored = d.anchored ~= false; pr.CanCollide = d.collide ~= false; pr.Transparency = d.transparency or 0
    if d.shape and d.shape ~= "Block" then pr.Shape = Enum.PartType[d.shape] end
    if d.material and d.material ~= "Plastic" then pr.Material = Enum.Material[d.material] end
    setParent(part, Workspace)
  end
  local chunk, err = load(m.code, "=script", "t")
  if not chunk then report(tostring(err)) return end
  local co = coroutine.create(chunk)
  script = newInstance("Script"); _G.script = script; setParent(script, ServerScriptService)
  resume(co)
end
local snapshot = { x = 0, y = 0, z = 0 }
local function syncCharacter(p, x, y, z)
  local ch = rawget(p, "_props").Character; if not ch then return end
  local hrp, head = Methods.FindFirstChild(ch, "HumanoidRootPart"), Methods.FindFirstChild(ch, "Head")
  if hrp then rawset(hrp, "_sync", true); rawget(hrp, "_props").Position = Vector3.new(x, y + 1, z); rawset(hrp, "_sync", false) end
  if head then rawget(head, "_props").Position = Vector3.new(x, y + 2.3, z) end
end
function DISPATCH.step(d)
  NOW = NOW + d.dt; EPOCH = d.now or EPOCH
  firstStep()
  if localPlayer then syncCharacter(localPlayer, d.x, d.y, d.z) end
  for _, o in ipairs(d.others or {}) do local p = nameToPlayer[o.n]; if p then syncCharacter(p, o.x, o.y, o.z) end end
  stepTweens(d.dt)
  runSleepers()
  fire(RunService, "Stepped", NOW, d.dt); fire(RunService, "PreSimulation", d.dt); fire(RunService, "Heartbeat", d.dt); fire(RunService, "RenderStepped", d.dt); fire(RunService, "PostSimulation", d.dt)
  if _G.__rs then for _, f in pairs(_G.__rs) do fireFn(f, d.dt) end end
end
function DISPATCH.touch(d)
  local i = nil
  -- el juego manda el id; buscamos la instancia por id recorriendo el arbol conocido
  local function find(n) if rawget(n, "_id") == d.id then return n end for _, c in ipairs(rawget(n, "_kids")) do local r = find(c); if r then return r end end end
  i = find(Workspace); if not i then return end
  local ch = rawget(localPlayer, "_props").Character; local hrp = ch and Methods.FindFirstChild(ch, "HumanoidRootPart")
  if d.on == 1 then fire(i, "Touched", hrp) else fire(i, "TouchEnded", hrp) end
end
local function findById(id, from)
  if rawget(from, "_id") == id then return from end
  for _, c in ipairs(rawget(from, "_kids")) do local r = findById(id, c); if r then return r end end
end
function DISPATCH.click(d)
  local part = findById(d.id, Workspace); if not part then return end
  local cd = Methods.FindFirstChildOfClass(part, "ClickDetector"); if cd then fire(cd, "MouseClick", localPlayer) end
end
function DISPATCH.prompt(d)
  local part = findById(d.id, Workspace); if not part then return end
  local pp = Methods.FindFirstChildOfClass(part, "ProximityPrompt"); if pp then fire(pp, "Triggered", localPlayer) end
end
function DISPATCH.guiclick(d)
  local g = findById(d.id, Methods.FindFirstChild(localPlayer, "PlayerGui")); if not g then return end
  fire(g, "MouseButton1Click"); fire(g, "Activated")
end
function DISPATCH.key(d)
  keysDown[d.k] = d.down and true or nil
  if d.down and _G.__hotbarKey then _G.__hotbarKey(d.k) end
  local inp = inputObject(d.k, nil, d.down and Enum.UserInputState.Begin or Enum.UserInputState.End)
  fire(UIS, d.down and "InputBegan" or "InputEnded", inp, false)
  if _G.__cas then for n, a in pairs(_G.__cas) do for _, k in ipairs(a.keys) do if k == Enum.KeyCode[d.k] or k == d.k then fireFn(a.fn, n, d.down and Enum.UserInputState.Begin or Enum.UserInputState.End, inp) end end end end
  if d.k == "Space" and d.down then fire(UIS, "JumpRequest") end
end
function DISPATCH.mouse(d)
  if _G.__toolClick then _G.__toolClick(d.down) end
  local inp = inputObject("Unknown", Enum.UserInputType.MouseButton1, d.down and Enum.UserInputState.Begin or Enum.UserInputState.End)
  fire(UIS, d.down and "InputBegan" or "InputEnded", inp, false)
end
function DISPATCH.remote(d)
  local ev = runpack({ ["$i"] = d.id }); if not ev or rawget(ev, "_class").name ~= "RemoteEvent" then return end
  local ok, data = pcall(jdec, d.a); if not ok or type(data) ~= "table" then return end
  local args = {}; for i = 1, data.n or 0 do args[i] = runpack(data.a[i]) end
  local from = nameToPlayer[d.from]
  if d.m == "srv" then if isHost() and from then fire(ev, "OnServerEvent", from, table.unpack(args, 1, data.n)) end
  elseif d.m == "all" or (d.m == "cl" and d.t == rawget(_G.__localPlayer, "_name")) then fire(ev, "OnClientEvent", table.unpack(args, 1, data.n)) end
end
function DISPATCH.partpos(d)
  local part = findById(d.id, Workspace); if part then rawget(part, "_props").Position = Vector3.new(d.x, d.y, d.z) end
end
function DISPATCH.playerjoin(d) playerJoined(d.name); legacyFire("playerjoin", d.name, "") end
function DISPATCH.playerleave(d) playerLeft(d.name) end
function DISPATCH.chat(d)
  local p = (localPlayer and rawget(localPlayer, "_name") == d.name) and localPlayer or nameToPlayer[d.name]
  if p then fire(p, "Chatted", d.text) end
  legacyFire("chat", d.name, d.text)
end
function DISPATCH.join(d) legacyFire("join", d.name, "") end
function DISPATCH.tick(d) legacyFire("tick", "", "") end
function DISPATCH.command(d) local f = commands[d.name]; if f then fireFn(f, d.args, d.who) end; if localPlayer then fire(localPlayer, "Chatted", "/" .. d.name .. (d.args ~= "" and (" " .. d.args) or "")) end end
function DISPATCH.respawned(d) local p = localPlayer; if p then local hum = Methods.FindFirstChildOfClass(rawget(p, "_props").Character or newInstance("Folder"), "Humanoid"); if hum then rawget(hum, "_props").Health = rawget(hum, "_props").MaxHealth end end end
-- herramientas: Tool en la Backpack, barra de objetos abajo (teclas 1-9 o clic), Activated con el clic del raton
standard("Tool", "Instance", { props = { ToolTip = "", CanBeDropped = true, RequiresHandle = false, Enabled = true, TextureId = "", ManualActivationOnly = false }, events = { "Activated", "Deactivated", "Equipped", "Unequipped" },
  methods = { Activate = function(i) if rawget(i, "_props").Enabled then fire(i, "Activated") end end } })
local tbar, tslots = nil, {}
local function myChar() return localPlayer and rawget(localPlayer, "_props").Character end
local function myPack() return localPlayer and Methods.FindFirstChild(localPlayer, "Backpack") end
local function equippedTool() local c = myChar(); return c and Methods.FindFirstChildOfClass(c, "Tool") end
local function toolList()
  local out, seen = {}, {}
  local e = equippedTool(); if e then out[#out + 1] = e; seen[e] = true end
  local bp = myPack(); if bp then for _, t in ipairs(rawget(bp, "_kids")) do if rawget(t, "_class").name == "Tool" and not seen[t] then out[#out + 1] = t end end end
  return out
end
local function unequipAll()
  local e = equippedTool(); local bp = myPack()
  if e and bp then setParent(e, bp); fire(e, "Unequipped") end
end
local function equip(t)
  local c = myChar(); if not c or not t then return end
  if equippedTool() == t then unequipAll(); return end
  unequipAll(); setParent(t, c); fire(t, "Equipped", nil)
end
local refreshBar
function refreshBar()
  if not localPlayer then return end
  local pg = Methods.FindFirstChild(localPlayer, "PlayerGui"); if not pg then return end
  if not tbar then
    local g = newInstance("ScreenGui"); rawset(g, "_name", "Hotbar"); setParent(g, pg)
    tbar = newInstance("Frame"); local p = rawget(tbar, "_props")
    p.Size = UDim2.new(0, 520, 0, 52); p.Position = UDim2.new(0.5, 0, 1, -92); p.AnchorPoint = Vector2.new(0.5, 0); p.BackgroundTransparency = 1
    setParent(tbar, g)
    local l = newInstance("UIListLayout"); rawget(l, "_props").FillDirection = Enum.FillDirection.Horizontal; rawget(l, "_props").HorizontalAlignment = Enum.HorizontalAlignment.Center; rawget(l, "_props").Padding = UDim.new(0, 6); setParent(l, tbar)
  end
  for _, s in ipairs(tslots) do s:Destroy() end
  tslots = {}
  local list, e = toolList(), equippedTool()
  for n, t in ipairs(list) do
    local b = newInstance("TextButton"); local p = rawget(b, "_props")
    p.Size = UDim2.new(0, 56, 0, 52); p.TextSize = 13; p.TextWrapped = true; p.TextColor3 = Color3.new(1, 1, 1)
    p.BackgroundColor3 = (t == e) and Color3.fromRGB(255, 190, 40) or Color3.fromRGB(30, 34, 46); p.BackgroundTransparency = 0.2
    p.Text = n .. "\n" .. rawget(t, "_name")
    local cr = newInstance("UICorner"); setParent(cr, b)
    setParent(b, tbar); tslots[#tslots + 1] = b
    b.MouseButton1Click:Connect(function() equip(t) end)
  end
end
_G.__hotbarKey = function(k)
  local n = ({ One = 1, Two = 2, Three = 3, Four = 4, Five = 5, Six = 6, Seven = 7, Eight = 8, Nine = 9 })[k]
  if n then local t = toolList()[n]; if t then equip(t) end end
end
_G.__toolClick = function(down)
  local e = equippedTool(); if not e then return end
  if down then if rawget(e, "_props").Enabled then fire(e, "Activated") end else fire(e, "Deactivated") end
end
_G.__hotbarInit = function()
  local bp = myPack(); if not bp then return end
  bp.ChildAdded:Connect(refreshBar); bp.ChildRemoved:Connect(refreshBar)
  localPlayer.CharacterAdded:Connect(function(c) c.ChildAdded:Connect(refreshBar); c.ChildRemoved:Connect(refreshBar); refreshBar() end)
  local c = myChar(); if c then c.ChildAdded:Connect(refreshBar); c.ChildRemoved:Connect(refreshBar) end
  refreshBar()
end
classes.Humanoid.methods.EquipTool = function(_, t) equip(t) end
classes.Humanoid.methods.UnequipTools = function() unequipAll() end

function __dispatch(kind, data) local f = DISPATCH[kind]; if f then f(data) end end
