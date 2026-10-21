// Edge Function del proyecto GAME. Valida el token del proyecto AUTH y emite un secret de sesión.
// Secrets necesarios: AUTH_URL, AUTH_ANON_KEY  (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen incluidos)
// Opcional: CREATOR_EMAILS = emails (separados por comas) que pueden crear juegos. Por defecto, solo el dueño.
// Desplegar con "Verify JWT" DESACTIVADO (el token es del otro proyecto).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const DEFAULT_CREATORS = 'ikerana35018santanaiker@gmail.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { token } = await req.json()
    if (!token || typeof token !== 'string') return json({ error: 'missing token' }, 400)

    const authUrl = Deno.env.get('AUTH_URL')!
    const authKey = Deno.env.get('AUTH_ANON_KEY')!
    const headers = { apikey: authKey, Authorization: `Bearer ${token}` }

    const u = await fetch(`${authUrl}/auth/v1/user`, { headers })
    if (!u.ok) return json({ error: 'invalid auth token' }, 401)
    const user = await u.json()

    const creators = (Deno.env.get('CREATOR_EMAILS') ?? DEFAULT_CREATORS).toLowerCase().split(',').map((e) => e.trim()).filter(Boolean)
    const canCreate = typeof user.email === 'string' && creators.includes(user.email.toLowerCase())

    let username = 'player', color = '#4da6ff'
    const p = await fetch(`${authUrl}/rest/v1/profiles?id=eq.${user.id}&select=username,avatar_color`, { headers })
    if (p.ok) {
      const rows = await p.json()
      if (rows[0]) { username = rows[0].username; color = rows[0].avatar_color }
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    await admin.from('sessions').delete().or(`player_id.eq.${user.id},expires_at.lt.${new Date().toISOString()}`)
    const { data, error } = await admin.from('sessions')
      .insert({ player_id: user.id, username, color, can_create: canCreate }).select('secret').single()
    if (error) return json({ error: error.message }, 500)

    return json({ secret: data.secret, player_id: user.id, username, color, can_create: canCreate })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
