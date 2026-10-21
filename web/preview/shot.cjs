// node preview/shot.cjs <carpeta-salida>   (necesita el servidor: npx vite --config preview/vite.config.mjs)
const { chromium, devices } = require(process.env.PLAYWRIGHT_PATH || 'playwright')
const out = process.argv[2] || 'preview/out'
require('node:fs').mkdirSync(out, { recursive: true })
;(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const errors = []
  async function run(name, ctxOpts, actions) {
    const ctx = await b.newContext(ctxOpts); const p = await ctx.newPage()
    p.on('pageerror', e => errors.push(name + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(name + ' console: ' + m.text()) })
    await p.goto('http://localhost:5188/preview/game.html'); await p.waitForTimeout(2500)
    await actions(p); await p.screenshot({ path: `${out}/${name}.png` }); await ctx.close()
  }
  await run('desktop', { viewport: { width: 1280, height: 720 } }, async p => {
    await p.keyboard.down('KeyD'); await p.waitForTimeout(500); await p.keyboard.up('KeyD')
    await p.mouse.move(640, 430); await p.waitForTimeout(600)
  })
  await run('desktop_place', { viewport: { width: 1280, height: 720 } }, async p => {
    await p.mouse.move(640, 430); await p.waitForTimeout(300); await p.mouse.click(640, 430); await p.waitForTimeout(500); await p.mouse.move(700, 470); await p.waitForTimeout(500)
  })
  await run('tablet', { ...devices['iPad (gen 7) landscape'] }, async p => { await p.waitForTimeout(500) })
  await b.close()
  console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'sin errores de consola')
})()
