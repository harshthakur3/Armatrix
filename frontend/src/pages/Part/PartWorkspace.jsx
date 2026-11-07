import { lazy, Suspense, useEffect, useEffectEvent, useMemo, useState } from 'react'
import { Link } from 'react-router'
import ExportButton from '../../components/ExportButton.jsx'
import SeamEditor from '../../components/SeamEditor.jsx'
import SeamList from '../../components/SeamList.jsx'
import Segmented from '../../components/Segmented.jsx'
import { usePlan } from '../../hooks/usePlan.js'
import { useStl } from '../../hooks/useStl.js'
import { formatBytes, formatDate, formatMm } from '../../lib/format.js'
import { fetchPresets } from '../../lib/parts.js'
import {
  buildEdgeGraph,
  closestPointOnSegment,
  findSeamNear,
  MAX_EDGE_TRIANGLES,
  nearestSegment,
  newSeamsAt,
  nextSeamId,
  seamLength,
  snapPoint,
} from '../../lib/seams.js'
import { describeGeometry } from '../../lib/stl.js'
import { loadViewer } from '../loaders.js'
import styles from './PartWorkspace.module.css'

// three.js downloads in parallel with the STL file instead of after it.
const Viewer = lazy(loadViewer)

const VIEWS = [
  { id: 'fit', label: 'Fit', key: 'f' },
  { id: 'iso', label: 'Iso', key: '1' },
  { id: 'top', label: 'Top', key: '2' },
  { id: 'front', label: 'Front', key: '3' },
  { id: 'right', label: 'Right', key: '4' },
]
const VIEW_BY_KEY = Object.fromEntries(VIEWS.map((view) => [view.key, view.id]))

const MODES = [
  { id: 'shaded', label: 'Shaded' },
  { id: 'edges', label: 'Edges' },
  { id: 'wire', label: 'Wire' },
]

const UP_AXES = [
  { id: 'z', label: 'Z up' },
  { id: 'y', label: 'Y up' },
]

// What one unit in the file means, as a factor to millimetres.
const UNITS = { mm: 1, cm: 10, m: 1000, in: 25.4 }

const AXES = ['x', 'y', 'z']

const SAVE_LABELS = { saved: 'Saved', saving: 'Saving…', error: 'Not saved', conflict: 'Not saved' }

// Pick edge: click a highlighted joint. Draw path: click points by hand, for joints with no clean edge.
const TOOLS = [
  { id: 'pick', label: 'Pick edge', key: 'e' },
  { id: 'draw', label: 'Draw path', key: 'd' },
]
const TOOL_BY_KEY = Object.fromEntries(TOOLS.map((tool) => [tool.key, tool.id]))

// How far from the cursor (in screen pixels) an edge or corner can be picked or snapped to.
const PICK_PIXELS = 12

const SHORTCUTS = [
  ...VIEWS.map((view) => [view.key.toUpperCase(), view.id === 'fit' ? 'Fit part to view' : `${view.label} view`]),
  ['E', 'Pick edge: click a highlighted joint'],
  ['D', 'Draw path: click points, snaps to corners and edges'],
  ['Enter', 'Finish the drawn path (or double-click)'],
  ['Bksp', 'Remove the last drawn point'],
  ['Del', 'Delete the selected seam'],
  ['Esc', 'Cancel drawing · clear selection'],
  ['Drag', 'Orbit · right-drag to pan · scroll to zoom'],
]

const isSamePoint = (a, b) => a !== undefined && a.every((value, i) => value === b[i])

