// Worker aislado que ejecuta los scripts Lua de un juego (fengari = Lua 5.3 en JavaScript).
// Sin acceso a io, os, package ni debug; un contador de instrucciones corta los bucles infinitos.
import fengari from 'fengari'
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari
const L = lauxlib.luaL_newstate()
for (const [name, open] of [['_G', lualib.luaopen_base], ['table', lualib.luaopen_table], ['string', lualib.luaopen_string], ['math', lualib.luaopen_math], ['coroutine', lualib.luaopen_coroutine], ['utf8', lualib.luaopen_utf8]]) {   // sin io, os, package ni debug
  lauxlib.luaL_requiref(L, to_luastring(name), open, 1); lua.lua_pop(L, 1)
}
const post = self.postMessage.bind(self)
for (const k of ['fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'indexedDB', 'caches']) { try { Object.defineProperty(self, k, { value: undefined, configurable: false }) } catch {} }

// act(tipo, a, b, c): el script pide acciones; el juego decide si las aplica
let nacts = 0
lua.lua_pushjsfunction(L, L2 => {
  const top = lua.lua_gettop(L2); const type = to_jsstring(lauxlib.luaL_checklstring(L2, 1)); const a = []
  for (let i = 2; i <= top && i <= 5; i++) a.push(lua.lua_type(L2, i) === lua.LUA_TNUMBER ? lua.lua_tonumber(L2, i) : to_jsstring(lauxlib.luaL_tolstring(L2, i)))
  if (++nacts < 400) post({ t: 'act', type, a })
  return 0
})
lua.lua_setglobal(L, to_luastring('__act'))

const BOOT = `
local act = __act
for _, n in ipairs({ "dofile", "loadfile", "require", "collectgarbage" }) do _G[n] = nil end
local handlers, commands = { join = {}, playerjoin = {}, chat = {}, tick = {} }, {}
function on(ev, fn) if not handlers[ev] then error("evento desconocido: " .. tostring(ev)) end table.insert(handlers[ev], fn) end
function command(name, fn) commands[string.lower(tostring(name))] = fn end
function __fire(ev, name, text) for _, f in ipairs(handlers[ev] or {}) do f({ name = name, text = text }) end end
function __cmd(name, args, who) local f = commands[name]; if f then f(args, who) end end
game = {
  say = function(s) act("say", tostring(s)) end, title = function(s, ms) act("title", tostring(s), ms or 3000) end,
  teleport = function(x, y, z) act("teleport", x, y, z) end, setSpeed = function(n) act("speed", n) end,
  setJump = function(n) act("jump", n) end, setGravity = function(n) act("gravity", n) end,
  emote = function(n) act("emote", tostring(n)) end, sky = function(n) act("sky", tostring(n)) end, sound = function(n) act("sound", tostring(n)) end,
  me = { name = "" },
}
ui = { setText = function(id, text) act("uitext", tostring(id), tostring(text)) end }
`
const run = (src, name) => lauxlib.luaL_loadbuffer(L, to_luastring(src), src.length, to_luastring(name)) || lua.lua_pcall(L, 0, 0, 0)
const err = () => { const m = to_jsstring(lua.lua_tostring(L, -1) ?? to_luastring('error')); lua.lua_pop(L, 1); return m }
const LIMIT = 300000
const guard = () => lua.lua_sethook(L, L2 => lauxlib.luaL_error(L2, to_luastring('el script tardó demasiado')), lua.LUA_MASKCOUNT, LIMIT)

run(BOOT, '=boot') && post({ t: 'error', msg: err() })

self.onmessage = e => {
  const m = e.data
  if (m.t === 'check') {                                                  // solo comprobar la sintaxis
    const r = lauxlib.luaL_loadbuffer(L, to_luastring(m.code), m.code.length, to_luastring('=script'))
    post({ t: 'checked', err: r ? to_jsstring(lua.lua_tostring(L, -1)) : null }); return
  }
  if (m.t === 'init') {
    lua.lua_getglobal(L, to_luastring('game')); lua.lua_getfield(L, -1, to_luastring('me')); lua.lua_pushstring(L, to_luastring(m.me?.name ?? '')); lua.lua_setfield(L, -2, to_luastring('name')); lua.lua_pop(L, 2)
    guard()
    if (run(m.code, '=script')) post({ t: 'error', msg: err() })
    lua.lua_sethook(L, null, 0, 0); post({ t: 'ready' }); return
  }
  nacts = 0; guard()
  try {
    if (m.ev === 'command') { lua.lua_getglobal(L, to_luastring('__cmd')); lua.lua_pushstring(L, to_luastring(String(m.name))); lua.lua_pushstring(L, to_luastring(String(m.args ?? ''))); lua.lua_pushstring(L, to_luastring(String(m.who ?? ''))); if (lua.lua_pcall(L, 3, 0, 0)) post({ t: 'error', msg: err() }) }
    else { lua.lua_getglobal(L, to_luastring('__fire')); lua.lua_pushstring(L, to_luastring(m.ev)); lua.lua_pushstring(L, to_luastring(String(m.data?.name ?? ''))); lua.lua_pushstring(L, to_luastring(String(m.data?.text ?? ''))); if (lua.lua_pcall(L, 3, 0, 0)) post({ t: 'error', msg: err() }) }
  } catch (er) { post({ t: 'error', msg: String(er?.message || er) }) }
  lua.lua_sethook(L, null, 0, 0); post({ t: 'ack', id: m.id })
}
