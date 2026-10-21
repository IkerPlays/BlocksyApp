# Banco de pruebas del juego 3D (sin Supabase)

Sirve el juego con un servidor simulado (`mock-supabase.js`, `mock-api.js`) para revisar el render y los controles
sin cuentas ni red. Necesita `playwright` (global o `PLAYWRIGHT_PATH=/ruta/a/playwright`).

```
cd web
npx vite --config preview/vite.config.mjs &        # http://localhost:5188/preview/game.html
node preview/shot.cjs preview/out                  # capturas: escritorio, escritorio+bloque, tablet (táctil)
```
Las capturas usan WebGL por software (SwiftShader): los fps que muestran no son los reales.
