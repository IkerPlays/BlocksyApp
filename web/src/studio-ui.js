// Editor de código del juego (JavaScript o Lua) usado en la pestaña "Código" y en el Studio
import { el, setKids, closeModal } from './pages.js'
import { t } from './i18n.js'
import { icon } from './icons.js'
import { checkSyntax, checkLua, EXAMPLES, EXAMPLES_LUA } from './script.js'
import { scriptConsole, errorLine } from './script-console.js'

// Plantillas de código (Lua estilo Roblox) y palabras de la API para el autocompletado
export const SNIPPETS = {
  'PlayerAdded': 'game.Players.PlayerAdded:Connect(function(player)\n  print("Hola " .. player.Name)\nend)\n',
  'Touched': 'local part = workspace:FindFirstChild("Part1")\nif part then\n  part.Touched:Connect(function(hit)\n    print("tocado")\n  end)\nend\n',
  'Loop task.wait': 'while true do\n  task.wait(1)\n  print("tick")\nend\n',
  'Tween': 'local TweenService = game:GetService("TweenService")\nlocal tween = TweenService:Create(part, TweenInfo.new(1), {Position = Vector3.new(0, 10, 0)})\ntween:Play()\n',
  'RemoteEvent': 'local ev = Instance.new("RemoteEvent")\nev.Name = "Evento"\nev.Parent = game.ReplicatedStorage\nev.OnClientEvent:Connect(function(...)\n  print(...)\nend)\nev:FireAllClients("hola")\n',
  'DataStore': 'local store = game:GetService("DataStoreService"):GetDataStore("Datos")\nlocal puntos = store:GetAsync("puntos") or 0\nstore:SetAsync("puntos", puntos + 1)\n',
  'ClickDetector': 'local d = Instance.new("ClickDetector")\nd.Parent = part\nd.MouseClick:Connect(function(player)\n  print(player.Name)\nend)\n',
  'Tool (herramienta)': 'local me = game.Players.LocalPlayer\nlocal tool = Instance.new("Tool")\ntool.Name = "Bengala"\ntool.Parent = me.Backpack\ntool.Activated:Connect(function()\n  game.sound("laser")\n  print("usada")\nend)\n',
  'Animación de pieza': 'local part = workspace:WaitForChild("Part1")\nlocal TS = game:GetService("TweenService")\nwhile true do\n  TS:Create(part, TweenInfo.new(1.5, Enum.EasingStyle.Sine), {Position = part.Position + Vector3.new(0, 4, 0)}):Play()\n  task.wait(1.5)\n  TS:Create(part, TweenInfo.new(1.5, Enum.EasingStyle.Sine), {Position = part.Position - Vector3.new(0, 4, 0)}):Play()\n  task.wait(1.5)\nend\n',
  'Comando de chat': 'game.Players.PlayerAdded:Connect(function(p)\n  p.Chatted:Connect(function(msg)\n    if msg == "/hola" then print("hola!") end\n  end)\nend)\n',
}
const API_WORDS = ['game', 'workspace', 'Instance.new', 'Vector3.new', 'Color3.fromRGB', 'Color3.new', 'CFrame.new', 'task.wait', 'task.spawn', 'task.delay', 'print', 'wait', 'game:GetService', 'Players', 'PlayerAdded', 'PlayerRemoving', 'Humanoid', 'Health', 'MaxHealth', 'WalkSpeed', 'JumpPower', 'Touched', 'TouchEnded', 'MouseClick', 'ClickDetector', 'ProximityPrompt', 'Triggered', 'TweenService', 'TweenInfo.new', 'RunService', 'Heartbeat', 'DataStoreService', 'GetDataStore', 'GetAsync', 'SetAsync', 'UpdateAsync', 'IncrementAsync', 'RemoteEvent', 'FireServer', 'FireClient', 'FireAllClients', 'OnServerEvent', 'OnClientEvent', 'Lighting', 'ClockTime', 'FogEnd', 'Debris', 'AddItem', 'Destroy', 'Clone', 'FindFirstChild', 'WaitForChild', 'GetChildren', 'Connect', 'Anchored', 'CanCollide', 'Transparency', 'Material', 'Enum.Material', 'Position', 'Size', 'Color', 'Parent', 'Name', 'leaderstats', 'IntValue', 'StringValue', 'Teams', 'Team', 'BrickColor', 'Sound', 'Play', 'BillboardGui', 'TextLabel', 'ScreenGui', 'Frame', 'TextButton', 'function', 'local', 'return', 'while', 'for', 'if', 'then', 'else', 'elseif', 'end', 'true', 'false', 'nil', 'and', 'or', 'not', 'math.random', 'math.floor', 'math.sin', 'string.format', 'table.insert', 'table.remove', 'ipairs', 'pairs', 'tostring', 'tonumber']

