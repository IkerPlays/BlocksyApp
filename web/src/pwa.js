// PWA: service worker con sistema de actualizaciones, instalación y notificaciones del sistema
let deferred = null, reg = null, onUpdateCb = null, updateReady = false
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; window.dispatchEvent(new Event('blocksy:installable')) })
window.addEventListener('appinstalled', () => { deferred = null })
export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
export const canInstall = () => !!deferred
export async function installApp() { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null }
export async function askNotifications() { try { return await Notification.requestPermission() } catch { return 'denied' } }
export const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev'
export const isUpdateReady = () => updateReady

function announce() { updateReady = true; onUpdateCb?.() }
function watch(r) {
  if (r.waiting && navigator.serviceWorker.controller) announce()
  r.addEventListener('updatefound', () => {
    const w = r.installing
    w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) announce() })
  })
}
// Busca una versión nueva ahora. Devuelve 'ready' (hay una esperando), 'latest' (al día) o 'error'
export async function checkForUpdate() {
  if (!reg) return 'error'
  try { await reg.update() } catch { return 'error' }
  return updateReady || reg.waiting ? 'ready' : 'latest'
}
// Activa la versión nueva y recarga la página
export function applyUpdate() {
  const w = reg?.waiting
  if (!w) return location.reload()
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true })
  w.postMessage('skip')
  setTimeout(() => location.reload(), 4000)                    // por si el navegador no avisa del cambio
}

export function registerSW(onUpdate) {
  onUpdateCb = onUpdate
  if (!('serviceWorker' in navigator) || (location.hostname === 'localhost' && !location.search.includes('sw'))) return
  const start = async () => {
    try {
      reg = await navigator.serviceWorker.register('/sw.js')
      watch(reg)
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000)            // cada 30 min
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}) })
    } catch {}
  }
  if (document.readyState === 'complete') start(); else addEventListener('load', start)
}
