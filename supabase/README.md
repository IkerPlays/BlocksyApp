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

## Tercer servidor: STORE (catálogo de la tienda, objetos y lista de juegos)
Los 3 proyectos: **AUTH** (cuentas, amigos, chat, presencia, **BCoins e inventario**), **GAME** (posiciones, bloques, chat de partida, reglas mínimas) y **STORE** (catálogo de la tienda y lista de juegos).
Mientras no pongas las variables de STORE, la web y la 3DS siguen funcionando en el modo anterior (tienda en AUTH y juegos en GAME), así que puedes migrar sin cortes.

1. Crea un proyecto nuevo en supabase.com y anota su Project URL y su clave anon/publishable.
2. **STORE** → SQL Editor: ejecuta `store/schema.sql`. Después elige un secreto largo y aleatorio y ejecuta (con tu valor):
   `insert into public.app_secrets (name, value) values ('shop_signing', 'TU-SECRETO') on conflict (name) do update set value = excluded.value;`
3. **STORE → Edge Functions**: despliega `functions/game-session/index.ts` con el nombre `game-session` y **Verify JWT desactivado** (es el mismo código que en GAME).
   Secrets: `AUTH_URL`, `AUTH_ANON_KEY` y, opcional, `CREATOR_EMAILS`.
4. **AUTH** → SQL Editor: ejecuta `auth/store-link.sql` y el mismo `insert ... 'shop_signing'` con **el mismo secreto**.
5. **GAME** → SQL Editor: ejecuta `game/v3.sql` (reglas mínimas por juego; los bloques ya no dependen de la tabla games).
6. Variables: en Netlify `VITE_STORE_SUPABASE_URL` y `VITE_STORE_SUPABASE_ANON_KEY` (y en `web/.env`); en GitHub (Settings > Secrets) `STORE_SUPABASE_URL` y `STORE_SUPABASE_ANON_KEY` para la 3DS. Vuelve a desplegar la web y lanza un devbuild.
7. Cuando compruebes que comprar, abrir cofres y crear juegos funcionan, ejecuta en AUTH `auth/store-lockdown.sql` para cerrar la compra antigua.

Cómo se protege: el precio lo decide STORE y llega firmado (HMAC, 3 minutos, un solo uso) a AUTH (`shop_redeem`), que es quien mueve las monedas; GAME solo guarda las reglas
(`allow_build`, `allow_chat`, modo y dueño) que le envía el cliente del creador al guardar un juego. La lista de juegos nueva empieza vacía salvo los 3 iniciales (mismos ids que antes).

## Novedades 1.1 (Bosque Oscuro, Studio 2, sombreros, misiones)
Ejecuta, en este orden y solo una vez (todos son seguros de repetir):
1. **GAME** → `game/v4.sql`: sombrero visible para todos (`player_state.hat`), el monstruo del bosque (`npcs`, `npc_tick`, `npc_release`) y los eventos de partida (`game_event`); añade las reglas del Bosque Oscuro.
2. **GAME** → `game/v5.sql`: `place_blocks` (muchos bloques en una llamada; lo usa el Studio para cajas, estructuras y deshacer). Sin él, el Studio sigue funcionando pero va bloque a bloque.
3. **AUTH** → `auth/extras.sql`: bloquear y denunciar jugadores, misiones diarias.
4. **STORE** → `store/forest.sql`: añade el juego "Bosque Oscuro" a la lista (necesita `store/schema.sql` ya ejecutado). Sin STORE, añade esa fila a `games` de GAME.

Studio: las piezas (Part) y el entorno que edites se guardan en `games.config` (`parts`, `gravity`, `speed`, `jump`, `sky`, `welcome`...). El script Lua puede encontrar las piezas por su nombre: `workspace.Part1`.
Lua estilo Roblox: cada jugador ejecuta el script en su navegador (como un LocalScript); no hace falta ningún SQL. La referencia está en el editor de scripts.

## Hoja de ruta 1.2 (SQL nuevo, seguro de repetir)
- **AUTH** `auth/v12.sql`: tiempo jugado, insignias del perfil, ultima conexion y juegos favoritos. Sin el SQL esas partes no se muestran.
- **GAME** `game/v6.sql`: salas privadas (codigo de sala en la ficha de cada juego).
- **AUTH** `auth/v13.sql`: me gusta / no me gusta en los juegos.
- **GAME** `game/v7.sql` (accesorios sincronizados, 64 caracteres) y **STORE** `store/v12.sql` (22 objetos nuevos: sombreros, gafas, espalda, estelas y mascotas).
- **AUTH** `auth/v14.sql`: aspecto elegido del avatar (piel, pelo, peinado, pantalon). Ejecutalo despues de v12.sql. El aspecto se sincroniza por `game/v7.sql` (96 caracteres).
- **GAME** `game/v8.sql`: eventos `rem` (RemoteEvent de los scripts Lua entre jugadores). Lo necesitan los modos multijugador (pilla-pilla, bandera, oleadas, escondite).
- **AUTH** `auth/v15.sql`: ranking de BCoins (`bcoin_leaderboard`). Es opcional: sin el, la pagina Logros solo muestra los logros.
- **AUTH** `auth/v16.sql` y **STORE** `store/v16.sql`: misiones semanales, temporadas (28 dias, 10 niveles) y cosmeticos limitados. Ejecuta primero el de AUTH. Sin ellos esos paneles no se muestran.
- **AUTH** `auth/v17.sql`: clanes (chat y juegos compartidos), quedadas con fecha y mensajes con imagen o voz (crea el bucket privado `dm-media`). Necesita `social.sql`.
- **AUTH** `auth/v18.sql`: moderacion en servidor (denuncias, baneos, bloqueo de juegos, registro) y contador de visitas. Despues, hazte administrador con el `insert` que hay al principio del archivo y **vuelve a desplegar la Edge Function `game-session` en GAME y en STORE** (Verify JWT desactivado): asi los baneos tambien impiden abrir sesion de juego.
- **AUTH** `auth/v19.sql`: denunciar mensajes del chat de clan y quedadas (boton con bandera), que el equipo los pueda borrar o cancelar desde Moderacion y ver la lista de suspendidos. Necesita v17.sql y v18.sql.

## Instalar la 1.4 de golpe
- Proyecto AUTH: pega `auth/install-1.4.sql` (v15 a v19 en orden) en el SQL Editor y pulsa Run. Es seguro repetirlo.
- Proyecto STORE: pega `store/install-1.4.sql` (articulos de temporada).
- Vuelve a desplegar la funcion `functions/game-session` en GAME y en STORE (con *Verify JWT* desactivado).
- Para ser moderador: `insert into public.staff (user_id, role) select id, 'admin' from public.profiles where lower(username) = lower('TuNombre') on conflict (user_id) do update set role = excluded.role;` en AUTH.
