import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { getPart } from '../../lib/parts.js'
import PartWorkspace from './PartWorkspace.jsx'
import styles from './PartPage.module.css'

// Loads the part record, then hands over to the planning workspace.
export default function PartPage() {
  const { partId } = useParams()
  const [result, setResult] = useState({ partId: null, part: null })

  useEffect(() => {
    let ignore = false
    // A malformed id errors in Postgres; treat it the same as a part that doesn't exist.
    getPart(partId).then(
      (part) => !ignore && setResult({ partId, part }),
      () => !ignore && setResult({ partId, part: null }),
    )
    return () => {
      ignore = true
    }
  }, [partId])

  if (result.partId !== partId) return null // still loading this part

  if (!result.part) {
    return (
      <main className={styles.missing}>
        <h1 className="section-title">Part not found</h1>
        <p className="body-copy">It may have been deleted, or it belongs to another account.</p>
        <Link to="/parts" className="btn btn-outline btn-sm">
          Back to parts
        </Link>
      </main>
    )
  }

  // Keyed by id so switching parts starts a fresh download and viewer state.
  return <PartWorkspace key={result.part.id} part={result.part} />
}
