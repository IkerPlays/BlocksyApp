// Editor de la página de un juego: visibilidad (publicar), textos, etiquetas, icono, banner y capturas.
// Se usa en el Studio y en la pestaña "General" del editor de juegos.
import { el, setKids, toast } from './pages.js'
import { t } from './i18n.js'
import { VISIBILITY, visOf, isImg, fileToDataURL, MEDIA } from './media.js'

export function gameInfoEditor(game, { capture, onChange } = {}) {
  const c = game.config = game.config ?? {}
  const changed = () => { onChange?.(); paint() }
  const root = el('div', { class: 'game-edit' })
  const imgBtns = (kind, get, set) => {
    const [w, h] = MEDIA[kind]
    const file = el('input', { type: 'file', accept: 'image/*', style: 'display:none' })
    file.onchange = async () => { try { set(await fileToDataURL(file.files[0], w, h)); changed() } catch { toast(t('img_bad')) } finally { file.value = '' } }
    const url = el('input', { type: 'url', placeholder: 'https://…', class: 'ge-url' })
    url.onchange = () => { const v = url.value.trim(); if (!v) return; if (!isImg(v)) return toast(t('img_bad_url')); set(v); changed() }
    return [file, el('button', { type: 'button', class: 'btn tiny', text: t('img_upload'), onclick: () => file.click() }),
      capture ? el('button', { type: 'button', class: 'btn tiny', text: t('img_capture'), onclick: async () => { const d = await capture(w, h); if (d) { set(d); changed() } else toast(t('st_thumb_fail')) } }) : null, url]
  }
  const media = (kind, label, get, set, remove) => {
    const v = get()
    return el('div', { class: 'ge-media' }, el('b', { text: label }),
      el('div', { class: `ge-prev ${kind}`, style: v ? `background-image:url(${v})` : '' }, v ? null : el('small', { text: t('img_none') })),
      el('div', { class: 'row-btns' }, ...imgBtns(kind, get, set), v ? el('button', { type: 'button', class: 'btn tiny danger', text: t('img_remove'), onclick: () => { remove(); changed() } }) : null))
  }
  function paint() {
    const vis = visOf(game)
    const name = el('input', { value: game.name ?? '', maxlength: 40 }); name.oninput = () => { game.name = name.value; onChange?.() }
    const desc = el('input', { value: game.description ?? '', maxlength: 200, placeholder: t('game_desc') }); desc.oninput = () => { game.description = desc.value; onChange?.() }
    const about = el('textarea', { class: 'bio-edit', rows: 5, maxlength: 1000, placeholder: t('ge_about_ph') }); about.value = c.about ?? ''; about.oninput = () => { c.about = about.value; onChange?.() }
    const tags = el('input', { value: (c.tags ?? []).join(', '), maxlength: 60, placeholder: t('ed_tags_ph') }); tags.oninput = () => { c.tags = tags.value.split(',').map(x => x.trim().toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean).slice(0, 5); onChange?.() }
    const shots = Array.isArray(c.shots) ? c.shots : (c.shots = [])
    const setVis = v => { c.visibility = v; delete c.draft; changed() }
    setKids(root,
      el('div', { class: 'section-s', text: t('ge_visibility') }),
      el('div', { class: 'mode-pick' }, VISIBILITY.map(v => el('button', { type: 'button', class: `mode-card ${vis === v ? 'on' : ''}`, onclick: () => setVis(v) }, el('b', { text: t('vis_' + v) }), el('small', { text: t('vis_' + v + '_d') })))),
      vis !== 'public' ? el('button', { type: 'button', class: 'btn primary', text: t('ge_publish'), onclick: () => { setVis('public'); toast(t('ge_published')) } }) : el('small', { class: 'muted', text: t('ge_is_public') }),
      el('p', { class: 'muted', style: 'font-size:12px', text: t('vis_note') }),
      el('label', { class: 'field' }, t('game_name'), name), el('label', { class: 'field' }, t('game_desc'), desc), el('label', { class: 'field' }, t('ge_about'), about), el('label', { class: 'field' }, t('ed_tags'), tags),
      media('icon', t('ge_icon'), () => c.icon, v => (c.icon = v), () => delete c.icon),
      media('banner', t('ge_banner'), () => c.banner, v => (c.banner = v), () => delete c.banner),
      el('div', { class: 'ge-media' }, el('b', { text: `${t('ge_shots')} (${shots.length}/4)` }),
        el('div', { class: 'ge-shots' }, shots.map((s, i) => el('div', { class: 'ge-prev shot', style: `background-image:url(${s})` }, el('button', { type: 'button', class: 'btn tiny danger', text: '×', onclick: () => { shots.splice(i, 1); changed() } })))),
        shots.length < 4 ? el('div', { class: 'row-btns' }, ...imgBtns('shot', () => null, v => { if (shots.length < 4) shots.push(v) })) : null))
  }
  paint(); return root
}
