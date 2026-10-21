// Scripts de juego (editor avanzado). Se ejecutan en un Worker aislado: sin DOM, sin red y sin acceso a tu sesión.
// El script solo puede pedir acciones a través de mensajes; el juego decide si las aplica.
const PRELUDE = `
'use strict';
const __post = self.postMessage.bind(self);
for (const k of ['fetch','XMLHttpRequest','WebSocket','EventSource','importScripts','indexedDB','caches','BroadcastChannel','Worker','SharedWorker','navigator']) { try { Object.defineProperty(self, k, { value: undefined, configurable: false }) } catch {} }
const __h = { join: [], chat: [], tick: [], reach: [], command: {} };
let __me = { name: '' }, __n = 0;
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const str = v => String(v ?? '').slice(0, 200);
const act = (type, a) => { if (++__n < 400) __post({ t: 'act', type, a }) };
const game = {
  say: s => act('say', [str(s)]), title: (s, ms) => act('title', [str(s), num(ms, 3000)]),
  teleport: (x, y, z) => act('teleport', [num(x), num(y), num(z)]),
  setSpeed: n => act('speed', [num(n, 6)]), setJump: n => act('jump', [num(n, 8.6)]), setGravity: n => act('gravity', [num(n, 24)]),
  emote: n => act('emote', [str(n)]), sky: n => act('sky', [str(n)]), sound: n => act('sound', [str(n)]),
  get me() { return __me },
};
function on(ev, fn) { if (ev === 'command') throw new Error('usa command("nombre", fn)'); if (!__h[ev]) throw new Error('evento desconocido: ' + ev); __h[ev].push(fn) }
function command(name, fn) { __h.command[String(name).toLowerCase()] = fn }
const say = game.say, title = game.title, teleport = game.teleport, emote = game.emote;
self.onmessage = e => {
  const m = e.data;
  if (m.t === 'init') { __me = m.me; try { (0, eval)(m.code); } catch (err) { __post({ t: 'error', msg: String(err && err.message || err) }) } __post({ t: 'ready' }); return }
  __n = 0;
  try {
    if (m.ev === 'command') { const f = __h.command[m.name]; if (f) f(m.args, m.who) }
    else for (const f of __h[m.ev] || []) f(m.data, m.who);
  } catch (err) { __post({ t: 'error', msg: String(err && err.message || err) }) }
  __post({ t: 'ack', id: m.id });
};
`

export function checkSyntax(code) {
  try { new Function(code); return null } catch (e) { return e.message }
}

export function createRunner(code, me, onAction, onError) {
  if (!code || !code.trim()) return { fire() {}, has: () => false, dispose() {} }
  let w, alive = true, seq = 0, pending = new Map()
  try {
    const url = URL.createObjectURL(new Blob([PRELUDE], { type: 'text/javascript' }))
    w = new Worker(url); URL.revokeObjectURL(url)
  } catch (e) { onError?.(e.message); return { fire() {}, has: () => false, dispose() {} } }
  const kill = why => { if (!alive) return; alive = false; w.terminate(); onError?.(why) }
  w.onmessage = e => {
    const m = e.data
    if (m.t === 'act') onAction(m.type, m.a)
    else if (m.t === 'error') onError?.(m.msg)
    else if (m.t === 'ack') pending.delete(m.id)
  }
  w.onerror = e => kill(e.message || 'error')
  w.postMessage({ t: 'init', code, me })
  const watchdog = setInterval(() => { for (const [, at] of pending) if (Date.now() - at > 3000) return kill('El script tardó demasiado y se detuvo') }, 1000)
  return {
    has: () => alive,
    fire(ev, data = {}) { if (!alive) return; const id = ++seq; pending.set(id, Date.now()); w.postMessage({ id, ev, ...data }) },
    dispose() { alive = false; clearInterval(watchdog); w.terminate() },
  }
}

export const EXAMPLES = {
  'Bienvenida': `on('join', () => {\n  title('Bienvenido, ' + game.me.name, 3500);\n  say('Escribe /saltar para un super salto');\n});\n\ncommand('saltar', () => { game.setJump(14); say('Super salto activado'); });\ncommand('normal', () => { game.setJump(8.6); game.setSpeed(6); say('Vuelves a la normalidad'); });`,
  'Luna (baja gravedad)': `on('join', () => { game.setGravity(7); game.sky('night'); title('Bienvenido a la Luna', 3000); });`,
  'Teletransportes': `command('inicio', () => teleport(0.5, 3, 0.5));\ncommand('cielo', () => teleport(0.5, 60, 0.5));\ncommand('tp', a => { const [x, y, z] = String(a).split(' ').map(Number); teleport(x, y, z); });`,
  'Reloj y anuncios': `let n = 0;\non('tick', () => {\n  n++;\n  if (n % 60 === 0) say('Han pasado ' + (n / 60) + ' minutos. ¡Sigue construyendo!');\n});`,
  'Respuesta del chat': `on('chat', m => {\n  if (/hola/i.test(m.text) && m.name !== game.me.name) say('Hola, ' + m.name + '!');\n});`,
}
