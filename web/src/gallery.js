// Galería de capturas (solo en este dispositivo): se guardan en pequeño (JPEG 640x360) además de descargarse a tamaño completo
const KEY = 'blocksy.gallery', MAX = 12
export const listShots = () => { try { const l = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(l) ? l : [] } catch { return [] } }
function write(l) { for (;;) { try { localStorage.setItem(KEY, JSON.stringify(l)); return true } catch { if (l.length <= 1) return false; l.shift() } } }
export function addShot(canvas, game) {
  try {
    const c = document.createElement('canvas'); c.width = 640; c.height = 360; const x = c.getContext('2d'), r = canvas.width / canvas.height
    let sw = canvas.width, sh = canvas.height, sx = 0, sy = 0
    if (r > 16 / 9) { sw = canvas.height * 16 / 9; sx = (canvas.width - sw) / 2 } else { sh = canvas.width * 9 / 16; sy = (canvas.height - sh) / 2 }
    x.drawImage(canvas, sx, sy, sw, sh, 0, 0, 640, 360)
    const l = listShots(); l.push({ at: Date.now(), game, img: c.toDataURL('image/jpeg', 0.7) }); while (l.length > MAX) l.shift(); write(l)
  } catch {}
}
export function delShot(at) { write(listShots().filter(s => s.at !== at)) }
