import { useState, useTransition } from 'react'
import { fetchWeldJob } from '../lib/parts.js'

// Saves `data` as a JSON file in the browser's downloads.
function downloadJson(data, fileName) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Downloads the weld job built by the API. The API refuses if any seam is missing required data,
 * and lists why. Disabled while edits are still saving, so the export always matches the screen.
 */
export default function ExportButton({ part, saved }) {
  const [isPending, startTransition] = useTransition()
  const [problems, setProblems] = useState([])

  function handleExport() {
    setProblems([])
    startTransition(async () => {
      try {
        const job = await fetchWeldJob(part.id)
        downloadJson(job, `${part.name.replace(/\.stl$/i, '')}-weld-job.json`)
      } catch (err) {
        setProblems(err.details.length ? err.details : [{ message: err.message }])
      }
    })
  }

  return (
    <>
      <button type="button" className="btn btn-solid" onClick={handleExport} disabled={!saved || isPending}>
        {isPending ? 'Exporting…' : 'Export weld job'}
        <span className="btn-arrow" aria-hidden="true">
          ↓
        </span>
      </button>
      {problems.length > 0 ? (
        <div className="callout" role="alert">
          <strong>Not ready to export:</strong>
          <ul>
            {problems.map((problem) => (
              <li key={`${problem.seam}-${problem.message}`}>
                {problem.seam ? `${problem.seam}: ` : ''}
                {problem.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  )
}
