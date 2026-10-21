import { createClient } from '@supabase/supabase-js'

const env = import.meta.env

// Proyecto 1: cuentas, amigos y presencia
export const authDb = createClient(env.VITE_AUTH_SUPABASE_URL, env.VITE_AUTH_SUPABASE_ANON_KEY)

// Proyecto 2: datos del juego (lectura pública; escritura vía RPC con secret de sesión, ver api.js)
export const gameDb = createClient(env.VITE_GAME_SUPABASE_URL, env.VITE_GAME_SUPABASE_ANON_KEY)
export const GAME_URL = env.VITE_GAME_SUPABASE_URL
export const GAME_KEY = env.VITE_GAME_SUPABASE_ANON_KEY
