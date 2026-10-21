// PWA: service worker, instalación y permiso de notificaciones del sistema
let deferred = null
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e })
window.addEventListener('appinstalled', () => { deferred = null })
export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
export const canInstall = () => !!deferred
export async function installApp() { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null }
export async function askNotifications() { try { return await Notification.requestPermission() } catch { return 'denied' } }

export function registerSW(onUpdate) {
  if (!('serviceWorker' in navigator) || location.hostname === 'localhost' && !location.search.includes('sw')) return
  addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      reg.addEventListener('updatefound', () => {
        const w = reg.installing
        w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) onUpdate?.() })
      })
    } catch {}
  })
}
