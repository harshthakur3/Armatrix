// Welding domain rules: presets, typical ranges, and plan validation.

// What one unit in the STL file means, as a factor to millimetres.
const UNITS = { mm: 1, cm: 10, m: 1000, in: 25.4 }

// Per-seam parameters. A parameter applies to a process if it has a typical range for it:
// voltage and wire feed are MIG-only. Ranges only produce warnings, never block a save.
const FIELDS = {
  current_a: { label: 'Current', unit: 'A', range: { MIG: [80, 350], TIG: [20, 250] } },
  voltage_v: { label: 'Voltage', unit: 'V', range: { MIG: [15, 35] } },
  wire_feed_m_min: { label: 'Wire feed', unit: 'm/min', range: { MIG: [2, 15] } },
  travel_speed_mm_s: { label: 'Travel speed', unit: 'mm/s', range: { MIG: [3, 15], TIG: [1, 6] } },
  work_angle_deg: { label: 'Work angle', unit: '°', range: { MIG: [30, 60], TIG: [30, 60] } },
  travel_angle_deg: { label: 'Travel angle', unit: '°', range: { MIG: [0, 25], TIG: [0, 25] } },
  weld_size_mm: { label: 'Weld size', unit: 'mm', range: { MIG: [2, 12], TIG: [1, 8] } },
}

// Starting points an engineer can apply in one click. The first one is the default for new seams.
const PRESETS = [
  {
    id: 'mig-steel-6',
    label: 'MIG · steel · 6 mm fillet',
    params: { process: 'MIG', current_a: 180, voltage_v: 22, wire_feed_m_min: 8, travel_speed_mm_s: 6, work_angle_deg: 45, travel_angle_deg: 10, weld_size_mm: 6 },
  },
  {
    id: 'mig-steel-3',
    label: 'MIG · steel · 3 mm fillet',
    params: { process: 'MIG', current_a: 120, voltage_v: 18, wire_feed_m_min: 5, travel_speed_mm_s: 8, work_angle_deg: 45, travel_angle_deg: 10, weld_size_mm: 3 },
  },
  {
    id: 'mig-steel-8',
    label: 'MIG · steel · 8 mm fillet',
    params: { process: 'MIG', current_a: 250, voltage_v: 27, wire_feed_m_min: 11, travel_speed_mm_s: 4.5, work_angle_deg: 45, travel_angle_deg: 10, weld_size_mm: 8 },
  },
  {
    id: 'tig-stainless-2',
    label: 'TIG · stainless · 2 mm',
    params: { process: 'TIG', current_a: 90, travel_speed_mm_s: 2.5, work_angle_deg: 45, travel_angle_deg: 15, weld_size_mm: 2 },
  },
]

const isPoint = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

// Seam path length in file units, including the closing segment of a loop.
function pathLength({ points, closed }) {
  let total = 0
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i])
  return closed ? total + distance(points.at(-1), points[0]) : total
}

/**
 * Checks a weld plan.
 *   errors   - malformed data; the plan is not saved.      [{ path, message }]
 *   warnings - valid but worth a look.                      [{ seam, message, blocksExport }]
 *              Missing values block export (a robot can't weld without them);
 *              unusual values don't (the engineer may know better).
 */
