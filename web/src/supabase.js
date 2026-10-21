import { createClient } from '@supabase/supabase-js'

const env = import.meta.env

// Proyecto 1: cuentas y presencia
export const authDb = createClient(env.VITE_AUTH_SUPABASE_URL, env.VITE_AUTH_SUPABASE_ANON_KEY)

// Proyecto 2: datos del juego. Se autentica con el token del proyecto AUTH
// (ambos proyectos deben compartir JWT secret; ver supabase/README.md).
export const gameDb = createClient(env.VITE_GAME_SUPABASE_URL, env.VITE_GAME_SUPABASE_ANON_KEY, {
  accessToken: async () => (await authDb.auth.getSession()).data.session?.access_token ?? null,
})
