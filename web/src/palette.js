// Paleta de comandos (Ctrl+K), atajos de navegación (g + letra) y aviso de conexión
import { t } from './i18n.js'

const $ = id => document.getElementById(id)
let box, input, list, items = [], sel = 0, getCtx = null

const PAGES = [['home', 'nav_home', 'h'], ['discover', 'nav_discover', 'd'], ['friends', 'nav_friends', 'f'], ['shop', 'nav_shop', 's'], ['avatar', 'nav_avatar', 'a'], ['profile', 'nav_profile', 'p'], ['achievements', 'nav_achievements', 'l'], ['settings', 'nav_settings', 'o'], ['link', 'nav_link', 'k']]
const inGame = () => !$('game')?.classList.contains('hidden')
const typingNow = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '') || document.activeElement?.isContentEditable

async function buildItems(q) {
  const c = getCtx(), out = PAGES.map(([p, k, key]) => ({ label: t(k), hint: `g ${key}`, kind: 'page', run: () => c.go(p) }))
  if (c.canCreate?.()) out.push({ label: t('nav_create'), hint: 'g c', kind: 'page', run: () => c.go('create') })
  out.push({ label: t('whats_new'), kind: 'action', run: () => import('./pages.js').then(m => m.showNews()) },
    { label: t('set_theme') + ': ' + t('theme_dark'), kind: 'action', run: () => c.setTheme?.('dark') },
    { label: t('set_theme') + ': ' + t('theme_light'), kind: 'action', run: () => c.setTheme?.('light') },
    { label: t('set_theme') + ': ' + t('theme_contrast'), kind: 'action', run: () => c.setTheme?.('contrast') })
  if (q.length >= 1) { try { for (const g of (await c.games?.()) ?? []) out.push({ label: g.name, hint: t('play'), kind: 'game', run: () => c.play(g) }) } catch {} }
  return out
}
const score = (label, q) => { const l = label.toLowerCase(); if (!q) return 1; if (l.startsWith(q)) return 3; if (l.includes(q)) return 2; let i = 0; for (const ch of l) if (ch === q[i]) i++; return i === q.length ? 1 : 0 }
async function refresh() {
  const q = input.value.trim().toLowerCase(), all = await buildItems(q)
  items = all.map(it => ({ it, s: score(it.label, q) })).filter(x => x.s).sort((a, b) => b.s - a.s).slice(0, 9).map(x => x.it)
  sel = Math.min(sel, Math.max(0, items.length - 1))
  list.replaceChildren(...items.map((it, i) => { const r = document.createElement('div'); r.className = 'pal-row' + (i === sel ? ' on' : ''); r.innerHTML = '<span></span><small></small>'; r.firstChild.textContent = it.label; r.lastChild.textContent = it.hint ?? ''; r.onclick = () => run(i); return r }))
  if (!items.length) { const e = document.createElement('div'); e.className = 'pal-empty'; e.textContent = t('pal_none'); list.replaceChildren(e) }
}
function run(i) { const it = items[i]; close(); it?.run() }
export function close() { box?.classList.add('hidden') }
export function openPalette() {
  if (inGame()) return
  if (!box) {
    box = document.createElement('div'); box.id = 'palette'; box.className = 'hidden'
    box.innerHTML = '<div class="pal-card"><input type="search" autocomplete="off" spellcheck="false"><div class="pal-list"></div><small class="pal-foot"></small></div>'
    document.body.append(box); input = box.querySelector('input'); list = box.querySelector('.pal-list')
    box.onclick = e => { if (e.target === box) close() }
    input.oninput = () => { sel = 0; refresh() }
    input.onkeydown = e => {
      if (e.key === 'Escape') close(); else if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); refresh(); e.preventDefault() } else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); refresh(); e.preventDefault() } else if (e.key === 'Enter') run(sel)
    }
  }
  input.placeholder = t('pal_placeholder'); box.querySelector('.pal-foot').textContent = t('pal_foot')
  input.value = ''; sel = 0; box.classList.remove('hidden'); refresh(); setTimeout(() => input.focus(), 0)
}

export function installPalette(ctxGetter) {
  getCtx = ctxGetter
  let gAt = 0
  addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') { e.preventDefault(); if (box && !box.classList.contains('hidden')) close(); else openPalette(); return }
    if (inGame() || typingNow() || e.ctrlKey || e.metaKey || e.altKey || !getCtx()) return
    if (e.code === 'KeyG') { gAt = Date.now(); return }
    if (Date.now() - gAt < 1000) {
      const hit = PAGES.find(p => e.code === 'Key' + p[2].toUpperCase())
      if (hit) { gAt = 0; getCtx().go(hit[0]) } else if (e.code === 'KeyC' && getCtx().canCreate?.()) { gAt = 0; getCtx().go('create') }
    }
  })
  // aviso de conexión
  const bn = document.createElement('div'); bn.id = 'net-banner'; bn.className = 'hidden'; document.body.append(bn)
  const upd = () => { bn.textContent = navigator.onLine ? '' : t('offline_banner'); bn.classList.toggle('hidden', navigator.onLine) }
  addEventListener('online', upd); addEventListener('offline', upd); upd()
}
