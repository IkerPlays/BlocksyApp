// fengari trae librerías que dependen de Node (io, os, package, debug); en el navegador se sustituyen por huecos vacíos
const nop = () => 0
export const luaopen_io = nop, luaopen_os = nop, luaopen_package = nop, luaopen_debug = nop
export default { luaopen_io: nop, luaopen_os: nop, luaopen_package: nop, luaopen_debug: nop }
