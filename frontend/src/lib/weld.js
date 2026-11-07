import { seamLength, weldPath } from './seams.js'

// The per-seam welding parameters, in the order the editor shows them.
// `migOnly` fields are hidden for TIG (no voltage setting or wire feed).
export const PARAM_FIELDS = [
  { key: 'current_a', label: 'Current', unit: 'A', step: 5 },
  { key: 'voltage_v', label: 'Voltage', unit: 'V', step: 0.5, migOnly: true },
  { key: 'wire_feed_m_min', label: 'Wire feed', unit: 'm/min', step: 0.5, migOnly: true },
  { key: 'travel_speed_mm_s', label: 'Travel speed', unit: 'mm/s', step: 0.5 },
  { key: 'work_angle_deg', label: 'Work angle', unit: '°', step: 1 },
  { key: 'travel_angle_deg', label: 'Travel angle', unit: '°', step: 1 },
  { key: 'weld_size_mm', label: 'Weld size', unit: 'mm', step: 0.5 },
]

/**
 * Numbers an engineer reads off a seam, all in mm / seconds.
 *   jointLength  the whole traced joint
 *   weldLength   what actually gets welded after trimming
 *   weldTime     weld length ÷ travel speed
 *   heatInput    voltage × current ÷ travel speed, in kJ/mm (MIG; too high warps thin plate)
 */
export function seamStats(seam, scale) {
  const p = seam.params ?? {}
  const jointLength = seamLength(seam) * scale
  const weldLength = seamLength(weldPath(seam, scale)) * scale
  const weldTime = p.travel_speed_mm_s ? weldLength / p.travel_speed_mm_s : null
  const heatInput =
    p.process === 'MIG' && p.voltage_v && p.current_a && p.travel_speed_mm_s
      ? (p.voltage_v * p.current_a) / p.travel_speed_mm_s / 1000
      : null
  return { jointLength, weldLength, weldTime, heatInput }
}

export function formatSeconds(seconds) {
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`
}
