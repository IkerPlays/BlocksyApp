// Interfaz del Studio estilo Roblox Studio: cinta de herramientas arriba, Explorer y Toolbox a la izquierda,
// Properties / Entorno / Juego / Versiones a la derecha y Output abajo. El visor 3D ocupa el hueco central.
export function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) { if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v) }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)))
  return e
}
const LS = 'blocksy.studio.dock'
const load = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') } catch { return {} } }
const save = o => { try { localStorage.setItem(LS, JSON.stringify(o)) } catch {} }

// Crea los paneles acoplados y deja las medidas en variables CSS del contenedor del juego
export function createDocks(g) {
  const st = { l: 250, r: 300, b: 150, ...load() }
  const top = h('div', { id: 'st-top' }), left = h('div', { id: 'st-left', class: 'st-dock' }), right = h('div', { id: 'st-right', class: 'st-dock' }), bottom = h('div', { id: 'st-bottom', class: 'st-dock' })
  const gl = h('i', { class: 'st-grip v', title: '' }), gr = h('i', { class: 'st-grip v' }), gb = h('i', { class: 'st-grip hz' })
  left.append(gl); right.append(gr); bottom.append(gb)
  g.append(top, left, right, bottom)
  g.classList.add('studio-docked')
  const apply = () => { g.style.setProperty('--st-l', st.l + 'px'); g.style.setProperty('--st-r', st.r + 'px'); g.style.setProperty('--st-b', st.b + 'px'); g.style.setProperty('--st-t', top.offsetHeight + 'px') }
  const ro = new ResizeObserver(apply); ro.observe(top); apply()
  const drag = (grip, key, dir, min, max) => grip.addEventListener('pointerdown', e => {
    e.preventDefault(); const start = key === 'b' ? e.clientY : e.clientX, v0 = st[key]; grip.setPointerCapture(e.pointerId)
    const mv = ev => { const d = (key === 'b' ? ev.clientY : ev.clientX) - start; st[key] = Math.max(min, Math.min(max, v0 + d * dir)); apply() }
    const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); save({ l: st.l, r: st.r, b: st.b }) }
    grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up)
  })
  drag(gl, 'l', 1, 180, 520); drag(gr, 'r', -1, 220, 560); drag(gb, 'b', -1, 70, 420)
  const minBottom = px => { if (st.b < px) { st.b = px; apply() } }       // abre más el panel de abajo si se queda corto (no se guarda)
  return { top, left, right, bottom, apply, minBottom, dispose() { ro.disconnect(); for (const e of [top, left, right, bottom]) e.remove(); g.classList.remove('studio-docked'); for (const k of ['--st-l', '--st-r', '--st-b', '--st-t']) g.style.removeProperty(k) } }
}

// Pestañas: tabs = [{ id, label, render }]; render(container) se llama al abrir la pestaña y al pedir paint()
export function tabbed(host, tabs, first) {
  const head = h('div', { class: 'st-tabs' }), body = h('div', { class: 'st-tab-body' }); host.append(head, body)
  let cur = first ?? tabs[0].id
  const btns = {}
  for (const t of tabs) { btns[t.id] = h('button', { type: 'button', class: 'st-tab', text: t.label, onclick: () => set(t.id) }); head.append(btns[t.id]) }
  function paint() { const t = tabs.find(x => x.id === cur); for (const [id, b] of Object.entries(btns)) b.classList.toggle('on', id === cur); body.replaceChildren(); t.render(body) }
  function set(id) { cur = id; paint() }
  paint()
  return { set, paint, get cur() { return cur }, body, head }
}

// Categoría plegable de propiedades (se recuerda cuáles están cerradas)
const CK = 'blocksy.studio.cats'
const closedCats = () => { try { return new Set(JSON.parse(localStorage.getItem(CK) || '[]')) } catch { return new Set() } }
export function category(title, ...rows) {
  const closed = closedCats(), box = h('div', { class: 'st-cat' + (closed.has(title) ? ' closed' : '') })
  const head = h('div', { class: 'st-cat-head', onclick: () => { box.classList.toggle('closed'); const s = closedCats(); box.classList.contains('closed') ? s.add(title) : s.delete(title); try { localStorage.setItem(CK, JSON.stringify([...s])) } catch {} } }, h('span', { class: 'st-caret', text: '▾' }), h('b', { text: title }))
  box.append(head, h('div', { class: 'st-cat-body' }, rows)); return box
}
export const prop = (label, ...ctrl) => h('div', { class: 'st-prop' }, h('span', { class: 'st-prop-name', title: label, text: label }), h('div', { class: 'st-prop-val' }, ctrl))
