import * as auth from './auth.js'
import * as api from './api.js'
import { settings, saveSettings, lastPlayed } from './settings.js'

const $ = id => document.getElementById(id)
export function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v
    else if (k === 'style') e.style.cssText = v
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else if (k === 'text') e.textContent = v
    else e.setAttribute(k, v)
  }
  for (const k of kids.flat()) if (k != null) e.append(k)
  return e
}
export function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.remove('hidden')
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 2800)
}
const hueOf = id => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360; return h }
const avatar = (color, online) => {
  const a = el('span', { class: 'avatar', style: `--c:${color}` })
  if (online != null) a.append(el('span', { class: `dot ${online ? 'on' : ''}` }))
  return a
}

// ---------- tarjetas de juego ----------
function gameCard(g, counts, onOpen) {
  const n = counts[g.id] ?? 0
  const thumb = el('div', { class: 'thumb', style: `--h:${g.hue ?? hueOf(g.id)}` }, el('div', { class: 'cube' }),
    n ? el('span', { class: 'live', text: `● ${n} jugando` }) : null)
  return el('div', { class: 'gcard', onclick: () => onOpen(g) }, thumb,
    el('div', { class: 'gname', text: g.name }), el('div', { class: 'gmeta', text: `por ${g.owner_name || 'Blocksy'}` }))
}
const grid = (games, counts, onOpen) => games.length
  ? el('div', { class: 'grid' }, games.map(g => gameCard(g, counts, onOpen)))
  : el('div', { class: 'empty', text: 'No hay juegos todavía.' })

export function openGameModal(g, counts, onPlay) {
  const m = $('modal'), card = $('modal-card'), n = counts[g.id] ?? 0
  card.replaceChildren(el('div', { class: 'detail' },
    el('div', { class: 'thumb', style: `--h:${g.hue ?? hueOf(g.id)}` }, el('div', { class: 'cube' })),
    el('div', {}, el('h2', { text: g.name }),
      el('small', { style: 'color:var(--muted)', text: `por ${g.owner_name || 'Blocksy'}` }),
      el('div', { class: 'stats' },
        el('div', {}, el('b', { text: String(n) }), el('small', { text: 'jugando' })),
        el('div', {}, el('b', { text: String(g.max_players) }), el('small', { text: 'máx. jugadores' })),
        el('div', {}, el('b', { text: 'Web + 3DS' }), el('small', { text: 'plataformas' }))),
      el('p', { text: g.description || 'Sin descripción.' }),
      el('button', { class: 'btn primary wide', text: '▶  Jugar', onclick: () => { closeModal(); onPlay(g) } }),
      el('button', { class: 'btn wide', text: 'Cerrar', onclick: closeModal }))))
  m.classList.remove('hidden')
}
export const closeModal = () => $('modal').classList.add('hidden')

