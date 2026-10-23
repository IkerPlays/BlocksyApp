import fengari from 'fengari'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari
// Ejecuta la capa Roblox (src/lua/roblox.lua) sin navegador: acts = acciones que el script pidió al juego, errs = errores
export function make() {
  const L = lauxlib.luaL_newstate(); const acts = [], errs = []
  for (const [name, open] of [['_G', lualib.luaopen_base], ['table', lualib.luaopen_table], ['string', lualib.luaopen_string], ['math', lualib.luaopen_math], ['coroutine', lualib.luaopen_coroutine], ['utf8', lualib.luaopen_utf8]]) { lauxlib.luaL_requiref(L, to_luastring(name), open, 1); lua.lua_pop(L, 1) }
  const hook = L2 => lauxlib.luaL_error(L2, to_luastring('timeout'))
  lua.lua_pushjsfunction(L, L2 => { const top = lua.lua_gettop(L2); const type = to_jsstring(lauxlib.luaL_checklstring(L2, 1)); const a = []; for (let i = 2; i <= top && i <= 8; i++) a.push(lua.lua_type(L2, i) === lua.LUA_TNUMBER ? lua.lua_tonumber(L2, i) : to_jsstring(lauxlib.luaL_tolstring(L2, i))); acts.push([type, ...a]); return 0 }); lua.lua_setglobal(L, to_luastring('__act'))
  lua.lua_pushjsfunction(L, L2 => { const th = lua.lua_tothread(L2, 1); if (th) lua.lua_sethook(th, hook, lua.LUA_MASKCOUNT, 300000); return 0 }); lua.lua_setglobal(L, to_luastring('__guard'))
  lua.lua_pushjsfunction(L, L2 => { errs.push(to_jsstring(lauxlib.luaL_tolstring(L2, 1))); return 0 }); lua.lua_setglobal(L, to_luastring('__err'))
  const src = fs.readFileSync(fileURLToPath(new URL('../src/lua/roblox.lua', import.meta.url)), 'utf8')
  const r = lauxlib.luaL_loadbuffer(L, to_luastring(src), src.length, to_luastring('=roblox')) || lua.lua_pcall(L, 0, 0, 0)
  if (r) throw new Error('boot: ' + to_jsstring(lua.lua_tostring(L, -1)))
  function pushVal(v) {
    if (v == null) lua.lua_pushnil(L); else if (typeof v === 'number') lua.lua_pushnumber(L, v); else if (typeof v === 'boolean') lua.lua_pushboolean(L, v); else if (typeof v === 'string') lua.lua_pushstring(L, to_luastring(v))
    else if (Array.isArray(v)) { lua.lua_createtable(L, v.length, 0); v.forEach((x, i) => { pushVal(x); lua.lua_rawseti(L, -2, i + 1) }) }
    else { lua.lua_createtable(L, 0, 6); for (const [k, x] of Object.entries(v)) { pushVal(x); lua.lua_setfield(L, -2, to_luastring(k)) } }
  }
  const dispatch = (kind, data) => { lua.lua_getglobal(L, to_luastring('__dispatch')); lua.lua_pushstring(L, to_luastring(kind)); pushVal(data); if (lua.lua_pcall(L, 2, 0, 0)) errs.push('DISPATCH: ' + to_jsstring(lua.lua_tostring(L, -1))) }
  return { acts, errs, dispatch }
}
