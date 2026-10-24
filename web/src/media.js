// Imágenes de los juegos (icono, banner, capturas) y visibilidad. Las imágenes se guardan pequeñas dentro de la configuración del juego
// (data URL JPEG) o como enlace https; cuando haya almacenamiento de archivos se cambiará solo el origen.
export const VISIBILITY = ['public', 'unlisted', 'private']
export const visOf = g => g?.config?.visibility ?? (g?.config?.draft ? 'private' : 'public')
export const isImg = u => typeof u === 'string' && u.length < 90_000 && (/^https:\/\/[^\s"')]+$/.test(u) || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u))
export const MEDIA = { icon: [256, 256], banner: [800, 300], shot: [640, 360] }
// Recorta al encuadre pedido (cover) y reduce: devuelve un JPEG en data URL
export async function fileToDataURL(file, w, h, q = 0.78) {
  if (!file || !/^image\//.test(file.type)) throw new Error('image')
  const bmp = await createImageBitmap(file), c = document.createElement('canvas'); c.width = w; c.height = h
  const s = Math.max(w / bmp.width, h / bmp.height), dw = bmp.width * s, dh = bmp.height * s
  c.getContext('2d').drawImage(bmp, (w - dw) / 2, (h - dh) / 2, dw, dh); bmp.close?.()
  let out = c.toDataURL('image/jpeg', q); if (out.length > 60_000) out = c.toDataURL('image/jpeg', 0.5)
  return out
}
