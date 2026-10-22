# Bases de datos (2 proyectos Supabase, plan gratis)

| Proyecto | Archivo | Para qué |
|---|---|---|
| **AUTH** | `auth/schema.sql` | Cuentas, perfiles, amigos, presencia online |
| **GAME** | `game/schema.sql` + `functions/game-session` | x,y,z de jugadores, bloques, chat, interacciones |

## Cómo se conectan (sin compartir JWT secret)
1. El cliente inicia sesión en **AUTH** y obtiene su `access_token`.
2. Llama a la Edge Function `game-session` de **GAME** con ese token; la función lo valida
   contra AUTH y devuelve un `secret` de sesión (12 h).
3. Todas las escrituras en GAME son RPC (`move`, `place_block`, `break_block`, `say`...) que
   exigen ese `secret`. Las lecturas son públicas (anon) y por eso funciona Realtime y la 3DS.

## Pasos
1. Crea 2 proyectos en supabase.com (gratis). Anota de cada uno: Project URL y la clave anon/publishable
   (Project Settings → API Keys).
2. **AUTH**: SQL Editor → pega `auth/schema.sql` → Run. En Authentication → Sign In / Providers → Email,
   desactiva "Confirm email" mientras desarrollas.
3. **GAME**: SQL Editor → pega `game/schema.sql` → Run.
4. **GAME → Edge Functions → Deploy a new function → Via Editor**: nombre `game-session`, pega
   `functions/game-session/index.ts`, y en el panel de la función desactiva **Verify JWT**. Deploy.
5. **GAME → Edge Functions → Secrets**: añade `AUTH_URL` (URL del proyecto AUTH) y `AUTH_ANON_KEY`
   (su clave anon/publishable).
   (Alternativa por CLI: `supabase functions deploy game-session --no-verify-jwt --project-ref <ref-game>` y
   `supabase secrets set AUTH_URL=... AUTH_ANON_KEY=... --project-ref <ref-game>`).
6. Rellena `web/.env` y `3ds/source/config.h` con las URLs y claves de los dos proyectos.

Límite conocido: no hay rate limit en las RPC; vale para un prototipo entre amigos.

## Si ya ejecutaste una versión anterior del esquema
- **GAME**: ejecuta primero `game/reset-v1.sql` (borra las tablas antiguas) y luego `game/schema.sql`.
- **AUTH**: vuelve a ejecutar `auth/schema.sql` entero (es seguro repetirlo; añade la tabla `friendships`).

## Iniciar sesión en la 3DS escaneando un QR
Hace falta una vez el parche `game/link-login.sql` (pégalo en el SQL Editor de **GAME**; ya viene incluido en `game/schema.sql`).
Flujo: la 3DS pide un código (`link_start`) y enseña un QR con `https://TU-WEB/#link/CODIGO`; el móvil/tablet lo abre, inicia sesión
y pulsa *Autorizar* (`link_approve`); la 3DS lo detecta (`link_poll`) y recibe una sesión de 30 días que guarda en
`sdmc:/3ds/blocksy/session.txt` para entrar sola la próxima vez («Cuenta» en el juego la borra).

## Solo una cuenta puede crear juegos
1. Game → SQL Editor: ejecuta `game/creators.sql` (añade `sessions.can_create` y exige permiso en `create_game` / `delete_game`).
2. Game → Edge Functions → `game-session`: pega de nuevo `functions/game-session/index.ts` y despliega.
3. (Opcional) Game → Edge Functions → Secrets: `CREATOR_EMAILS` = emails separados por comas. Por defecto solo `ikerana35018santanaiker@gmail.com`.
La web enseña el apartado Crear solo si la respuesta de `game-session` trae `can_create: true`; aunque alguien lo forzara, el servidor lo rechaza.

## Amigos con solicitud, chat, notificaciones e invitaciones (v2)
1. **AUTH** → SQL Editor: ejecuta `auth/social.sql` (después de `auth/schema.sql`). Quita la lista pública de jugadores (solo ves a tus amigos), crea
   `friend_requests`, `messages`, `notifications` y las funciones `send_friend_request`, `respond_friend_request`, `send_message`, `invite_friend`...
2. **GAME** → SQL Editor: ejecuta `game/v2.sql` (tipos de juego, `config`, `script`, `update_game`, reglas de construcción/chat en el servidor y dos juegos de ejemplo).
3. Para que el chat y los jugadores lleguen en tiempo real, comprueba en Database → Publications → `supabase_realtime` que están las tablas
   (los scripts ya las añaden). La web usa además consultas de respaldo cada ~1 s, así que sigue funcionando aunque Realtime falle.
4. Música: pon tus archivos en `web/public/playlist/` y haz push; Netlify genera la lista al compilar.

## BCoins, tienda y cofres (v3)
1. **AUTH** → SQL Editor: ejecuta `auth/shop.sql` (después de `social.sql`). Crea `shop_items`, `inventory`, `coin_log` y las funciones `my_wallet`, `claim_daily`, `earn_coins`, `buy_item`, `open_crate`, `equip_item`.
   También **quita al cliente el permiso de modificar** `bcoins`, `streak` y `equipped` (solo se pueden cambiar con esas funciones).
2. Las monedas por jugar (`earn_coins`) las pide el cliente con topes diarios bajos; vale para amigos, no es a prueba de tramposos decididos.
3. Para añadir objetos a la tienda: inserta filas en `shop_items` (`kind`: hat | title | crate). Los sombreros nuevos necesitan además su modelo en `web/src/avatar.js` (`addHat`).

## Studio y Lua
El Studio (`/studio/<id>`) guarda en `games.config` (`ui` = textos en pantalla, `script_lang` = js | lua) y en `games.script`; no necesita más SQL que `game/v2.sql`.
