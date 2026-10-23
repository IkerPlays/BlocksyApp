// Worker aislado que ejecuta los scripts Lua de un juego (fengari = Lua 5.3 en JavaScript).
// Sin acceso a io, os, package ni debug; un contador de instrucciones corta los bucles infinitos (también dentro de las corrutinas).
// La API de Roblox (Instance, services, task, Vector3...) está escrita en Lua en ./lua/roblox.lua.
import fengari from 'fengari'
import ROBLOX from './lua/roblox.lua?raw'
import { transpile } from './luau.js'      // Luau (+=, continue, tipos, `{x}`) -> Lua 5.3
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari
const L = lauxlib.luaL_newstate()
for (const [name, open] of [['_G', lualib.luaopen_base], ['table', lualib.luaopen_table], ['string', lualib.luaopen_string], ['math', lualib.luaopen_math], ['coroutine', lualib.luaopen_coroutine], ['utf8', lualib.luaopen_utf8]]) {   // sin io, os, package ni debug
  lauxlib.luaL_requiref(L, to_luastring(name), open, 1); lua.lua_pop(L, 1)
}
const post = self.postMessage.bind(self)
for (const k of ['fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'indexedDB', 'caches']) { try { Object.defineProperty(self, k, { value: undefined, configurable: false }) } catch {} }

const LIMIT = 300000
const hook = L2 => lauxlib.luaL_error(L2, to_luastring('el script tardó demasiado'))
const guard = () => lua.lua_sethook(L, hook, lua.LUA_MASKCOUNT, LIMIT)

// act(tipo, ...): el script pide acciones; el juego decide si las aplica
let nacts = 0
lua.lua_pushjsfunction(L, L2 => {
  const top = lua.lua_gettop(L2); const type = to_jsstring(lauxlib.luaL_checklstring(L2, 1)); const a = []
  for (let i = 2; i <= top && i <= 8; i++) a.push(lua.lua_type(L2, i) === lua.LUA_TNUMBER ? lua.lua_tonumber(L2, i) : to_jsstring(lauxlib.luaL_tolstring(L2, i)))
  if (++nacts < 3000) post({ t: 'act', type, a })
  return 0
})
lua.lua_setglobal(L, to_luastring('__act'))
// __guard(corrutina): reinicia el contador de instrucciones de esa corrutina antes de reanudarla
lua.lua_pushjsfunction(L, L2 => { const th = lua.lua_tothread(L2, 1); if (th) lua.lua_sethook(th, hook, lua.LUA_MASKCOUNT, LIMIT); return 0 })
lua.lua_setglobal(L, to_luastring('__guard'))
lua.lua_pushjsfunction(L, L2 => { post({ t: 'error', msg: to_jsstring(lauxlib.luaL_tolstring(L2, 1)) }); return 0 })
lua.lua_setglobal(L, to_luastring('__err'))

const run = (src, name) => lauxlib.luaL_loadbuffer(L, to_luastring(src), src.length, to_luastring(name)) || lua.lua_pcall(L, 0, 0, 0)
const err = () => { const m = to_jsstring(lua.lua_tostring(L, -1) ?? to_luastring('error')); lua.lua_pop(L, 1); return m }

function pushVal(v) {
  if (v === null || v === undefined) lua.lua_pushnil(L)
  else if (typeof v === 'number') lua.lua_pushnumber(L, Number.isFinite(v) ? v : 0)
  else if (typeof v === 'boolean') lua.lua_pushboolean(L, v)
  else if (typeof v === 'string') lua.lua_pushstring(L, to_luastring(v))
  else if (Array.isArray(v)) { lua.lua_createtable(L, v.length, 0); v.forEach((x, i) => { pushVal(x); lua.lua_rawseti(L, -2, i + 1) }) }
  else { lua.lua_createtable(L, 0, 6); for (const [k, x] of Object.entries(v)) { pushVal(x); lua.lua_setfield(L, -2, to_luastring(k)) } }
}
function dispatch(kind, data) {
  lua.lua_getglobal(L, to_luastring('__dispatch')); lua.lua_pushstring(L, to_luastring(kind)); pushVal(data)
  if (lua.lua_pcall(L, 2, 0, 0)) post({ t: 'error', msg: err() })
}

guard()
run(ROBLOX, '=roblox') && post({ t: 'error', msg: err() })
lua.lua_sethook(L, null, 0, 0)

self.onmessage = e => {
  const m = e.data
  if (m.t === 'check') {                                                  // solo comprobar la sintaxis
    const code = transpile(m.code), r = lauxlib.luaL_loadbuffer(L, to_luastring(code), code.length, to_luastring('=script'))
    post({ t: 'checked', err: r ? to_jsstring(lua.lua_tostring(L, -1)) : null }); return
  }
  nacts = 0; guard()
  try {
    if (m.t === 'init') { dispatch('init', { me: m.me?.name ?? '', code: transpile(m.code), parts: m.parts ?? [], ds: m.ds ?? {} }); lua.lua_sethook(L, null, 0, 0); post({ t: 'ready' }); return }
    const d = { ...(m.data ?? {}) }
    if (m.name !== undefined) d.name = String(m.name)
    if (m.args !== undefined) d.args = String(m.args)
    if (m.who !== undefined) d.who = String(m.who)
    dispatch(m.ev, d)
  } catch (er) { post({ t: 'error', msg: String(er?.message || er) }) }
  lua.lua_sethook(L, null, 0, 0); post({ t: 'ack', id: m.id })
}
