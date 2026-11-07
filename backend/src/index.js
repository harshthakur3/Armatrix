require('dotenv').config()
const express = require('express')
const cors = require('cors')
const routes = require('./routes')

const app = express()

// Only the frontend origins listed in FRONTEND_ORIGIN may call this API from a browser.
app.use(cors({ origin: (process.env.FRONTEND_ORIGIN || '').split(',') }))
app.use(express.json({ limit: '2mb' }))
app.use('/api', routes)

// Unexpected errors: log the details, send a generic message (never leak internals).
// Express recognises an error handler by its four arguments, so `next` stays even though unused.
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong.' } })
})

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`API running on http://localhost:${port}`))
