// Editor de código del juego (JavaScript o Lua) usado en la pestaña "Código" y en el Studio
import { el, setKids, closeModal } from './pages.js'
import { t } from './i18n.js'
import { icon } from './icons.js'
import { checkSyntax, checkLua, EXAMPLES, EXAMPLES_LUA } from './script.js'

export function codeEditor(game) {
  game.config = game.config ?? {}
  const lang = () => (game.config.script_lang === 'lua' ? 'lua' : 'js')
  const ta = el('textarea', { class: 'code', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off', wrap: 'off' }); ta.value = game.script ?? ''
  const gut = el('div', { class: 'gutter' }), info = el('small', { style: 'color:var(--muted)' }), res = el('p', { class: 'msg', style: 'text-align:left' })
  const lines = () => { const n = ta.value.split('\n').length; gut.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); info.textContent = `${t('ed_lines', { n })} · ${ta.value.length}/20000` }
  ta.oninput = () => { game.script = ta.value; lines() }
  ta.onscroll = () => (gut.scrollTop = ta.scrollTop)
  ta.onkeydown = e => { if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); ta.oninput() } }
  lines()
  const langSel = el('select', { onchange: e => { game.config.script_lang = e.target.value; paintEx(); help.textContent = t(lang() === 'lua' ? 'ed_script_help_lua' : 'ed_script_help') } }, el('option', { value: 'js', text: 'JavaScript', selected: lang() === 'js' }), el('option', { value: 'lua', text: 'Lua', selected: lang() === 'lua' }))
  const exSel = el('select', { onchange: e => { const src = lang() === 'lua' ? EXAMPLES_LUA : EXAMPLES; if (e.target.value) { ta.value = (ta.value ? ta.value + '\n\n' : '') + src[e.target.value]; ta.oninput(); e.target.value = '' } } })
  const paintEx = () => setKids(exSel, el('option', { value: '', text: t('ed_examples') }), Object.keys(lang() === 'lua' ? EXAMPLES_LUA : EXAMPLES).map(k => el('option', { value: k, text: k })))
  paintEx()
  const help = el('p', { style: 'color:var(--muted);margin-top:0;font-size:14px', text: t(lang() === 'lua' ? 'ed_script_help_lua' : 'ed_script_help') })
  const check = el('button', { type: 'button', class: 'btn', html: icon('check', 16) + ' ' + t('ed_check'), onclick: async () => {
    const er = lang() === 'lua' ? await checkLua(ta.value).catch(e => e.message) : checkSyntax(ta.value)
    res.className = 'msg ' + (er ? 'err' : 'ok'); res.textContent = er || t('ed_ok') } })
  return el('div', {}, help, el('div', { class: 'form-row', style: 'align-items:center;margin-bottom:8px' }, el('label', { class: 'field', style: 'margin:0' }, t('st_lang'), langSel)),
    el('details', { class: 'api-ref' }, el('summary', { text: t('ed_api_title') }), el('div', { html: t('ed_api') })),
    el('div', { class: 'code-wrap' }, gut, ta), el('div', { class: 'form-row', style: 'align-items:center;margin-top:8px' }, info, exSel, check), res)
}

// Ventana de código dentro del Studio (usa el modal de la app)
export function openScriptModal(game) {
  return new Promise(resolve => {
    const card = document.getElementById('modal-card')
    setKids(card, el('div', { class: 'detail-col' }, el('h2', { text: t('ed_script') }), codeEditor(game), el('button', { class: 'btn primary wide', text: t('close'), onclick: () => { closeModal(); resolve() } })))
    document.getElementById('modal').classList.remove('hidden')
  })
}
