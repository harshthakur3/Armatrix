import { useEffect, useRef, useState, useTransition } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth/useAuth.js'
import Pins from '../../components/Pins.jsx'
import { formatBytes, formatDate } from '../../lib/format.js'
import { deletePart, listParts, MAX_STL_MB, uploadPart, validateStl } from '../../lib/parts.js'
import { preloadPart } from '../loaders.js'
import styles from './PartsPage.module.css'

export default function PartsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const fileInput = useRef(null)
  const [parts, setParts] = useState(null) // null while loading
  const [error, setError] = useState(null)
  const [isUploading, startUpload] = useTransition()
  // Delete takes two clicks: the first arms the button ("Delete?"), the second deletes.
  const [confirmingId, setConfirmingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    let ignore = false
    listParts().then(
      (rows) => !ignore && setParts(rows),
      (err) => !ignore && setError(err.message),
    )
    return () => {
      ignore = true
    }
  }, [])

  function upload(file) {
    const problem = validateStl(file)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    startUpload(async () => {
      try {
        const partId = await uploadPart(file, user.id)
        navigate(`/parts/${partId}`)
      } catch (err) {
        setError(err.message)
      }
    })
  }

  function handleDelete(part) {
    if (confirmingId !== part.id) return setConfirmingId(part.id)
    setConfirmingId(null)
    setDeletingId(part.id)
    setError(null)
    deletePart(part.id)
      .then(() => setParts((current) => current.filter((p) => p.id !== part.id)))
      .catch((err) => setError(err.message))
      .finally(() => setDeletingId(null))
  }

  function handleFileChange(event) {
    const file = event.target.files[0]
    event.target.value = '' // lets the same file be picked again after an error
    if (file) upload(file)
  }

  function handleDrop(event) {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file && !isUploading) upload(file)
  }

  const uploadButton = (
    <button
      type="button"
      className="btn btn-solid"
      disabled={isUploading}
      onClick={() => fileInput.current.click()}
    >
      {isUploading ? 'Uploading…' : 'Upload .stl'}
      <span className="btn-arrow" aria-hidden="true">
        ↑
      </span>
    </button>
  )

  const hasParts = parts !== null && parts.length > 0

  return (
    <main className={styles.main} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <input ref={fileInput} type="file" accept=".stl" hidden onChange={handleFileChange} />

      <header className={styles.head}>
        <div className={styles.title}>
          <h1 className="section-title">Parts</h1>
          {hasParts ? (
            <span className={`label ${styles.count}`}>
              {parts.length} {parts.length === 1 ? 'part' : 'parts'}
            </span>
          ) : null}
        </div>
        {hasParts ? uploadButton : null}
      </header>

      {error ? (
        <p className={`callout ${styles.error}`} role="alert">
          {error}
        </p>
      ) : null}

      {parts === null ? null : hasParts ? (
        <>
          <div className={`label ${styles.columns}`} aria-hidden="true">
            <span>Name</span>
            <span>Size</span>
            <span>Last edited</span>
          </div>
          <ul className={styles.list}>
            {parts.map((part) => (
              <li key={part.id}>
                <Link
                  to={`/parts/${part.id}`}
                  className={styles.row}
                  onMouseEnter={preloadPart}
                  onFocus={preloadPart}
                >
                  <span className={styles.name}>{part.name}</span>
                  <span className={styles.meta}>{formatBytes(part.size_bytes)}</span>
                  <span className={styles.meta}>{formatDate(part.updated_at)}</span>
                  <span className={`label ${styles.open}`}>Open →</span>
                </Link>
                <button
                  type="button"
                  className={`label ${styles.delete}`}
                  data-confirming={confirmingId === part.id ? 'true' : undefined}
                  aria-label={`Delete ${part.name}`}
                  disabled={deletingId === part.id}
                  onClick={() => handleDelete(part)}
                  onBlur={() => setConfirmingId(null)}
                >
                  {deletingId === part.id ? '…' : confirmingId === part.id ? 'Delete?' : '✕'}
                </button>
              </li>
            ))}
          </ul>
          <p className={`label ${styles.hint}`}>Drop an .stl anywhere on this page to upload</p>
        </>
      ) : (
        <section className={`panel ${styles.empty}`}>
          <Pins />
          <p className="label tag">[ No parts yet ]</p>
          <h2 className={styles.emptyTitle}>Upload a part to start planning</h2>
          <p className={`body-copy ${styles.emptyBody}`}>
            Drop an .stl file here or choose one. Binary or ASCII, up to {MAX_STL_MB} MB.
          </p>
          {uploadButton}
        </section>
      )}
    </main>
  )
}
