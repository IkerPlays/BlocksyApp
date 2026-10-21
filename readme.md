# Blocksy

Mini-Roblox propio: mundo de bloques multijugador para **web** y **Nintendo 3DS (homebrew)**, mismo servidor.

```
web/       Cliente web (Vite + Three.js) → se despliega en Netlify
3ds/       Cliente 3DS (C, libctru + citro2d) → blocksy.3dsx y blocksy.cia
supabase/  SQL de las 2 bases de datos
```

## Descargar e instalar en la 3DS

<p align="center">
  <a href="https://github.com/IkerPlays/BlocksyApp/releases/latest/download/Blocksy.cia">
    <img src="images/qr-latest.png" alt="QR: último Blocksy.cia estable" width="240">
  </a>
</p>

Escanea el QR con **FBI** (*Remote Install → Scan QR code*, y luego *Download and install*) o haz clic en él.
Apunta siempre al `Blocksy.cia` de la **última release estable**, así que no hay que actualizarlo.
Los builds de prueba (pre-releases) están en [Releases](../../releases). También puedes copiar `Blocksy.cia` a la SD
e instalarlo con FBI, o usar `Blocksy.3dsx` desde el Homebrew Launcher.

> El QR solo funciona cuando existe al menos una release **estable** (workflow *Stable release*); los devbuilds son
> pre-releases y `latest` los ignora.

## Arquitectura de datos
- **Supabase AUTH** (`supabase/auth/schema.sql`): cuentas, `profiles`, amigos, presencia (`is_online`).
- **Supabase GAME** (`supabase/game/schema.sql` + Edge Function `game-session`): `games`, `player_state`
  (x,y,z,ry en vivo, ~10 Hz), `blocks`, `interactions` (chat incluido). Lectura pública + Realtime; escritura por RPC
  con un secret de sesión que emite la Edge Function tras validar el token de AUTH (funciona en el plan gratis).
  **Guía paso a paso en `supabase/README.md`.**

## Sincronización web ↔ 3DS
Ambos usan las mismas tablas y los mismos ejes (x,z suelo, y arriba) y las mismas RPC: la web recibe por Realtime, la 3DS
consulta cada 100 ms (jugadores) y 1 s (bloques). Los jugadores 3DS se ven en la web con la etiqueta «3DS»; el chat funciona en ambos
(3DS: SELECT).

## Web
```
cd web && cp .env.example .env   # rellena las 4 variables
npm install && npm run dev
```
Netlify: conecta el repo; `netlify.toml` ya fija base `web`, build `npm run build`, publish `dist`.
Añade en Netlify las 4 variables `VITE_*` del `.env.example`.

## 3DS
```
cd 3ds && cp source/config.h.example source/config.h   # rellena URLs/keys
make        # blocksy.3dsx
make cia    # blocksy.cia (necesita makerom y bannertool)
```
Requiere devkitPro (`dkp-pacman -S 3ds-dev`). El workflow `.github/workflows/3ds.yml` compila ambos
(secrets: `AUTH_SUPABASE_URL`, `AUTH_SUPABASE_ANON_KEY`, `GAME_SUPABASE_URL`, `GAME_SUPABASE_ANON_KEY`).
La app de 3DS replica la web: **Inicio, Descubrir, Avatar, Amigos, Crear y Ajustes**, ficha de cada juego, amigos con su estado online, creación de mundos y cambio de color del avatar. Recuerda tu email, tu último juego y los ajustes.
**Avatares y emotes:** cada jugador tiene un avatar 3D propio (piel, pelo, peinado y pantalón salen de su nombre; la camiseta la eliges tú) y la foto de perfil es la cabeza del avatar. Emotes: saludar, bailar, celebrar, aplaudir y sentarse (web: tecla G; 3DS: botón Emotes).
**Actualizaciones:** la sección *Actualizar* de la app busca en las releases de GitHub la última versión estable y la última devbuild y las instala con un toque.
Inicio de sesión en la 3DS: con email y contraseña (pantalla táctil) o **«Con QR»**: la consola muestra un QR, lo escaneas con el móvil/tablet, inicias sesión allí y pulsas *Autorizar*. Requiere `supabase/game/link-login.sql`.
Controles: círculo mover · A saltar · X poner · Y romper · B color · SELECT chat · L/R cámara · START salir.

## Estado
La web tiene interfaz estilo Roblox (Inicio, Descubrir, Avatar, Amigos, Crear, Ajustes) y menú en el juego (Esc). La web compila (`vite build`). **El código de 3DS no se ha compilado aún** (no hay
devkitARM en este entorno); es probable que haga falta algún ajuste al primer `make`. La 3DS desactiva la
verificación TLS (`net.c`) hasta instalar un certificado raíz.

## Releases (mismo sistema que Iker's Tube)
- `.github/workflows/build.yml` — compila web + `.3dsx`/`.cia` en cada PR; con *Run workflow* sobre `main` publica un **devbuild** (`v<versión>-dev.N`, pre-release) y conserva solo los 15 últimos por línea de versión.
- `.github/workflows/release.yml` — *Stable release*: pide la versión (`0.1.0`), usa `STABLE_RELEASE_NOTES.md` y publica la release normal (opción borrador).
- `.github/workflows/releases-maintenance.yml` — backup / prune / republish / restructure de releases.
- `VERSION` fija la versión base; `RELEASE_NOTES.md` = notas del devbuild actual; `STABLE_RELEASE_NOTES.md` = novedades desde la última estable.
- **Importante:** los workflows con *Run workflow* solo aparecen cuando están en la rama por defecto (`main`): haz merge de esta rama.

## Releases (mismo sistema que Iker's Tube)
- `.github/workflows/build.yml` — compila web + `.3dsx`/`.cia` en cada PR; con *Run workflow* sobre `main` publica un **devbuild** (`v<versión>-dev.N`, pre-release) y conserva solo los 15 últimos por línea de versión.
- `.github/workflows/release.yml` — *Stable release*: pide la versión (`0.1.0`), usa `STABLE_RELEASE_NOTES.md` y publica la release normal (opción borrador).
- `.github/workflows/releases-maintenance.yml` — backup / prune / republish / restructure de releases.
- `VERSION` fija la versión base; `RELEASE_NOTES.md` = notas del devbuild actual; `STABLE_RELEASE_NOTES.md` = novedades desde la última estable.
- **Importante:** los workflows con *Run workflow* solo aparecen cuando están en la rama por defecto (`main`): hay que hacer merge de esta rama.

## Actualizaciones de la 3DS
La sección *Actualizar* de la app lee las releases de GitHub **sin iniciar sesión**, así que el repositorio tiene que ser **público**
(Settings → General → Danger Zone → Change visibility). Con el repo público también funciona el QR de FBI de arriba.

## Quién puede crear juegos
Solo la cuenta autorizada y solo desde la web. El servidor lo comprueba (`sessions.can_create`, que pone la función `game-session` según el
secret opcional `CREATOR_EMAILS`; por defecto `ikerana35018santanaiker@gmail.com`). Hay que ejecutar `supabase/game/creators.sql` en Game y
volver a desplegar `supabase/functions/game-session/index.ts`.
