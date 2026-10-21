# Bases de datos (2 proyectos Supabase)

| Proyecto | Archivo | Para qué |
|---|---|---|
| **AUTH** | `auth/schema.sql` | Cuentas, perfiles, presencia online (`profiles_public.is_online`) |
| **GAME** | `game/schema.sql` | Posición x,y,z de jugadores, bloques, interacciones, juegos |

1. Crea dos proyectos en Supabase y ejecuta cada `schema.sql` en el suyo.
2. En AUTH: Authentication → desactiva "Confirm email" mientras desarrollas.
3. **Hacer que GAME acepte los tokens de AUTH.** Los jugadores solo inician sesión
   en AUTH, y el cliente manda ese `access_token` a GAME (`accessToken` en supabase-js,
   cabecera `Authorization` en la 3DS). Para que GAME lo valide, ambos proyectos
   deben compartir la clave de firma JWT: en AUTH → Project Settings → JWT, copia el
   *JWT secret*, y en GAME pégalo en el mismo ajuste (JWT secret legacy). Si tu plan o
   versión ya no permite esto, la alternativa es una Edge Function en GAME que valide el
   token de AUTH y emita uno propio; avísame y la añado.
4. Presencia: los clientes llaman a `touch_presence(game_id)` cada 30 s; `is_online`
   es `last_seen` en los últimos 60 s.
