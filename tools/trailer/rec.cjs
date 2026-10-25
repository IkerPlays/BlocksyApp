const { chromium } = require('playwright')
const out = process.argv[2]
;(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  async function rec(name, url, act, ms = 7000) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out + '/' + name, size: { width: 1280, height: 720 } } })
    const p = await ctx.newPage(); await p.goto(url); await p.waitForTimeout(4500)
    await act(p); await p.waitForTimeout(500); await p.close(); await ctx.close()
  }
  const G = 'http://localhost:5188/preview/game.html', P = 'http://localhost:5188/preview/pages.html?p='
  const hold = async (p, k, ms) => { await p.keyboard.down(k); await p.waitForTimeout(ms); await p.keyboard.up(k) }
  const drag = async (p, dx, steps = 20, ms = 120) => { await p.mouse.move(640, 360); await p.mouse.down(); for (let i = 0; i < steps; i++) { await p.mouse.move(640 + dx * i / steps, 360 - i * 1); await p.waitForTimeout(ms) } await p.mouse.up() }
  await rec('hills', G + '?world=hills', async p => { await p.keyboard.down('Shift'); await hold(p, 'KeyW', 3000); await p.keyboard.press('Space'); await drag(p, 400, 12, 150); await p.keyboard.up('Shift') })
  await rec('plaza', G + '?world=plaza&mode=social&build=0', async p => { await p.keyboard.press('KeyG'); await p.waitForTimeout(600); await hold(p, 'KeyA', 1500); await p.keyboard.press('Space'); await hold(p, 'KeyD', 2000); await drag(p, -300, 10, 150) })
  await rec('obby', G + '?world=obby&mode=obby&build=0&sky=night', async p => { await hold(p, 'KeyW', 2500); await p.keyboard.press('Space'); await hold(p, 'KeyW', 1500); await drag(p, 300, 10, 150) })
  await rec('islands', G + '?world=islands&sky=sunset', async p => { await hold(p, 'KeyW', 2000); await drag(p, 500, 14, 140); await p.keyboard.press('Space'); await hold(p, 'KeyD', 1500) })
  await rec('home', P + 'home', async p => { for (let i = 0; i < 14; i++) { await p.mouse.wheel(0, 70); await p.waitForTimeout(220) } })
  await rec('discover', P + 'discover', async p => { for (let i = 0; i < 14; i++) { await p.mouse.wheel(0, 80); await p.waitForTimeout(220) } })
  await b.close()
})()
