// Editor de animaciones del Studio: animaciones de piezas (fotogramas clave que se convierten en un script Lua con tweens)
// y emotes propios del avatar (c1-c3, fotogramas con el ángulo de cada miembro; se guardan en config.emotes).
import { t } from './i18n.js'
import { createPreview, styleFor, setCustomEmotes, POSE_CHANNELS } from './avatar.js'
import { h } from './studio-dock.js'

const BEGIN = '-- BLOCKSY-ANIM-BEGIN (generado por el editor de animaciones: lo reescribe el boton Aplicar)'
const END = '-- BLOCKSY-ANIM-END'
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d)
const r3 = v => +num(v).toFixed(3)

export const poseOf = p => ({ x: r3(p.x), y: r3(p.y), z: r3(p.z), ry: r3(p.ry ?? 0), sx: r3(p.sx ?? 1), sy: r3(p.sy ?? 1), sz: r3(p.sz ?? 1), color: p.color ?? '#a3a2a5', tr: r3(p.transparency ?? 0) })

// Lua de todas las piezas animadas (cada una en su propia tarea). Las claves se ordenan por tiempo y la primera siempre está en t = 0.
export function animLua(parts) {
  const out = []
  for (const p of parts) {
    const an = p.anim; if (!an || !Array.isArray(an.keys) || an.keys.length < 2) continue
    const keys = an.keys.map(k => ({ ...k, t: Math.max(0, num(k.t)) })).sort((a, b) => a.t - b.t); const t0 = keys[0].t
    const K = keys.map(k => `{${r3(k.t - t0)}, Vector3.new(${r3(k.x)}, ${r3(k.y)}, ${r3(k.z)}), ${r3(k.ry)}, Vector3.new(${r3(k.sx)}, ${r3(k.sy)}, ${r3(k.sz)}), Color3.fromHex("${/^#[0-9a-f]{6}$/i.test(k.color) ? k.color : '#a3a2a5'}"), ${r3(k.tr)}}`).join(', ')
    const ease = ['Sine', 'Linear', 'Quad', 'Bounce', 'Back'].includes(an.ease) ? an.ease : 'Sine'
    const back = Math.max(0.05, r3(keys[keys.length - 1].t - keys[keys.length - 2].t))
    out.push(`-- ${p.name}
task.spawn(function()
  local part = workspace:WaitForChild(${JSON.stringify(String(p.name))}, 5); if not part then return end
  local TS = game:GetService("TweenService")
  local K = { ${K} }
  local function goal(k) return { Position = k[2], Orientation = Vector3.new(0, k[3], 0), Size = k[4], Color = k[5], Transparency = k[6] } end
  local function pose(k) for n, v in pairs(goal(k)) do part[n] = v end end
  local function move(k, secs) TS:Create(part, TweenInfo.new(math.max(0.05, secs), Enum.EasingStyle.${ease}, Enum.EasingDirection.InOut), goal(k)):Play(); task.wait(math.max(0.05, secs)) end
  pose(K[1])
  repeat
    for i = 2, #K do move(K[i], K[i][1] - K[i - 1][1]) end
    ${an.loop === false ? '' : `move(K[1], ${back})`}
  until ${an.loop === false ? 'true' : 'false'}
end)`)
  }
  return out.length ? `${BEGIN}\n${out.join('\n')}\n${END}` : ''
}
const REGION = new RegExp(`\\n*${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END}\\n*`)
// Reescribe la zona generada del script. Devuelve false si el juego usa un script JavaScript (solo Lua puede moverse así)
export function applyAnims(game, cfg, parts) {
  const code = animLua(parts), cur = game.script ?? ''
  if (code && cur.trim() && !REGION.test(cur) && cfg.script_lang !== 'lua') return false
  if (code && cfg.script_lang !== 'lua' && !cur.trim()) cfg.script_lang = 'lua'
  const rest = cur.replace(REGION, '\n').replace(/\n{3,}/g, '\n\n').trimEnd()
  game.script = code ? (rest ? rest + '\n\n' : '') + code + '\n' : (rest ? rest + '\n' : '')
  return true
}

const field = (label, value, onInput, o = {}) => h('label', { class: 'an-f' }, h('span', { text: label }), h('input', { type: o.type ?? 'number', step: o.step ?? 0.1, min: o.min, max: o.max, value, oninput: e => onInput(o.type === 'color' ? e.target.value : e.target.valueAsNumber) }))

