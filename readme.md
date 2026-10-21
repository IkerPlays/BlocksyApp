# Blocksy

Mini-Roblox propio: mundo de bloques multijugador para **web** y **Nintendo 3DS (homebrew)**, mismo servidor.

```
web/       Cliente web (Vite + Three.js) → se despliega en Netlify
3ds/       Cliente 3DS (C, libctru + citro2d) → blocksy.3dsx y blocksy.cia
supabase/  SQL de las 2 bases de datos
```

## Arquitectura de datos
- **Supabase AUTH** (`supabase/auth/schema.sql`): cuentas, `profiles`, presencia (`is_online`).
- **Supabase GAME** (`supabase/game/schema.sql`): `games`, `player_state` (x,y,z,ry en vivo, ~10 Hz),
  `blocks`, `interactions`. Realtime activado. Ver `supabase/README.md` (los tokens de AUTH deben ser válidos en GAME).

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
Controles: círculo mover · A saltar · X poner · Y romper · B color · L/R cámara · START salir.

## Estado
Primer esqueleto. La web compila (`vite build`). **El código de 3DS no se ha compilado aún** (no hay
devkitARM en este entorno); es probable que haga falta algún ajuste al primer `make`. La 3DS desactiva la
verificación TLS (`net.c`) hasta instalar un certificado raíz.
