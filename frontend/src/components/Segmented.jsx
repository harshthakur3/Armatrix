import styles from './Segmented.module.css'

// A row of toggle buttons. With `value`, the matching option shows as pressed;
// without it (e.g. camera views) the buttons are plain actions.
export default function Segmented({ label, options, value, onChange, className = '' }) {
  return (
    <div className={`${styles.segmented} ${className}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="label"
          aria-pressed={value === undefined ? undefined : value === option.id}
          title={option.key ? `${option.label} (${option.key.toUpperCase()})` : undefined}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
