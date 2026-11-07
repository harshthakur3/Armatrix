const { createClient } = require('@supabase/supabase-js')

const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY in backend/.env (see .env.example).')
}

// Middleware: checks the Supabase access token sent as `Authorization: Bearer <token>`.
// On success, req.db is a Supabase client acting as that user (public key + their token),
// so Postgres row-level security still applies and the API can only touch their rows.
async function requireUser(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer /, '')
  if (!token) return res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in required.' } })

  const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) {
    return res.status(401).json({ error: { code: 'unauthorized', message: 'Session expired. Sign in again.' } })
  }

  req.db = db
  next()
}

module.exports = { requireUser }
