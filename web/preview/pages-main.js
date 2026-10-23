import '../src/style.css'
import { pages } from '../src/pages.js'
import { headshot } from '../src/avatar.js'
import { applyStatic, setLang } from '../src/i18n.js'
import { applyIcons } from '../src/icons.js'
const q = new URLSearchParams(location.search)
if (q.get('lang')) setLang(q.get('lang'))
const ctx = { profile: { id: 'me', username: 'IkerPlays', avatar_color: '#4da6ff' }, play() {}, go() {}, refreshProfile: async () => {} }
const name = q.get('p') || 'home'
document.getElementById('chip-name').textContent = ctx.profile.username
document.getElementById('chip-avatar').style.setProperty('--img', `url(${headshot(ctx.profile.username, ctx.profile.avatar_color)})`)
document.body.dataset.ready = '0'
applyStatic(); applyIcons()
Promise.resolve(pages[name](document.getElementById('page'), ctx, q.get('arg') || undefined)).then(() => (document.body.dataset.ready = '1'))
