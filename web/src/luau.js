// Traduce lo más usado de Luau (el Lua de Roblox) a Lua 5.3, que es lo que ejecuta fengari:
//   a += 1 (y -= *= /= %= ^= ..=), continue, anotaciones de tipos (local x: number, function f(a: string): boolean, type X = ...), cadenas con `{variable}`.
// No cambia el número de líneas, así los errores siguen apuntando a la línea correcta.
const KW_END = new Set(['end', 'else', 'elseif', 'until'])
const OPEN = new Set(['do', 'function', 'if', 'repeat'])               // while / for llevan su propio "do"
const BIN = { '+=': '+', '-=': '-', '*=': '*', '/=': '/', '%=': '%', '^=': '^', '..=': '..' }

function tokenize(src) {
  const out = []; let i = 0; const n = src.length
  const push = (t, v) => out.push({ t, v })
  while (i < n) {
    const c = src[i]
    if (/\s/.test(c)) { let j = i; while (j < n && /\s/.test(src[j])) j++; push('ws', src.slice(i, j)); i = j; continue }
    if (c === '-' && src[i + 1] === '-') {
      const m = /^--\[(=*)\[/.exec(src.slice(i, i + 40))
      if (m) { const close = ']' + m[1] + ']'; const k = src.indexOf(close, i + m[0].length); const e = k < 0 ? n : k + close.length; push('comment', src.slice(i, e)); i = e; continue }
      let j = i; while (j < n && src[j] !== '\n') j++; push('comment', src.slice(i, j)); i = j; continue
    }
    if (c === '"' || c === "'") { let j = i + 1; while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++ } push('str', src.slice(i, j + 1)); i = j + 1; continue }
    if (c === '`') {                                                      // cadena con interpolación
      let j = i + 1; const parts = []; let lit = ''
      while (j < n && src[j] !== '`') {
        if (src[j] === '\\') { lit += src.slice(j, j + 2); j += 2; continue }
        if (src[j] === '{') { let d = 1, k = j + 1; while (k < n && d) { if (src[k] === '{') d++; else if (src[k] === '}') d--; k++ } parts.push({ lit }); lit = ''; parts.push({ ex: src.slice(j + 1, k - 1) }); j = k; continue }
        lit += src[j] === '"' ? '\\"' : src[j] === '\n' ? '\\n' : src[j]; j++
      }
      parts.push({ lit })
      const nl = (src.slice(i, j + 1).match(/\n/g) ?? []).length
      push('str', '(' + parts.filter(p => p.ex !== undefined || p.lit).map(p => (p.ex !== undefined ? `tostring(${p.ex})` : `"${p.lit}"`)).join(' .. ').replace(/^$/, '""') + ')' + '\n'.repeat(0)); out[out.length - 1].nl = nl
      i = j + 1; continue
    }
    if (c === '[') { const m = /^\[(=*)\[/.exec(src.slice(i, i + 40)); if (m) { const close = ']' + m[1] + ']'; const k = src.indexOf(close, i + m[0].length); const e = k < 0 ? n : k + close.length; push('str', src.slice(i, e)); i = e; continue } }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) { let j = i; while (j < n && /[0-9a-zA-Z_.]/.test(src[j])) { if ((src[j] === 'e' || src[j] === 'E') && (src[j + 1] === '+' || src[j + 1] === '-')) j++; j++ } push('num', src.slice(i, j).replace(/_/g, '')); i = j; continue }
    if (/[A-Za-z_]/.test(c)) { let j = i; while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++; push('name', src.slice(i, j)); i = j; continue }
    const three = src.slice(i, i + 3), two = src.slice(i, i + 2)
    if (three === '..=' || three === '...') { push('op', three); i += 3; continue }
    if (['+=', '-=', '*=', '/=', '%=', '^=', '==', '~=', '<=', '>=', '..', '::', '//'].includes(two)) { push('op', two); i += 2; continue }
    push('op', c); i++
  }
  return out
}

export function transpile(src) {
  if (!/(\+=|-=|\*=|\/=|%=|\^=|\.\.=|\bcontinue\b|:\s*[A-Za-z{(]|\btype\s+[A-Za-z_]|`)/.test(src)) return src         // nada que traducir
  const T = tokenize(src)
  const sig = i => { while (i < T.length && (T[i].t === 'ws' || T[i].t === 'comment')) i++; return i }            // siguiente token con significado
  const hasNl = tk => tk.t === 'ws' && tk.v.includes('\n')

  // ---- 1. anotaciones de tipos ----
  const skipType = (i, stops) => {                                                                                // devuelve el índice donde acaba el tipo
    let d = 0
    while (i < T.length) {
      const tk = T[i]
      if (tk.t === 'op' && '({<['.includes(tk.v)) d++
      else if (tk.t === 'op' && ')}>]'.includes(tk.v)) { if (d === 0) return i; d-- }
      else if (d === 0 && ((tk.t === 'op' && stops.includes(tk.v)) || (stops.includes('\n') && hasNl(tk)) || (tk.t === 'name' && stops.includes(tk.v)))) return i
      i++
    }
    return i
  }
  for (let i = 0; i < T.length; i++) {
    const tk = T[i]
    if (tk.t !== 'name') continue
    if (tk.v === 'type' && (i === 0 || hasNl(T[i - 1]) || T[i - 1].v === ';')) {                                  // type Foo = ...
      const j = sig(i + 1), k = sig(j + 1)
      if (T[j]?.t === 'name' && (T[k]?.v === '=' || T[k]?.v === '<')) { let e = i; let d = 0; while (e < T.length) { const x = T[e]; if (x.t === 'op' && '({<['.includes(x.v)) d++; else if (x.t === 'op' && ')}>]'.includes(x.v)) d--; else if (d <= 0 && e > k && hasNl(x)) break; e++ } for (let q = i; q < e; q++) if (T[q].t !== 'ws' && T[q].t !== 'comment') T[q] = { t: 'ws', v: '' }; else if (T[q].t === 'comment') T[q] = { t: 'ws', v: '' }; continue }
    }
    if (tk.v === 'local') {                                                                                        // local a: T, b: U = ...
      let j = sig(i + 1)
      if (T[j]?.v === 'function') continue
      while (T[j]?.t === 'name') {
        const k = sig(j + 1)
        if (T[k]?.v === ':' && T[k + 1]?.v !== ':') { const e = skipType(k + 1, ['=', ',', '\n', ';']); for (let q = k; q < e; q++) if (T[q].t !== 'ws' || !T[q].v.includes('\n')) T[q] = { t: 'ws', v: T[q].t === 'ws' ? T[q].v.replace(/[^\n]/g, '') : '' }; j = sig(e) } else j = k
        if (T[j]?.v === ',') j = sig(j + 1); else break
      }
    }
    if (tk.v === 'function') {                                                                                     // function f(a: T, b: U): R
      let j = i + 1; while (j < T.length && T[j].v !== '(' && !(T[j].t === 'op' && T[j].v === '(')) { if (T[j].t === 'name' || T[j].v === '.' || T[j].v === ':' || T[j].t === 'ws') j++; else break }
      if (T[j]?.v !== '(') continue
      let d = 0, e = j
      for (; e < T.length; e++) {
        const x = T[e]
        if (x.v === '(' && x.t === 'op') d++
        else if (x.v === ')' && x.t === 'op') { d--; if (d === 0) break }
        else if (d === 1 && x.t === 'op' && x.v === ':') { const stop = skipType(e + 1, [',']); for (let q = e; q < stop; q++) T[q] = { t: 'ws', v: T[q].t === 'ws' ? T[q].v.replace(/[^\n]/g, '') : '' }; e = stop - 1 }
      }
      const r = sig(e + 1)
      if (T[r]?.v === ':' && T[r]?.t === 'op') { const stop = skipType(r + 1, ['\n', 'return', 'local', 'if', 'for', 'while', 'end', 'do', 'repeat', 'break', 'goto']); for (let q = r; q < stop; q++) T[q] = { t: 'ws', v: T[q].t === 'ws' ? T[q].v.replace(/[^\n]/g, '') : '' } }
    }
  }

  // ---- 2. asignaciones compuestas (a += b) ----
  for (let i = 0; i < T.length; i++) {
    const tk = T[i]; if (tk.t !== 'op' || !BIN[tk.v]) continue
    let s = i - 1; while (s >= 0 && T[s].t === 'ws') s--
    let b = s, depth = 0                                                                                            // retrocede por el lado izquierdo (nombre.campo[indice])
    for (; b >= 0; b--) {
      const x = T[b]
      if (x.t === 'op' && (x.v === ']' || x.v === ')')) depth++
      else if (x.t === 'op' && (x.v === '[' || x.v === '(')) { depth--; if (depth < 0) { b++; break } }
      else if (depth === 0 && x.t === 'name' && b > 0 && ['.', ':'].includes(T[b - 1].v)) { b--; continue }
      else if (depth === 0 && x.t === 'name') { if (b > 0 && T[b - 1].t === 'name' && !['local'].includes(T[b - 1].v)) { /* otra palabra: fin */ } break }
      else if (depth === 0 && !(x.t === 'op' && x.v === '.') && x.t !== 'ws') { b++; break }
    }
    if (b < 0) b = 0
    let lv = ''; for (let q = b; q <= s; q++) lv += T[q].v
    lv = lv.trim()
    // fin de la expresión de la derecha
    let e = i + 1, d = 0
    for (; e < T.length; e++) {
      const x = T[e]
      if (x.t === 'op' && '({['.includes(x.v)) d++
      else if (x.t === 'op' && ')}]'.includes(x.v)) { if (d === 0) break; d-- }
      else if (d === 0 && ((x.t === 'op' && x.v === ';') || hasNl(x) || (x.t === 'name' && KW_END.has(x.v)))) break
      else if (x.t === 'comment' && d === 0) break
    }
    let last = e - 1; while (last > i && (T[last].t === 'ws' || T[last].t === 'comment')) last--
    T[i] = { t: 'op', v: `= ${lv} ${BIN[tk.v]} (` }
    T[last] = { ...T[last], v: T[last].v + ')' }
  }

  // ---- 3. continue ----
  const stack = []                                                                                                // pila de bloques; cada bucle guarda su id
  let loopId = 0
  for (let i = 0; i < T.length; i++) {
    const tk = T[i]; if (tk.t !== 'name') continue
    const v = tk.v
    if (v === 'while' || v === 'for') { stack.push({ loop: true, id: ++loopId, used: false, waitDo: true }); continue }
    if (v === 'repeat') { stack.push({ loop: true, id: ++loopId, used: false, rep: true }); continue }
    if (v === 'do') { const top = stack[stack.length - 1]; if (top?.waitDo) top.waitDo = false; else stack.push({ loop: false }); continue }
    if (v === 'function' || v === 'if') { const prev = (() => { let k = i - 1; while (k >= 0 && T[k].t === 'ws') k--; return T[k] })(); if (v === 'if' || !(prev?.v === 'end' && false)) stack.push({ loop: false, fn: v === 'function' }); continue }
    if (v === 'then' || v === 'elseif' || v === 'else') continue
    if (v === 'end') { const b = stack.pop(); if (b?.loop && b.used) T[i] = { t: 'name', v: `::__c${b.id}:: end` }; continue }
    if (v === 'until') { const b = stack.pop(); if (b?.loop && b.used) T[i] = { t: 'name', v: `::__c${b.id}:: until` }; continue }
    if (v === 'continue' && T[sig(i + 1)]?.v !== '=' && T[i - 1]?.v !== '.') {
      let k = stack.length - 1; while (k >= 0 && !stack[k].loop) { if (stack[k].fn) { k = -1; break } k-- }
      if (k >= 0) { stack[k].used = true; T[i] = { t: 'name', v: `goto __c${stack[k].id}` } }
    }
  }
  return T.map(x => x.v).join('')
}
