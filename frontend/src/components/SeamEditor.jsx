import { useEffect, useState } from 'react'
import { formatMm } from '../lib/format.js'
import { formatSeconds, PARAM_FIELDS, seamStats } from '../lib/weld.js'
import Segmented from './Segmented.jsx'
import styles from './SeamEditor.module.css'

const PROCESSES = [
  { id: 'MIG', label: 'MIG' },
  { id: 'TIG', label: 'TIG' },
]

const round = (value) => Math.round(value * 100) / 100

// A number input with its unit. Arrow keys step by `step`; Shift + arrows step ten times faster.
function NumberField({ label, unit, value, step, onChange }) {
  function handleKeyDown(event) {
    if (!event.shiftKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    const delta = (event.key === 'ArrowUp' ? 10 : -10) * step
    onChange(Math.max(0, round((value ?? 0) + delta)))
  }

  return (
    <label className={styles.field}>
      <span className="label">{label}</span>
      <span className={styles.input}>
        <input
          type="number"
          min="0"
          step={step}
          value={value ?? ''}
          onKeyDown={handleKeyDown}
          onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
        />
        <span>{unit}</span>
      </span>
    </label>
  )
}

// Everything that defines how one seam is welded. `scale` converts file units to mm.
export default function SeamEditor({ seam, seamCount, scale, presets, warnings, onChange, onApplyToAll }) {
  const params = seam.params ?? {}
  // After "apply to all", the button confirms how many seams changed, then resets after 2 s.
  const [appliedTo, setAppliedTo] = useState(0)
  useEffect(() => {
    if (!appliedTo) return
    const timer = setTimeout(() => setAppliedTo(0), 2000)
    return () => clearTimeout(timer)
  }, [appliedTo])
  const trim = seam.trim ?? { start_mm: 0, end_mm: 0 }
  const stats = seamStats(seam, scale)
  const isMig = params.process !== 'TIG'

  const setParam = (key, value) => onChange({ params: { ...params, [key]: value } })
  const setTrim = (key, value) => onChange({ trim: { ...trim, [key]: value ?? 0 } })

  function applyPreset(id) {
    const preset = presets.find((p) => p.id === id)
    if (preset) onChange({ params: { ...preset.params } })
  }

  // Flip which end the torch starts from; the trims swap ends with it.
  function reverse() {
    onChange({ points: [...seam.points].reverse(), trim: { start_mm: trim.end_mm, end_mm: trim.start_mm } })
  }

  return (
    <div className={styles.editor}>
      <div className={styles.head}>
        <h3 className="label marked">{seam.id}</h3>
        <button type="button" className={`label ${styles.reverse}`} onClick={reverse}>
          ⇄ Reverse
        </button>
      </div>

      <select className={styles.preset} value="" onChange={(event) => applyPreset(event.target.value)}>
        <option value="">Apply a preset…</option>
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.label}
          </option>
        ))}
      </select>

      <Segmented
        label="Welding process"
        options={PROCESSES}
        value={params.process ?? null}
        onChange={(process) => setParam('process', process)}
      />

      <div className={styles.grid}>
        {PARAM_FIELDS.filter((field) => isMig || !field.migOnly).map((field) => (
          <NumberField
            key={field.key}
            label={field.label}
            unit={field.unit}
            step={field.step}
            value={params[field.key]}
            onChange={(value) => setParam(field.key, value)}
          />
        ))}
      </div>

      {seam.closed ? null : (
        <div className={styles.grid}>
          <NumberField label="Start trim" unit="mm" step={1} value={trim.start_mm} onChange={(v) => setTrim('start_mm', v)} />
          <NumberField label="End trim" unit="mm" step={1} value={trim.end_mm} onChange={(v) => setTrim('end_mm', v)} />
        </div>
      )}

      <dl className={styles.stats}>
        <div>
          <dt className="label">Weld length</dt>
          <dd>
            {formatMm(stats.weldLength)}
            {stats.weldLength < stats.jointLength ? ` of ${formatMm(stats.jointLength)}` : ''}
          </dd>
        </div>
        <div>
          <dt className="label">Weld time</dt>
          <dd>{stats.weldTime === null ? '—' : formatSeconds(stats.weldTime)}</dd>
        </div>
        <div>
          <dt className="label">Heat input</dt>
          <dd>{stats.heatInput === null ? '—' : `${stats.heatInput.toFixed(2)} kJ/mm`}</dd>
        </div>
      </dl>

      {warnings.length > 0 ? (
        <ul className={`callout ${styles.warnings}`}>
          {warnings.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={!seam.params}
        aria-live="polite"
        onClick={() => {
          onApplyToAll(params)
          setAppliedTo(seamCount)
        }}
      >
        {appliedTo ? `✓ Applied to ${appliedTo} seams` : 'Apply to all seams'}
      </button>
    </div>
  )
}
