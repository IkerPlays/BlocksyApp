import { defineConfig } from 'vite'
import { readdirSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const AUDIO = /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|webm)$/i
const dir = fileURLToPath(new URL('./public/playlist', import.meta.url))

// Escanea public/playlist y escribe playlist.json (lista de archivos) al arrancar o compilar
function playlistPlugin() {
  const scan = () => {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const files = readdirSync(dir).filter(f => AUDIO.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    writeFileSync(join(dir, 'playlist.json'), JSON.stringify({ files }, null, 1))
    return files
  }
  return {
    name: 'blocksy-playlist',
    config() { scan() },
    configureServer(server) {
      server.watcher.add(dir)
      server.watcher.on('add', f => { if (f.startsWith(dir) && AUDIO.test(f)) scan() })
      server.watcher.on('unlink', f => { if (f.startsWith(dir) && AUDIO.test(f)) scan() })
    },
  }
}

const BUILD = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)    // ej. 20261022154300
// Escribe el identificador de compilación en dist/sw.js
function stampSW() {
  return { name: 'blocksy-stamp-sw', apply: 'build', closeBundle() {
    const f = fileURLToPath(new URL('./dist/sw.js', import.meta.url))
    if (existsSync(f)) writeFileSync(f, readFileSync(f, 'utf8').replace('__BUILD__', BUILD))
  } }
}

export default defineConfig({
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [playlistPlugin(), stampSW()],
  build: { chunkSizeWarningLimit: 1200 },
})
