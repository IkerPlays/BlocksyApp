// Service worker de Blocksy: la app (HTML/JS/CSS/iconos) funciona sin conexión; la API y la música siempre van a la red.
const VERSION = 'blocksy-v2'
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())) })
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting() })

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin) return          // Supabase y demás: red
  if (url.pathname.startsWith('/playlist/')) return                            // la música no se guarda (puede ser grande)
  if (req.mode === 'navigate') {                                               // páginas: red primero, caché si no hay conexión
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(ca => ca.put('/', c)); return r }).catch(() => caches.match('/')))
    return
  }
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(ca => ca.put(req, c)) } return r }).catch(() => hit)
    return hit || net                                                          // stale-while-revalidate
  }))
})