export default function PartWorkspace({ part }) {
  const stl = useStl(part.file_path)
  const {
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
  } = usePlan(part)
  const info = useMemo(() => (stl.geometry ? describeGeometry(stl.geometry) : null), [stl.geometry])

  // Feature edges as a graph: what the viewer draws and what seams are traced along.
  const graph = useMemo(
    () => (info && info.triangles <= MAX_EDGE_TRIANGLES ? buildEdgeGraph(stl.geometry) : null),
    [stl.geometry, info],
  )

  const [mode, setMode] = useState('edges')
  const [tool, setTool] = useState('pick')
  const [selectedId, setSelectedId] = useState(null)
  // Pick tool: the edge under the cursor, and the saved seam at that spot (if any).
  const [hover, setHover] = useState(null)
  // Draw tool: points placed so far, and the snapped point under the cursor.
  const [draft, setDraft] = useState([])
  const [cursor, setCursor] = useState(null)
  // Parameter presets from the API; the first one is what new seams start with.
  const [presets, setPresets] = useState([])

  useEffect(() => {
    fetchPresets().then(setPresets, () => {})
  }, [])

  // New seams start weld-ready with the default preset instead of empty parameters.
  const withDefaults = (seam) => (presets[0] ? { ...seam, params: { ...presets[0].params } } : seam)
  const selectedSeam = plan.seams.find((seam) => seam.id === selectedId) ?? null
  // A counter makes repeated clicks on the same view re-fit the camera.
  const [command, setCommand] = useState({ view: 'iso', n: 0 })
  const setView = (view) => setCommand((current) => ({ view, n: current.n + 1 }))

  // How close (in file units) a point must be to a saved seam to count as on it.
  const matchRadius = info ? info.maxDim * 0.001 : 0

  // Which edge is under the pointer, and which saved seam (if any) runs through that spot.
  // `sample` is { point, pixel }: the hit in file coordinates, and file units per screen pixel.
  function locate(sample) {
    const segment = graph && sample ? nearestSegment(graph, sample.point, sample.pixel * PICK_PIXELS) : -1
    if (segment < 0) return null
    const onEdge = closestPointOnSegment(graph, segment, sample.point)
    return { segment, seamId: findSeamNear(plan.seams, onEdge, matchRadius) }
  }

  const snap = (sample) => snapPoint(graph, sample.point, sample.pixel * PICK_PIXELS)

  // What the cursor is over: a saved seam to select, or new seams shown as a preview.
  const hoverTarget = useMemo(() => {
    if (!hover) return null
    if (plan.seams.some((seam) => seam.id === hover.seamId)) return { seamId: hover.seamId }
    const preview = newSeamsAt(graph, plan.seams, hover.segment, matchRadius)
    return preview.length ? { preview } : null
  }, [hover, graph, plan.seams, matchRadius])

  function handleHover(sample) {
    if (tool === 'draw') return setCursor(sample ? snap(sample) : null)

    const next = locate(sample)
    // Keep the same state object while the cursor stays on one edge, so moving along it doesn't re-render.
    setHover((current) =>
      current?.segment === next?.segment && current?.seamId === next?.seamId ? current : next,
    )
  }

  function handlePick(sample) {
    if (tool === 'draw') {
      const { point } = snap(sample)
      // A double-click lands two clicks on the same spot; keep only one point.
      return setDraft((points) => (isSamePoint(points.at(-1), point) ? points : [...points, point]))
    }

    const target = locate(sample)
    if (!target) return setSelectedId(null)
    if (target.seamId) return setSelectedId(target.seamId)

    // One click can add several seams (a joint split around a rib); give each the next free id.
    const added = []
    for (const seam of newSeamsAt(graph, plan.seams, target.segment, matchRadius)) {
      added.push(withDefaults({ id: nextSeamId([...plan.seams, ...added]), ...seam }))
    }
    if (added.length === 0) return
    addSeams(added)
    setSelectedId(added[0].id)
  }

  // Turns the drawn points into a seam (needs at least two points).
  function finishDraft() {
    if (draft.length < 2) return
    const id = nextSeamId(plan.seams)
    addSeams([withDefaults({ id, points: draft, closed: false })])
    setDraft([])
    setSelectedId(id)
  }

  function switchTool(next) {
    setTool(next)
    setDraft([])
    setCursor(null)
    setHover(null)
  }

  // An Effect Event always sees the latest state, so the listener is attached only once.
  const onKeyDown = useEffectEvent((event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.target instanceof Element && event.target.closest('input, select, textarea')) return
    const key = event.key

    if (draft.length > 0) {
      if (key === 'Enter') return finishDraft()
      if (key === 'Backspace') return setDraft((points) => points.slice(0, -1))
      if (key === 'Escape') return setDraft([])
    }
    if ((key === 'Delete' || key === 'Backspace') && selectedId) {
      removeSeam(selectedId)
      return setSelectedId(null)
    }
    if (key === 'Escape') return setSelectedId(null)

    const nextTool = TOOL_BY_KEY[key.toLowerCase()]
    if (nextTool) return switchTool(nextTool)
    const view = VIEW_BY_KEY[key.toLowerCase()]
    if (view) setCommand((current) => ({ view, n: current.n + 1 }))
  })

  useEffect(() => {
    const listener = (event) => onKeyDown(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  const scale = UNITS[plan.units]
  const looksTooSmall = info !== null && plan.units === 'mm' && info.maxDim < 10

  let status = info ? `${info.triangles.toLocaleString()} triangles · Grid ${formatMm(info.gridCell * scale)}` : ''
  if (hoverTarget?.seamId) status = `Click to select ${hoverTarget.seamId}`
  if (hoverTarget?.preview) {
    const { preview } = hoverTarget
    const total = preview.reduce((sum, seam) => sum + seamLength(seam), 0) * scale
    const what = preview.length > 1 ? `${preview.length} seams` : 'seam'
    status = `Click to add ${what} · ${formatMm(total)}${preview[0].closed ? ' · closed loop' : ''}`
  }
  if (tool === 'draw') {
    const length = seamLength({ points: cursor ? [...draft, cursor.point] : draft, closed: false }) * scale
    const snapped = cursor && cursor.kind !== 'surface' ? ` · on ${cursor.kind}` : ''
    status =
      draft.length === 0
        ? `Draw path · click the first point${snapped}`
        : `Point ${draft.length} · ${formatMm(length)}${snapped} · Enter to finish · Bksp undo · Esc cancel`
  }

  return (
    <div className={styles.workspace}>
      <section
        className={styles.viewport}
        aria-label="3D viewport"
        data-picking={tool === 'draw' || hoverTarget ? 'true' : undefined}
      >
        {stl.status === 'ready' ? (
          <Suspense fallback={<p className={`label ${styles.overlay}`}>[ Preparing viewer ]</p>}>
            <Viewer
              geometry={stl.geometry}
              info={info}
              graph={graph}
              mode={mode}
              upAxis={plan.upAxis}
              command={command}
              seams={plan.seams}
              scale={scale}
              selectedId={selectedId}
              preview={hoverTarget?.preview ?? []}
              drawing={tool === 'draw' ? { points: draft, cursor } : null}
              onHover={handleHover}
              onPick={handlePick}
              onFinish={finishDraft}
              onMiss={() => setSelectedId(null)}
            />
          </Suspense>
        ) : null}

        {stl.status === 'loading' ? (
          <div className={styles.overlay}>
            <p className="label">[ Loading part · {stl.progress}% ]</p>
            <div className={styles.progress}>
              <span style={{ width: `${stl.progress}%` }} />
            </div>
          </div>
        ) : null}

        {stl.status === 'error' ? (
          <div className={styles.overlay} role="alert">
            <p className={`label ${styles.errorTitle}`}>[ Could not open this part ]</p>
            <p className="body-copy">{stl.error}</p>
            <Link to="/parts" className="btn btn-outline btn-sm">
              Back to parts
            </Link>
          </div>
        ) : null}

        {info ? (
          <>
            <div className={styles.toolbar}>
              <div className={styles.toolGroup}>
                <Segmented label="Seam tool" options={TOOLS} value={tool} onChange={switchTool} />
                <Segmented label="Camera view" options={VIEWS} onChange={setView} />
              </div>
              <Segmented label="Display mode" options={MODES} value={mode} onChange={setMode} />
            </div>
            <p className={`label ${styles.status}`}>{status}</p>
            <ul className={`label ${styles.legend}`} aria-label="Axis colours">
              {AXES.map((axis) => (
                <li key={axis} data-axis={axis}>
                  {axis}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <aside className={styles.inspector}>
        <div className={styles.block}>
          <Link to="/parts" className={`label ${styles.back}`}>
            ← All parts
          </Link>
          <h1 className={styles.name}>{part.name}</h1>
          <dl className={styles.facts}>
            <div className={styles.factRow}>
              <dt className="label">File</dt>
              <dd>{formatBytes(part.size_bytes)}</dd>
            </div>
            <div className={styles.factRow}>
              <dt className="label">Uploaded</dt>
              <dd>{formatDate(part.created_at)}</dd>
            </div>
          </dl>
          <ExportButton part={part} saved={saveState === 'saved'} />
        </div>

        <div className={styles.block}>
          <div className={styles.blockHead}>
            <h2 className="label marked">Seams</h2>
            <span className={`label ${styles.save}`} data-state={saveState} title={saveError ?? undefined}>
              {SAVE_LABELS[saveState]}
            </span>
          </div>
          {saveError ? (
            <div className="callout" role="alert">
              <p>{saveError}</p>
              {saveState === 'conflict' ? (
                <button type="button" className={`btn btn-outline btn-sm ${styles.reload}`} onClick={() => window.location.reload()}>
                  Reload latest
                </button>
              ) : null}
            </div>
          ) : null}
          {info && !graph ? (
            <p className="callout">This mesh is too dense for edge picking (over {MAX_EDGE_TRIANGLES.toLocaleString()} triangles).</p>
          ) : (
            <SeamList
              seams={plan.seams}
              selectedId={selectedId}
              scale={scale}
              warnings={warnings}
              onSelect={setSelectedId}
              onMove={moveSeam}
              onRemove={removeSeam}
            />
          )}
        </div>

        {selectedSeam ? (
          <div className={styles.block}>
            <SeamEditor
              seam={selectedSeam}
              seamCount={plan.seams.length}
              scale={scale}
              presets={presets}
              warnings={warnings.filter((w) => w.seam === selectedSeam.id).map((w) => w.message)}
              onChange={(changes) => updateSeam(selectedSeam.id, changes)}
              onApplyToAll={applyParamsToAll}
            />
          </div>
        ) : null}

        <div className={styles.block}>
          <h2 className="label marked">Geometry</h2>
          {info ? (
            <>
              <dl className={styles.facts}>
                <div className={styles.factRow}>
                  <dt className="label">Triangles</dt>
                  <dd>{info.triangles.toLocaleString()}</dd>
                </div>
                {AXES.map((axis, i) => (
                  <div key={axis} className={styles.factRow}>
                    <dt className="label" data-axis={axis}>
                      {axis}
                    </dt>
                    <dd>{formatMm(info.size[i] * scale)}</dd>
                  </div>
                ))}
              </dl>

              <label className={styles.field}>
                <span className="label">File units</span>
                <select value={plan.units} onChange={(event) => setUnits(event.target.value)}>
                  <option value="mm">Millimetres</option>
                  <option value="cm">Centimetres</option>
                  <option value="m">Metres</option>
                  <option value="in">Inches</option>
                </select>
              </label>
              {looksTooSmall ? (
                <p className="callout">
                  Under 10 mm across. If this file was exported in metres or inches, change the units.
                </p>
              ) : null}

              <div className={styles.field}>
                <span className="label">Up axis</span>
                <Segmented label="Up axis" options={UP_AXES} value={plan.upAxis} onChange={setUpAxis} />
              </div>
            </>
          ) : (
            <p className={`label ${styles.muted}`}>{stl.status === 'error' ? 'Unavailable' : 'Measuring…'}</p>
          )}
        </div>

        <div className={`${styles.block} ${styles.shortcuts}`}>
          <h2 className="label marked">Shortcuts</h2>
          <dl className={styles.facts}>
            {SHORTCUTS.map(([key, action]) => (
              <div key={key} className={styles.factRow}>
                <dt>
                  <kbd>{key}</kbd>
                </dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </div>
  )
}
