// Consola de scripts: guarda lo que imprime el script del juego y sus errores (con la línea) para verlos en el editor de código
const items = [], subs = new Set()
export const scriptConsole = {
  items,
  push(kind, text) { items.push({ kind, text: String(text), at: Date.now() }); while (items.length > 80) items.shift(); subs.forEach(f => f()) },
  clear() { items.length = 0; subs.forEach(f => f()) },
  on(f) { subs.add(f); return () => subs.delete(f) },
}
// "script:12: attempt to ..." (Lua) o "... (line 12)" / ":12:" (JS) -> 12
export const errorLine = text => { const m = /script:(\d+):/.exec(text) ?? /\bline (\d+)\b/i.exec(text) ?? /:(\d+):\d*/.exec(text); return m ? +m[1] : 0 }
