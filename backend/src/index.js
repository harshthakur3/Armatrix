require('dotenv').config()
const express = require('express')
const cors = require('cors')
const routes = require('./routes')

const app = express()

// Normalize dashboard entries, including spaces and a copied trailing slash.
const allowedOrigins = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map((origin) => {
    try {
      const url = new URL(origin)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error()
      return url.origin
    } catch {
      throw new Error('FRONTEND_ORIGIN must contain comma-separated HTTP(S) frontend URLs.')
    }
  })
if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  throw new Error('Set FRONTEND_ORIGIN to the deployed frontend URL in the hosting environment.')
}
app.use(cors({ origin: allowedOrigins }))
app.use(express.json({ limit: '2mb' }))
app.get('/health', (req, res) => res.json({ status: 'ok' }))
app.use('/api', routes)

// Unexpected errors: log the details, send a generic message (never leak internals).
// Express recognises an error handler by its four arguments, so `next` stays even though unused.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'invalid_json', message: 'Request body must be valid JSON.' } })
  if (err.type === 'entity.too.large') return res.status(413).json({ error: { code: 'body_too_large', message: 'The plan exceeds the 2 MB request limit.' } })
  console.error(err)
  res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong.' } })
})

const port = Number(process.env.PORT || 3000)
app.listen(port, '0.0.0.0', () => console.log(`API running on http://localhost:${port}`))
