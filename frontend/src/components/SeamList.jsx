import { formatMm } from '../lib/format.js'
import { seamStats } from '../lib/weld.js'
import styles from './SeamList.module.css'

// The plan's seams in weld order. `scale` converts file units to millimetres.
export default function SeamList({ seams, selectedId, scale, warnings, onSelect, onMove, onRemove }) {
  if (seams.length === 0) {
    return <p className={styles.empty}>Hover an edge on the model, then click to add it as a seam.</p>
  }

  const withWarnings = new Set(warnings.map((warning) => warning.seam))

  return (
    <ol className={styles.list}>
      {seams.map((seam, index) => (
        <li key={seam.id} className={styles.item} aria-current={seam.id === selectedId ? 'true' : undefined}>
          <button type="button" className={styles.select} onClick={() => onSelect(seam.id)}>
            <span className={`label ${styles.order}`}>{String(index + 1).padStart(2, '0')}</span>
            <span className={styles.id}>{seam.id}</span>
            {withWarnings.has(seam.id) ? (
              <span className={styles.warn} title="Has warnings: select it to see them">
                !
              </span>
            ) : null}
            <span className={styles.meta}>
              {formatMm(seamStats(seam, scale).weldLength)}
              {seam.closed ? ' · loop' : ''}
            </span>
          </button>
          <div className={styles.actions}>
            <button type="button" aria-label={`Weld ${seam.id} earlier`} disabled={index === 0} onClick={() => onMove(seam.id, -1)}>
              ↑
            </button>
            <button
              type="button"
              aria-label={`Weld ${seam.id} later`}
              disabled={index === seams.length - 1}
              onClick={() => onMove(seam.id, 1)}
            >
              ↓
            </button>
            <button type="button" aria-label={`Delete ${seam.id}`} onClick={() => onRemove(seam.id)}>
              ✕
            </button>
          </div>
        </li>
      ))}
    </ol>
  )
}
