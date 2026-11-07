import { useCallback, useEffect, useRef, useState } from 'react'
import { savePlan, validatePlan } from '../lib/parts.js'

const DEFAULT_PLAN = { units: 'mm', upAxis: 'z', seams: [] }
const SAVE_DELAY_MS = 600

/**
 * The editable weld plan for one part. Each change is saved through the API shortly after,
 * which validates it and returns warnings (unusual or missing values) for the UI.
 * Mount with key={part.id} so switching parts starts from that part's saved plan.
 */
export function usePlan(part) {
  const [plan, setPlan] = useState(() => ({ ...DEFAULT_PLAN, ...part.plan }))
  const [saveState, setSaveState] = useState('saved') // 'saved' | 'saving' | 'error' | 'conflict'
  const [saveError, setSaveError] = useState(null)
  const [warnings, setWarnings] = useState([]) // [{ seam, message }]
  const savedPlan = useRef(plan)
  // The version (updated_at) this window last saw; each save must match it or the API says 409.
  const version = useRef(part.updated_at)
  const revision = useRef(0)
  const saveQueue = useRef(Promise.resolve())
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    const editedRevision = revision.current
    // Just opened: nothing to save, but ask the API for warnings straight away.
    if (plan === savedPlan.current) {
      validatePlan(plan).then((result) => {
        if (mounted.current && revision.current === editedRevision) setWarnings(result.warnings)
      }, () => {})
      return
    }
    // Debounced save: rapid edits (typing, several clicks) become a single request.
    const timer = setTimeout(() => {
      // Wait for the previous save so this request uses its returned version.
      saveQueue.current = saveQueue.current.then(async () => {
        if (!mounted.current || revision.current !== editedRevision) return
        try {
          const result = await savePlan(part.id, plan, version.current)
          savedPlan.current = plan
          version.current = result.updated_at
          // An older response must not mark newer unsaved edits as "Saved".
          if (!mounted.current || revision.current !== editedRevision) return
          setWarnings(result.warnings)
          setSaveError(null)
          setSaveState('saved')
        } catch (err) {
          if (!mounted.current || revision.current !== editedRevision) return
          setSaveError(err.message)
          // 409: saved from another window since this one opened. Nothing was overwritten.
          setSaveState(err.status === 409 ? 'conflict' : 'error')
        }
      })
    }, SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [part.id, plan])

  // Every edit goes through here, so the "saving" status is set by the action itself.
  const edit = useCallback((change) => {
    revision.current += 1
    setPlan((current) => ({ ...current, ...change(current) }))
    setSaveState('saving')
  }, [])

  const setUnits = useCallback((units) => edit(() => ({ units })), [edit])
  const setUpAxis = useCallback((upAxis) => edit(() => ({ upAxis })), [edit])
  const addSeams = useCallback((added) => edit(({ seams }) => ({ seams: [...seams, ...added] })), [edit])
  const removeSeam = useCallback(
    (id) => edit(({ seams }) => ({ seams: seams.filter((seam) => seam.id !== id) })),
    [edit],
  )
  // Merges `changes` (e.g. { params } or { trim }) into one seam.
  const updateSeam = useCallback(
    (id, changes) => edit(({ seams }) => ({ seams: seams.map((s) => (s.id === id ? { ...s, ...changes } : s)) })),
    [edit],
  )
  // Copies one seam's welding parameters onto every seam.
  const applyParamsToAll = useCallback(
    (params) => edit(({ seams }) => ({ seams: seams.map((s) => ({ ...s, params: { ...params } })) })),
    [edit],
  )
  // Weld order is the list order; move a seam one place earlier (-1) or later (+1).
  const moveSeam = useCallback(
    (id, step) =>
      edit(({ seams }) => {
        const from = seams.findIndex((seam) => seam.id === id)
        const to = from + step
        if (to < 0 || to >= seams.length) return {}
        const next = [...seams]
        ;[next[from], next[to]] = [next[to], next[from]]
        return { seams: next }
      }),
    [edit],
  )

  return {
    plan,
    saveState,
    saveError,
    warnings,
    setUnits,
    setUpAxis,
    addSeams,
    removeSeam,
    updateSeam,
    applyParamsToAll,
    moveSeam,
  }
}
