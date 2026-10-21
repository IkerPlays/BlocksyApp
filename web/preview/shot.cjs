// node preview/shot.cjs <carpeta-salida>   (necesita el servidor: npx vite --config preview/vite.config.mjs)
const { chromium, devices } = require(process.env.PLAYWRIGHT_PATH || 'playwright')
const out = process.argv[2] || 'preview/out'
require('node:fs').mkdirSync(out, { recursive: true })
;(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const errors = []
  async function run(name, query, ctxOpts, actions = async () => {}) {
    const ctx = await b.newContext(ctxOpts); const p = await ctx.newPage()
    p.on('pageerror', e => errors.push(name + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(name + ' console: ' + m.text()) })
    await p.goto('http://localhost:5188/preview/game.html' + query); await p.waitForTimeout(3000)
    await actions(p); await p.screenshot({ path: `${out}/${name}.png` }); await ctx.close()
  }
  const D = { viewport: { width: 1280, height: 720 } }
  await run('desktop', '', D, async p => { await p.keyboard.down('KeyD'); await p.waitForTimeout(500); await p.keyboard.up('KeyD'); await p.mouse.move(640, 430); await p.waitForTimeout(600); await p.keyboard.press('KeyG'); await p.waitForTimeout(400) })
  await run('desktop_place', '', D, async p => { await p.mouse.move(640, 430); await p.waitForTimeout(300); await p.mouse.click(640, 430); await p.waitForTimeout(500); await p.mouse.move(700, 470); await p.waitForTimeout(500) })
  await run('world_hills', '?world=hills', D)
  await run('world_islands', '?world=islands&sky=sunset', D)
  await run('world_plaza', '?world=plaza&mode=social&build=0', D)
  await run('world_obby', '?world=obby&mode=obby&build=0&sky=night', D)
  await run('ultra_night', '?world=hills&sky=night&quality=ultra', D)
  await run('script', "?script=" + encodeURIComponent("on('join', () => { title('Hola desde el script', 3000); say('script ok') })"), D, async p => { await p.waitForTimeout(1500) })
  await run('tablet', '', { ...devices['iPad (gen 7) landscape'] }, async p => { await p.waitForTimeout(500); await p.click('#chat-btn'); await p.waitForTimeout(300) })
  async function page(name, q, w = 1280, lang) {
    const ctx = await b.newContext({ viewport: { width: w, height: 760 } }); const p = await ctx.newPage()
    p.on('pageerror', e => errors.push(name + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(name + ' console: ' + m.text()) })
    await p.goto('http://localhost:5188/preview/pages.html?p=' + q + (lang ? '&lang=' + lang : '')); await p.waitForTimeout(3500)
    await p.screenshot({ path: `${out}/${name}.png`, fullPage: true }); await ctx.close()
  }
  await page('page_home', 'home'); await page('page_avatar', 'avatar'); await page('page_friends', 'friends'); await page('page_settings', 'settings')
  await page('page_create', 'create'); await page('page_editor', 'create&arg=g3'); await page('page_discover', 'discover'); await page('page_home_en', 'home', 1280, 'en')
  await b.close()
  console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'sin errores de consola')
})()
