import '../src/style.css'
import { pages } from '../src/pages.js'
import { headshot } from '../src/avatar.js'
const ctx = { profile: { id: 'me', username: 'IkerPlays', avatar_color: '#4da6ff' }, play() {}, go() {}, refreshProfile: async () => {} }
const name = new URLSearchParams(location.search).get('p') || 'home'
document.getElementById('chip-name').textContent = ctx.profile.username
document.getElementById('chip-avatar').style.setProperty('--img', `url(${headshot(ctx.profile.username, ctx.profile.avatar_color)})`)
document.body.dataset.ready = '0'
pages[name](document.getElementById('page'), ctx).then(() => (document.body.dataset.ready = '1'))
