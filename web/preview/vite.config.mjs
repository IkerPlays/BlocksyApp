// Banco de pruebas del juego 3D sin Supabase (ver README.md de esta carpeta)
import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const here = path.dirname(fileURLToPath(import.meta.url))
export default defineConfig({
  root: path.resolve(here, '..'),
  server: { port: 5188, strictPort: true },
  optimizeDeps: { entries: ['preview/game.html', 'preview/pages.html'] },
  resolve: { alias: [
    { find: /^os$/, replacement: path.resolve(here, '../src/os-shim.js') },
    { find: /^\.\/(liolib|loslib|loadlib|ldblib)\.js$/, replacement: path.resolve(here, '../src/lua-stub.js') },
    { find: /^\.\/supabase\.js$/, replacement: path.resolve(here, 'mock-supabase.js') },
    { find: /^\.\/api\.js$/, replacement: path.resolve(here, 'mock-api.js') },
  ] },
})
