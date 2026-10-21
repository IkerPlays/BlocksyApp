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
