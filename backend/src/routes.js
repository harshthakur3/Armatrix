const express = require('express')
const { requireUser } = require('./auth')
const { buildWeldJob, PRESETS, validatePlan } = require('./weld')

const router = express.Router()

router.get('/presets', (req, res) => {
  res.json({ presets: PRESETS })
})

// Checks a plan without saving it (used when a part is opened, to show warnings straight away).
router.post('/plans/validate', (req, res) => {
  res.json(validatePlan(req.body))
})

const notFound = (res) => res.status(404).json({ error: { code: 'not_found', message: 'Part not found.' } })

// Validates the plan, then saves it on the part. Errors block the save; warnings come back for the UI.
// Optimistic concurrency: the client sends the version it started from (If-Match: <updated_at>).
// If the part was saved elsewhere since, nothing is overwritten and the client gets 409.
router.put('/parts/:id/plan', requireUser, async (req, res) => {
  const { errors, warnings } = validatePlan(req.body)
  if (errors.length) {
    return res.status(400).json({ error: { code: 'invalid_plan', message: 'The plan contains invalid data.', details: errors } })
  }

  let update = req.db
    .from('parts')
    .update({ plan: req.body, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
  const expectedVersion = req.get('If-Match')
  if (expectedVersion) update = update.eq('updated_at', expectedVersion)
  const { data, error } = await update.select('updated_at').maybeSingle()

  // Row-level security makes another user's part look missing; a malformed id (22P02) is missing too.
  if (error?.code === '22P02') return notFound(res)
  if (error) throw error

  if (!data) {
    // Nothing updated: either the part doesn't exist, or its version moved on.
    const { data: part } = await req.db.from('parts').select('id').eq('id', req.params.id).maybeSingle()
    if (!part) return notFound(res)
    return res.status(409).json({
      error: { code: 'conflict', message: 'This part was changed in another window. Reload to get the latest version.' },
    })
  }

  res.json({ warnings, updated_at: data.updated_at })
})

// Deletes a part: its STL file first, then its row. If the file delete fails nothing has changed
// and it can be retried; the reverse order could leave a part that no longer opens.
router.delete('/parts/:id', requireUser, async (req, res) => {
  const { data: part, error } = await req.db.from('parts').select('file_path').eq('id', req.params.id).maybeSingle()
  if (error?.code === '22P02' || (!error && !part)) return notFound(res)
  if (error) throw error

  const { error: fileError } = await req.db.storage.from('stl-files').remove([part.file_path])
  if (fileError) throw fileError
  const { error: rowError } = await req.db.from('parts').delete().eq('id', req.params.id)
  if (rowError) throw rowError

  res.status(204).end()
})

// The general weld job for a part, requested by the planner's Export button.
// Refuses (422) if the plan is missing required data.
router.get('/parts/:id/weld-job', requireUser, async (req, res) => {
  const { data: part, error } = await req.db.from('parts').select('id, name, plan').eq('id', req.params.id).maybeSingle()
  if (error?.code === '22P02' || (!error && !part)) return notFound(res)
  if (error) throw error

  const plan = { units: 'mm', upAxis: 'z', seams: [], ...part.plan }
  const { job, problems } = buildWeldJob(part, plan)
  if (problems) {
    return res.status(422).json({ error: { code: 'plan_not_ready', message: 'Fix these before exporting.', details: problems } })
  }
  res.json(job)
})

module.exports = router