// ---------- páginas ----------
// ctx = { profile, play(game), go(hash), refreshProfile() }
export const pages = {
  async home(root, ctx) {
    const [games, counts, friends] = await Promise.all([api.listGames(), api.playerCounts(), auth.listFriends(ctx.profile.id)])
    const open = g => openGameModal(g, counts, ctx.play)
    const popular = [...games].sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))
    const last = games.find(g => g.id === lastPlayed())

    root.replaceChildren(
      el('div', { class: 'hero' }, avatar(ctx.profile.avatar_color), el('h1', { text: `¡Hola, ${ctx.profile.username}!` })),
      el('div', { class: 'section' }, el('h2', { text: `Amigos (${friends.length})` }), el('a', { href: '#friends', text: 'Ver todo' })),
      friends.length
        ? el('div', { class: 'row-scroll' }, friends.map(f => el('div', { class: 'friend', onclick: () => ctx.go('friends') },
            avatar(f.avatar_color, f.is_online), el('b', { text: f.username }),
            el('small', { text: f.is_online ? (f.current_game ? 'En un juego' : 'Online') : 'Desconectado' }))))
        : el('div', { class: 'empty', text: 'Añade amigos desde la sección Amigos para verlos aquí.' }),
      last ? [el('div', { class: 'section' }, el('h2', { text: 'Continuar' })), grid([last], counts, open)] : null,
      el('div', { class: 'section' }, el('h2', { text: 'Populares ahora' }), el('a', { href: '#discover', text: 'Ver todo' })),
      grid(popular.slice(0, 12), counts, open),
      el('div', { class: 'section' }, el('h2', { text: 'Nuevos' })),
      grid([...games].reverse().slice(0, 12), counts, open))
  },

  async discover(root, ctx, query = '') {
    const [games, counts] = await Promise.all([api.listGames(), api.playerCounts()])
    const input = el('input', { placeholder: 'Buscar juegos...', value: query })
    const out = el('div')
    const draw = () => {
      const q = input.value.trim().toLowerCase()
      out.replaceChildren(grid(games.filter(g => !q || g.name.toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q)), counts, g => openGameModal(g, counts, ctx.play)))
    }
    input.oninput = draw; draw()
    root.replaceChildren(el('h1', { class: 'page-title', text: 'Descubrir' }), el('div', { style: 'margin-bottom:18px' }, input), out)
  },

  async avatar(root, ctx) {
    const colors = ['#4da6ff', '#ff9f43', '#2ecc71', '#e74c3c', '#9b59b6', '#f1c40f', '#1abc9c', '#ff6b9d', '#ecf0f1', '#95a5a6']
    let sel = ctx.profile.avatar_color
    const body = el('div', { class: 'b' }), preview = el('div', { class: 'preview' }, el('div', { class: 'blocky', style: `--c:${sel}` }, el('div', { class: 'h' }), body, el('div', { class: 'l' })))
    const custom = el('input', { type: 'color', value: sel, style: 'width:56px;height:40px;border:0;background:none' })
    const sw = el('div', { class: 'swatches' })
    const paint = () => {
      preview.firstChild.style.setProperty('--c', sel); custom.value = sel
      sw.replaceChildren(...colors.map(c => el('div', { class: `swatch ${c === sel ? 'sel' : ''}`, style: `--c:${c}`, onclick: () => { sel = c; paint() } })), custom)
    }
    custom.oninput = () => { sel = custom.value; preview.firstChild.style.setProperty('--c', sel) }
    paint()
    root.replaceChildren(el('h1', { class: 'page-title', text: 'Avatar' }),
      el('div', { class: 'panel avatar-edit' }, preview, el('div', {},
        el('h3', { text: ctx.profile.username }), el('p', { style: 'color:var(--muted)', text: 'Elige el color de tu personaje. Se verá igual en la web y en la 3DS.' }),
        sw, el('button', { class: 'btn primary', text: 'Guardar', onclick: async () => {
          try { await auth.saveColor(ctx.profile.id, sel); await ctx.refreshProfile(); toast('Avatar guardado ✔') } catch (e) { toast(e.message) } } }))))
  },

  async friends(root, ctx) {
    const input = el('input', { placeholder: 'Buscar jugadores por nombre...' })
    const results = el('div'), mine = el('div', { class: 'panel' })
    let friendIds = new Set()
    const personRow = (p, isFriend) => el('div', { class: 'person' }, avatar(p.avatar_color, p.is_online),
      el('div', { class: 'grow' }, el('b', { text: p.username }), el('small', { text: p.is_online ? (p.current_game ? 'En un juego' : 'Online') : 'Desconectado' })),
      p.id === ctx.profile.id ? null : isFriend
        ? el('button', { class: 'btn', text: 'Quitar', onclick: async () => { await auth.removeFriend(ctx.profile.id, p.id); load() } })
        : el('button', { class: 'btn blue', text: 'Añadir', onclick: async () => { await auth.addFriend(ctx.profile.id, p.id); toast(`${p.username} añadido`); load() } }))
    async function load() {
      const friends = await auth.listFriends(ctx.profile.id); friendIds = new Set(friends.map(f => f.id))
      mine.replaceChildren(el('h3', { text: `Mis amigos (${friends.length})`, style: 'margin-bottom:6px' }),
        friends.length ? friends.map(f => personRow(f, true)) : el('div', { class: 'empty', text: 'Aún no tienes amigos.' }))
      const people = await auth.searchPeople(input.value.trim())
      results.replaceChildren(el('h3', { text: input.value ? 'Resultados' : 'Jugadores', style: 'margin:22px 0 6px' }),
        el('div', { class: 'panel' }, people.filter(p => !friendIds.has(p.id)).map(p => personRow(p, false))))
    }
    let t; input.oninput = () => { clearTimeout(t); t = setTimeout(load, 250) }
    root.replaceChildren(el('h1', { class: 'page-title', text: 'Amigos' }), el('div', { style: 'margin-bottom:16px' }, input), mine, results)
    load()
  },

  async create(root, ctx) {
    const name = el('input', { placeholder: 'Nombre del juego', minlength: 3, maxlength: 40 })
    const desc = el('input', { placeholder: 'Descripción (opcional)', maxlength: 200 })
    const hue = el('input', { type: 'range', min: 0, max: 359, value: Math.floor(Math.random() * 360) })
    const prev = el('div', { class: 'thumb', style: 'width:120px;--h:0' }, el('div', { class: 'cube' }))
    const setHue = () => prev.style.setProperty('--h', hue.value); hue.oninput = setHue; setHue()
    const mine = el('div')
    async function load() {
      const games = (await api.listGames()).filter(g => g.owner_id === ctx.profile.id)
      mine.replaceChildren(games.length ? games.map(g => el('div', { class: 'person' },
        el('div', { class: 'thumb', style: `width:56px;--h:${g.hue}` }, el('div', { class: 'cube' })),
        el('div', { class: 'grow' }, el('b', { text: g.name }), el('small', { text: g.description })),
        el('button', { class: 'btn', text: 'Jugar', onclick: () => ctx.play(g) }),
        el('button', { class: 'btn danger', text: 'Borrar', onclick: async () => { if (confirm(`¿Borrar "${g.name}"?`)) { await api.deleteGameRow(g.id); load() } } })))
        : el('div', { class: 'empty', text: 'Todavía no has creado ningún juego.' }))
    }
    root.replaceChildren(el('h1', { class: 'page-title', text: 'Crear' }),
      el('form', { class: 'panel', onsubmit: async e => {
        e.preventDefault()
        try { await api.createGameRow(name.value.trim(), desc.value.trim(), Number(hue.value)); name.value = desc.value = ''; toast('Juego creado ✔'); load() } catch (er) { toast(er.message) }
      } }, el('h3', { text: 'Nuevo mundo', style: 'margin-bottom:12px' }),
        el('div', { class: 'form-row' }, name, desc),
        el('div', { class: 'form-row', style: 'align-items:center' }, prev, el('label', { class: 'field' }, 'Color de portada', hue)),
        el('button', { class: 'btn primary', text: 'Crear juego' })),
      el('div', { class: 'section' }, el('h2', { text: 'Mis juegos' })), el('div', { class: 'panel' }, mine))
    load()
  },

  settings(root) {
    const row = (label, input) => el('label', { class: 'field' }, label, input)
    const sens = el('input', { type: 'range', min: 0.3, max: 2.5, step: 0.1, value: settings.sensitivity })
    const dist = el('input', { type: 'range', min: 30, max: 200, step: 10, value: settings.viewDistance })
    const names = el('input', { type: 'checkbox' }); names.checked = settings.names
    const save = () => { settings.sensitivity = +sens.value; settings.viewDistance = +dist.value; settings.names = names.checked; saveSettings(); toast('Guardado') }
    sens.onchange = dist.onchange = names.onchange = save
    root.replaceChildren(el('h1', { class: 'page-title', text: 'Ajustes' }),
      el('div', { class: 'panel', style: 'max-width:520px' }, row('Sensibilidad de cámara', sens), row('Distancia de visión', dist),
        el('label', { class: 'field check' }, names, 'Mostrar nombres sobre los jugadores')))
  },
}