function validatePlan(plan) {
  const errors = []
  const warnings = []
  const fail = (path, message) => errors.push({ path, message })
  const warn = (seam, message, blocksExport = false) => warnings.push({ seam, message, blocksExport })

  if (!plan || typeof plan !== 'object') return { errors: [{ path: '', message: 'Plan must be an object.' }], warnings }
  if (!(plan.units in UNITS)) fail('units', `units must be one of: ${Object.keys(UNITS).join(', ')}.`)
  if (plan.upAxis !== 'y' && plan.upAxis !== 'z') fail('upAxis', 'upAxis must be "y" or "z".')
  if (!Array.isArray(plan.seams)) {
    fail('seams', 'seams must be a list.')
    return { errors, warnings }
  }

  const ids = new Set()
  plan.seams.forEach((seam, i) => {
    const at = `seams[${i}]`
    if (typeof seam?.id !== 'string' || ids.has(seam.id)) fail(`${at}.id`, 'Each seam needs a unique id.')
    ids.add(seam?.id)

    if (!Array.isArray(seam?.points) || seam.points.length < 2 || !seam.points.every(isPoint)) {
      return fail(`${at}.points`, 'A seam needs at least two [x, y, z] points.')
    }

    const { start_mm = 0, end_mm = 0 } = seam.trim ?? {}
    if (![start_mm, end_mm].every((v) => Number.isFinite(v) && v >= 0)) {
      fail(`${at}.trim`, 'Trim offsets must be 0 or more.')
    } else if (pathLength(seam) * (UNITS[plan.units] ?? 1) - start_mm - end_mm <= 0) {
      warn(seam.id, 'Trim removes the whole seam.', true)
    }

    const params = seam.params
    if (!params) return warn(seam.id, 'No welding parameters set.', true)
    if (params.process !== 'MIG' && params.process !== 'TIG') return fail(`${at}.params.process`, 'process must be MIG or TIG.')

    for (const [key, field] of Object.entries(FIELDS)) {
      const range = field.range[params.process]
      if (!range) continue // not used by this process
      const value = params[key]
      if (value === null || value === undefined) {
        warn(seam.id, `${field.label} is not set.`, true)
      } else if (!Number.isFinite(value) || value < 0) {
        fail(`${at}.params.${key}`, `${field.label} must be a positive number.`)
      } else if (value < range[0] || value > range[1]) {
        warn(seam.id, `${field.label} ${value} ${field.unit} is outside the usual ${params.process} range (${range[0]}–${range[1]} ${field.unit}).`)
      }
    }
  })

  return { errors, warnings }
}

const SCHEMA_VERSION = '1.0'
const round = (value, digits) => Number(value.toFixed(digits))
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)

// The stretch of an open path between distances `start` and `end` along it (same units as the points).
function cutPath(points, start, end) {
  const out = []
  let walked = 0
  for (let i = 1; i < points.length; i++) {
    const length = distance(points[i - 1], points[i])
    const from = walked
    walked += length
    if (walked <= start || from >= end || length === 0) continue
    if (out.length === 0) out.push(lerp(points[i - 1], points[i], (Math.max(start, from) - from) / length))
    out.push(lerp(points[i - 1], points[i], (Math.min(end, walked) - from) / length))
  }
  return out
}

/**
 * Builds a general weld job for controller integration: ordered seams, paths in millimetres
 * cut to their trims, and the parameters each process uses. Field names state numeric units.
 * Returns { job } or, if the plan isn't ready, { problems: [{ seam?, message }] }.
 */
function buildWeldJob(part, plan) {
  const { errors, warnings } = validatePlan(plan)
  const problems = [
    ...errors.map((e) => ({ message: `${e.path}: ${e.message}` })),
    ...warnings.filter((w) => w.blocksExport).map(({ seam, message }) => ({ seam, message })),
  ]
  if (errors.length === 0 && plan.seams.length === 0) problems.push({ message: 'Add at least one seam before exporting.' })
  if (problems.length) return { problems }

  const scale = UNITS[plan.units]
  const seams = plan.seams.map((seam, index) => {
    const mm = seam.points.map((p) => p.map((v) => v * scale))
    const { start_mm = 0, end_mm = 0 } = seam.trim ?? {}
    const path = seam.closed ? mm : cutPath(mm, start_mm, pathLength({ points: mm }) - end_mm)
    const { process, ...values } = seam.params
    // Only the parameters this process uses (TIG has no voltage or wire feed setting).
    const params = Object.fromEntries(Object.keys(FIELDS).filter((k) => FIELDS[k].range[process]).map((k) => [k, values[k]]))
    return {
      id: seam.id,
      sequence: index + 1,
      process,
      closed: Boolean(seam.closed),
      path_mm: path.map((p) => p.map((v) => round(v, 3))),
      params,
    }
  })

  return {
    job: {
      schema_version: SCHEMA_VERSION,
      generated_at: new Date().toISOString(),
      part: { id: part.id, name: part.name, source_units: plan.units, up_axis: plan.upAxis },
      coordinate_frame: 'stl_part',
      seams,
    },
  }
}

module.exports = { PRESETS, validatePlan, buildWeldJob }