export function codeEditor(game) {
  game.config = game.config ?? {}
  const lang = () => (game.config.script_lang === 'lua' ? 'lua' : 'js')
  const ta = el('textarea', { class: 'code', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off', wrap: 'off' }); ta.value = game.script ?? ''
  const gut = el('div', { class: 'gutter' }), info = el('small', { style: 'color:var(--muted)' }), res = el('p', { class: 'msg', style: 'text-align:left' })
  const lines = () => { const n = ta.value.split('\n').length; gut.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); info.textContent = `${t('ed_lines', { n })} · ${ta.value.length}/20000` }
  ta.oninput = () => { game.script = ta.value; lines() }
  ta.onscroll = () => (gut.scrollTop = ta.scrollTop)
  // autocompletado: sugerencias (API + palabras del propio script) en una barra; Tab acepta la primera
  const sugg = el('div', { class: 'code-sugg hidden' })
  let cands = [], candLen = 0
  const wordAt = () => { const p = ta.selectionStart; const m = /[\w.:]+$/.exec(ta.value.slice(0, p)); return m ? m[0] : '' }
  function acceptSuggestion(w) { ta.setRangeText(w, ta.selectionStart - candLen, ta.selectionStart, 'end'); sugg.classList.add('hidden'); ta.oninput(); ta.focus() }
  function updateSugg() {
    const cur = wordAt(); if (lang() !== 'lua' || cur.length < 2) { cands = []; return sugg.classList.add('hidden') }
    const own = [...new Set(ta.value.match(/[A-Za-z_]\w{3,}/g) ?? [])], pool = [...API_WORDS, ...own]
    const seg = cur.split(/[.:]/).pop(), useSeg = seg.length >= 2 && seg !== cur            // tras un punto o dos puntos se completa solo el último trozo
    const lc = (useSeg ? seg : cur).toLowerCase(); candLen = useSeg ? seg.length : cur.length
    cands = [...new Set(pool.filter(w => w !== (useSeg ? seg : cur) && w.toLowerCase().startsWith(lc) && (!useSeg || !/[.:]/.test(w))))].slice(0, 7)
    if (!cands.length) return sugg.classList.add('hidden')
    setKids(sugg, cands.map((w, i) => el('button', { type: 'button', class: 'chip' + (i === 0 ? ' on' : ''), text: w, onmousedown: e => { e.preventDefault(); acceptSuggestion(w) } })), el('small', { text: 'Tab' }))
    sugg.classList.remove('hidden')
  }
  // buscar y reemplazar (Ctrl+F)
  const fInp = el('input', { placeholder: t('ed_find') }), rInp = el('input', { placeholder: t('ed_replace') }), fInfo = el('small', {})
  const findBar = el('div', { class: 'find-bar hidden' }, fInp, rInp,
    el('button', { type: 'button', class: 'btn tiny', text: t('ed_find_next'), onclick: () => findNext() }),
    el('button', { type: 'button', class: 'btn tiny', text: t('ed_replace_one'), onclick: () => { const s = ta.value.slice(ta.selectionStart, ta.selectionEnd); if (fInp.value && s.toLowerCase() === fInp.value.toLowerCase()) { ta.setRangeText(rInp.value, ta.selectionStart, ta.selectionEnd, 'end'); ta.oninput() } findNext() } }),
    el('button', { type: 'button', class: 'btn tiny', text: t('ed_replace_all'), onclick: () => { if (!fInp.value) return; const re = new RegExp(fInp.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); let n = 0; ta.value = ta.value.replace(re, () => (n++, rInp.value)); ta.oninput(); fInfo.textContent = t('ed_replaced_n', { n }) } }), fInfo)
  function findNext() {
    const q = fInp.value.toLowerCase(); if (!q) return
    const hay = ta.value.toLowerCase(); let i = hay.indexOf(q, ta.selectionEnd); if (i < 0) i = hay.indexOf(q)
    if (i < 0) { fInfo.textContent = t('ed_not_found'); return }
    ta.focus(); ta.setSelectionRange(i, i + q.length); fInfo.textContent = ''
    const line = ta.value.slice(0, i).split('\n').length; ta.scrollTop = Math.max(0, (line - 4) * 18)
  }
  fInp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); findNext() } e.stopPropagation() }; rInp.onkeydown = e => e.stopPropagation()
  ta.onkeydown = e => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyF') { e.preventDefault(); findBar.classList.toggle('hidden'); if (!findBar.classList.contains('hidden')) { const s = ta.value.slice(ta.selectionStart, ta.selectionEnd); if (s && !s.includes('\n')) fInp.value = s; fInp.focus() } return }
    if (e.key === 'Tab') { e.preventDefault(); if (cands.length && !sugg.classList.contains('hidden')) acceptSuggestion(cands[0]); else { ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); ta.oninput() } }
    else if (e.key === 'Escape' && !sugg.classList.contains('hidden')) { sugg.classList.add('hidden'); e.stopPropagation() }
  }
  ta.addEventListener('input', updateSugg); ta.addEventListener('click', () => sugg.classList.add('hidden'))
  // plantillas de código
  const snipSel = el('select', { onchange: e => { const s = SNIPPETS[e.target.value]; if (s) { ta.setRangeText((ta.selectionStart > 0 && ta.value[ta.selectionStart - 1] !== '\n' ? '\n' : '') + s, ta.selectionStart, ta.selectionEnd, 'end'); ta.oninput(); ta.focus() } e.target.value = '' } }, el('option', { value: '', text: t('ed_snippets') }), Object.keys(SNIPPETS).map(k => el('option', { value: k, text: k })))
  // consola: lo que imprime el script y sus errores; pulsar una línea salta a ella
  const cons = el('div', { class: 'script-console' })
  function paintConsole() {
    const L = scriptConsole.items.slice(-30)
    setKids(cons, el('div', { class: 'row-btns' }, el('b', { text: t('ed_console') }), el('button', { type: 'button', class: 'btn tiny', text: t('clear'), onclick: () => scriptConsole.clear() })),
      L.length ? L.map(it => { const ln = it.kind === 'error' ? errorLine(it.text) : 0; return el('div', { class: 'con-row ' + it.kind, onclick: () => { if (ln) { const lines = ta.value.split('\n'); let pos = 0; for (let i = 0; i < ln - 1 && i < lines.length; i++) pos += lines[i].length + 1; ta.focus(); ta.setSelectionRange(pos, pos + (lines[ln - 1]?.length ?? 0)); ta.scrollTop = Math.max(0, (ln - 4) * 18) } } }, el('span', { text: it.kind === 'error' ? '!' : '›' }), el('span', { text: it.text }), ln ? el('small', { text: t('ed_goto', { n: ln }) }) : null) }) : el('small', { class: 'muted', text: t('ed_console_empty') }))
    cons.scrollTop = cons.scrollHeight
  }
  scriptConsole.on(paintConsole); paintConsole()
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
    el('details', { class: 'api-ref' }, el('summary', { text: t('ed_api_title') }), el('div', { html: t('ed_api') }), el('div', { html: t('ed_api_tools') })),
    findBar, el('div', { class: 'code-wrap' }, gut, ta), sugg, el('div', { class: 'form-row', style: 'align-items:center;margin-top:8px' }, info, snipSel, exSel, check), res, cons)
}

// Ventana de código dentro del Studio (usa el modal de la app)
export function openScriptModal(game) {
  return new Promise(resolve => {
    const card = document.getElementById('modal-card')
    setKids(card, el('div', { class: 'detail-col' }, el('h2', { text: t('ed_script') }), codeEditor(game), el('button', { class: 'btn primary wide', text: t('close'), onclick: () => { closeModal(); resolve() } })))
    document.getElementById('modal').classList.remove('hidden')
  })
}