export function buildAnimator(c, env) {
  const { parts, cfg, game, getSel, refreshParts, showTitle, rbx, refreshEmotes } = env
  let mode = env.mode ?? 'parts', stopPrev = null, pv = null
  const stopPreview = () => { stopPrev?.(); stopPrev = null }
  const killPv = () => { pv?.destroy(); pv = null }

  function partsView(box) {
    const i = getSel(), p = parts[i]
    if (!p) return box.append(h('small', { class: 'muted', text: t('an_pick') }))
    const an = p.anim
    const head = h('div', { class: 'an-head' }, h('b', { text: p.name }), an ? h('small', { class: 'muted', text: t('an_keys_n', { n: an.keys.length }) }) : null)
    if (!an) {
      return box.append(head, h('p', { class: 'muted', text: t('an_intro') }),
        h('button', { type: 'button', class: 'btn primary', text: t('an_new'), onclick: () => { const a = poseOf(p); p.anim = { loop: true, ease: 'Sine', keys: [{ t: 0, ...a }, { t: 2, ...a, y: r3(a.y + 3) }] }; redraw() } }))
    }
    const rows = an.keys.map((k, n) => h('div', { class: 'an-key' },
      h('div', { class: 'an-key-h' }, h('b', { text: '#' + (n + 1) }), field(t('an_time'), k.t, v => { k.t = num(v) }, { min: 0, step: 0.1 }),
        h('button', { type: 'button', class: 'btn tiny', text: t('an_capture'), title: t('an_capture_d'), onclick: () => { Object.assign(k, poseOf(p)); redraw() } }),
        n > 0 && n < an.keys.length ? h('button', { type: 'button', class: 'btn tiny', text: '×', onclick: () => { if (an.keys.length > 2) { an.keys.splice(n, 1); redraw() } } }) : null),
      h('div', { class: 'an-grid' }, ...[['x', 'X'], ['y', 'Y'], ['z', 'Z'], ['ry', t('an_yaw')], ['sx', 'W'], ['sy', 'H'], ['sz', 'D']].map(([f, l]) => field(l, k[f], v => { k[f] = num(v) }, { step: f === 'ry' ? 5 : 0.5 })),
        field(t('an_color'), k.color, v => { k.color = v }, { type: 'color' }), field(t('an_transp'), k.tr, v => { k.tr = Math.min(1, Math.max(0, num(v))) }, { min: 0, max: 1, step: 0.1 }))))
    const ease = h('select', { onchange: e => { an.ease = e.target.value } }, ['Sine', 'Linear', 'Quad', 'Bounce', 'Back'].map(x => h('option', { value: x, text: x, selected: (an.ease ?? 'Sine') === x })))
    box.append(head, ...rows,
      h('div', { class: 'row-btns' },
        h('button', { type: 'button', class: 'btn tiny', text: t('an_add_key'), onclick: () => { const last = an.keys[an.keys.length - 1]; an.keys.push({ ...poseOf(p), t: r3(last.t + 1) }); redraw() } }),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: an.loop !== false, onchange: e => { an.loop = e.target.checked } }), h('span', { text: t('an_loop') })), ease),
      h('div', { class: 'row-btns' },
        h('button', { type: 'button', class: 'btn', text: t('an_preview'), onclick: () => preview(p, an) }),
        h('button', { type: 'button', class: 'btn primary', text: t('an_apply'), onclick: () => apply() }),
        h('button', { type: 'button', class: 'btn tiny danger', text: t('an_remove'), onclick: () => { delete p.anim; apply(true); redraw() } })),
      h('small', { class: 'muted', text: t('an_note') }))
  }
  function apply(silent) {
    if (!applyAnims(game, cfg, parts)) return showTitle(t('an_need_lua'), 3200)
    if (!silent) showTitle(t('an_applied'), 1800)
    env.onScriptChanged?.()
  }
  // vista previa: mueve la malla con las claves (posición, giro y tamaño); al terminar se restaura la pieza
  function preview(p, an) {
    stopPreview(); const i = getSel(), o = rbx.partAt(i); if (!o?.mesh) return
    const m = o.mesh, base = { pos: m.position.clone(), ry: m.rotation.y, sc: m.scale.clone() }, k0 = poseOf(p)
    const keys = [...an.keys].sort((a, b) => a.t - b.t), end = keys[keys.length - 1].t, back = Math.max(0.2, end - (keys[keys.length - 2]?.t ?? 0))
    const pts = [...keys.map(k => ({ ...k, t: k.t - keys[0].t })), { ...keys[0], t: end - keys[0].t + back }], dur = pts[pts.length - 1].t
    let raf = 0, t0 = performance.now(), alive = true
    const tick = now => {
      if (!alive) return; raf = requestAnimationFrame(tick)
      const tm = ((now - t0) / 1000) % dur; let n = 1; while (n < pts.length - 1 && pts[n].t < tm) n++
      const a = pts[n - 1], b = pts[n], f = b.t > a.t ? (tm - a.t) / (b.t - a.t) : 1, e = (1 - Math.cos(Math.min(1, Math.max(0, f)) * Math.PI)) / 2, L = (u, v) => u + (v - u) * e
      m.position.set(base.pos.x + L(a.x, b.x) - k0.x, base.pos.y + L(a.y, b.y) - k0.y, base.pos.z + L(a.z, b.z) - k0.z)
      m.rotation.y = base.ry + (L(a.ry, b.ry) - k0.ry) * Math.PI / 180
      m.scale.set(base.sc.x * L(a.sx, b.sx) / (k0.sx || 1), base.sc.y * L(a.sy, b.sy) / (k0.sy || 1), base.sc.z * L(a.sz, b.sz) / (k0.sz || 1))
    }
    raf = requestAnimationFrame(tick)
    stopPrev = () => { alive = false; cancelAnimationFrame(raf); refreshParts() }
    showTitle(t('an_previewing'), 1500)
  }

  function emotesView(box) {
    const all = cfg.emotes ??= {}
    const sel = env.emoteId ?? 'c1'
    const ids = ['c1', 'c2', 'c3']
    const tabs = h('div', { class: 'row-btns' }, ids.map(id => h('button', { type: 'button', class: `chip ${id === sel ? 'on' : ''}`, text: all[id]?.name ?? t('an_slot', { n: id.slice(1) }), onclick: () => { env.emoteId = id; redraw() } })))
    const e = all[sel]
    if (!e) return box.append(tabs, h('p', { class: 'muted', text: t('an_emote_intro') }), h('button', { type: 'button', class: 'btn primary', text: t('an_new'), onclick: () => {
      all[sel] = { name: t('an_slot', { n: sel.slice(1) }), back: 0.4, keys: [{ t: 0, ...Object.fromEntries(POSE_CHANNELS.map(ch => [ch, 0])) }, { t: 0.6, ...Object.fromEntries(POSE_CHANNELS.map(ch => [ch, 0])), armRz: 2.6 }] }; changed(); redraw() } }))
    const canvas = h('canvas', { class: 'an-avatar' })
    const rows = e.keys.map((k, n) => h('div', { class: 'an-key' },
      h('div', { class: 'an-key-h' }, h('b', { text: '#' + (n + 1) }), field(t('an_time'), k.t, v => { k.t = Math.max(0, num(v)); changed() }, { min: 0, step: 0.1 }), e.keys.length > 2 ? h('button', { type: 'button', class: 'btn tiny', text: '×', onclick: () => { e.keys.splice(n, 1); changed(); redraw() } }) : null),
      h('div', { class: 'an-grid' }, POSE_CHANNELS.map(ch => field(t('an_ch_' + ch), k[ch] ?? 0, v => { k[ch] = num(v); changed() }, { step: ch === 'bodyY' ? 0.05 : 0.2, min: ch === 'bodyY' ? -0.5 : -6, max: ch === 'bodyY' ? 0.5 : 6 })))))
    box.append(tabs, h('div', { class: 'an-emote' }, h('div', {}, field(t('an_name'), e.name, v => v, { type: 'text' }), ...rows,
      h('div', { class: 'row-btns' }, h('button', { type: 'button', class: 'btn tiny', text: t('an_add_key'), onclick: () => { const last = e.keys[e.keys.length - 1]; e.keys.push({ ...last, t: r3(last.t + 0.6) }); changed(); redraw() } }),
        h('button', { type: 'button', class: 'btn tiny danger', text: t('an_remove'), onclick: () => { delete all[sel]; changed(); redraw() } })), h('small', { class: 'muted', text: t('an_emote_note') })), canvas))
    box.querySelector('input[type=text]').oninput = ev => { e.name = ev.target.value.slice(0, 14); changed() }
    setCustomEmotes(all); pv = createPreview(canvas, env.style?.() ?? styleFor('Blocksy', '#4da6ff')); pv.setSpin(false); pv.setAnim(sel)
  }
  function changed() { setCustomEmotes(cfg.emotes); refreshEmotes?.(); if (!Object.keys(cfg.emotes ?? {}).length) delete cfg.emotes }

  function redraw() {
    stopPreview(); killPv(); const top = c.scrollTop; c.replaceChildren()
    const tabs = h('div', { class: 'row-btns an-tabs' }, ['parts', 'emotes'].map(m => h('button', { type: 'button', class: `chip ${m === mode ? 'on' : ''}`, text: t('an_' + m), onclick: () => { mode = m; env.mode = m; redraw() } })))
    const box = h('div', { class: 'an-body st-pad' }); c.append(tabs, box)
    mode === 'parts' ? partsView(box) : emotesView(box)
    c.scrollTop = top
  }
  redraw()
  return { redraw, dispose() { stopPreview(); killPv() } }
}
