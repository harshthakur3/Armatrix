import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  BufferGeometry,
  Color,
  CurvePath,
  DoubleSide,
  Float32BufferAttribute,
  LineCurve3,
  TubeGeometry,
  Vector3,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { weldPath } from '../lib/seams.js'

// Palette swatches from the asset pack.
const COLORS = {
  background: '#0E1600',
  part: '#ABABA5',
  edge: '#141E00',
  gridMajor: '#455B32',
  gridMinor: '#192600',
  sky: '#F6F6EE',
  ground: '#141E00',
  seam: '#E9B475',
  seamSelected: '#E97F01',
  preview: '#F6F6EE',
  unwelded: '#93938D',
}

// Axis colours; the workspace legend uses the same swatches via CSS.
const AXIS_COLORS = { x: '#E97F01', y: '#628047', z: '#F6F6EE' }

// Camera directions in world space (Y is up on screen).
const VIEW_DIRECTIONS = {
  iso: [1, 0.75, 1],
  top: [0, 1, 0.0001],
  front: [0, 0, 1],
  right: [1, 0, 0],
}

// Most CAD tools export Z-up; three.js is Y-up. Rotating the part keeps file coordinates intact.
const UP_ROTATION = { z: [-Math.PI / 2, 0, 0], y: [0, 0, 0] }

function Headlight() {
  const light = useRef(null)
  // Light from the viewer's position so every face stays readable while orbiting.
  useFrame(({ camera }) => light.current.position.copy(camera.position))
  return <directionalLight ref={light} intensity={1.6} />
}

const AXIS_VERTEX_COLORS = ['x', 'x', 'y', 'y', 'z', 'z'].flatMap((axis) => new Color(AXIS_COLORS[axis]).toArray())

// File-space X/Y/Z triad at the part's minimum corner, so the axes match the exported coordinates.
function Axes({ info }) {
  const geometry = useMemo(() => {
    const [x, y, z] = info.min
    const l = info.maxDim * 0.2
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute([x, y, z, x + l, y, z, x, y, z, x, y + l, z, x, y, z, x, y, z + l], 3))
    g.setAttribute('color', new Float32BufferAttribute(AXIS_VERTEX_COLORS, 3))
    return g
  }, [info])
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <lineSegments geometry={geometry} renderOrder={1}>
      <lineBasicMaterial vertexColors depthTest={false} />
    </lineSegments>
  )
}

// A seam drawn as a weld bead (tube) along its path, with a ball marking where the torch starts.
function SeamPath({ points, closed, radius, color, marker = true }) {
  const geometry = useMemo(() => {
    const path = new CurvePath()
    const v = points.map((p) => new Vector3(...p))
    for (let i = 1; i < v.length; i++) path.add(new LineCurve3(v[i - 1], v[i]))
    if (closed) path.add(new LineCurve3(v.at(-1), v[0]))
    return new TubeGeometry(path, Math.max(path.curves.length * 4, 8), radius, 8, closed)
  }, [points, closed, radius])
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <>
      <mesh geometry={geometry}>
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {marker ? (
        <mesh position={points[0]}>
          <sphereGeometry args={[radius * 2.2, 16, 12]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ) : null}
    </>
  )
}

// A saved seam: the welded stretch as a bead; if trimmed, the rest of the joint as a thin grey line.
function SeamBead({ seam, scale, radius, color }) {
  const weld = useMemo(() => weldPath(seam, scale), [seam, scale])
  return (
    <>
      {weld !== seam ? (
        <SeamPath points={seam.points} closed={false} radius={radius * 0.35} color={COLORS.unwelded} marker={false} />
      ) : null}
      {weld.points.length >= 2 ? <SeamPath points={weld.points} closed={weld.closed} radius={radius} color={color} /> : null}
    </>
  )
}

// The path being drawn by hand: placed points, then a rubber band to the snapped cursor.
function Drawing({ drawing, radius }) {
  const { points, cursor } = drawing
  const path = cursor ? [...points, cursor.point] : points
  return (
    <>
      {path.length >= 2 ? (
        <SeamPath points={path} closed={false} radius={radius * 0.8} color={COLORS.seamSelected} />
      ) : null}
      {cursor ? (
        // Bigger orange marker when snapped to a corner or edge, small sand dot on a plain surface.
        <mesh position={cursor.point}>
          <sphereGeometry args={[radius * (cursor.kind === 'surface' ? 1.5 : 2.6), 16, 12]} />
          <meshBasicMaterial color={cursor.kind === 'surface' ? COLORS.preview : COLORS.seamSelected} toneMapped={false} />
        </mesh>
      ) : null}
    </>
  )
}

function Part({ geometry, info, graph, mode, upAxis, seams, scale, selectedId, preview, drawing, onHover, onPick, onFinish }) {
  // Feature edges come from the seam graph, so what you see is exactly what you can pick.
  const edgeLines = useMemo(() => {
    if (!graph) return null
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(graph.positions, 3))
    return g
  }, [graph])
  useEffect(() => () => edgeLines?.dispose(), [edgeLines])

  const canvasHeight = useThree((s) => s.size.height)
  // A pointer hit as the workspace needs it: the point in the STL file's own coordinates
  // (the mesh's local space), and how many file units one screen pixel spans at that depth,
  // so picking stays about the same size on screen at any zoom level.
  const sample = (event) => ({
    point: event.object.worldToLocal(event.point.clone()).toArray(),
    pixel: (2 * event.distance * Math.tan((event.camera.fov * Math.PI) / 360)) / canvasHeight,
  })
  const radius = info.maxDim * 0.005
  const [cx, cy, cz] = info.center

  return (
    <group rotation={UP_ROTATION[upAxis]}>
      <group position={[-cx, -cy, -cz]}>
        <mesh
          geometry={geometry}
          onPointerMove={(event) => onHover(sample(event))}
          onPointerOut={() => onHover(null)}
          onClick={(event) => {
            // Ignore the click that ends an orbit drag.
            if (event.delta < 5) onPick(sample(event))
          }}
          onDoubleClick={onFinish}
        >
          {/* Double-sided so meshes with flipped normals still render solid. */}
          <meshStandardMaterial
            color={COLORS.part}
            metalness={0.2}
            roughness={0.65}
            side={DoubleSide}
            wireframe={mode === 'wire'}
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
          />
        </mesh>
        {mode === 'edges' && edgeLines ? (
          <lineSegments geometry={edgeLines}>
            <lineBasicMaterial color={COLORS.edge} />
          </lineSegments>
        ) : null}

        {seams.map((seam) => (
          <SeamBead
            key={seam.id}
            seam={seam}
            scale={scale}
            radius={seam.id === selectedId ? radius * 1.4 : radius}
            color={seam.id === selectedId ? COLORS.seamSelected : COLORS.seam}
          />
        ))}
        {preview.map((seam, i) => (
          <SeamPath key={i} points={seam.points} closed={seam.closed} radius={radius * 0.7} color={COLORS.preview} />
        ))}
        {drawing ? <Drawing drawing={drawing} radius={radius} /> : null}

        <Axes info={info} />
      </group>
    </group>
  )
}

function Floor({ info, upAxis }) {
  const height = upAxis === 'z' ? info.size[2] : info.size[1]
  const cells = Math.ceil((info.maxDim * 1.6) / info.gridCell)
  return (
    <gridHelper
      args={[cells * info.gridCell, cells, COLORS.gridMajor, COLORS.gridMinor]}
      position={[0, -height / 2 - info.maxDim * 0.001, 0]}
    />
  )
}

function Controls({ radius, command }) {
  // get() reads the live three.js state; camera and controls are mutated imperatively by design.
  const get = useThree((s) => s.get)
  const controlsRef = useRef(null)

  useEffect(() => {
    const { camera, gl, invalidate } = get()
    const controls = new OrbitControls(camera, gl.domElement)
    controls.enableDamping = true
    controls.addEventListener('change', invalidate)
    controlsRef.current = controls
    return () => {
      controls.removeEventListener('change', invalidate)
      controls.dispose()
      controlsRef.current = null
    }
  }, [get])

  // With frameloop="demand", damping keeps requesting frames until the motion settles.
  useFrame(() => controlsRef.current?.update())

  useEffect(() => {
    const controls = controlsRef.current
    const { camera, invalidate } = get()
    const direction =
      command.view === 'fit'
        ? camera.position.clone().sub(controls.target).normalize()
        : new Vector3(...VIEW_DIRECTIONS[command.view]).normalize()

    // Fit the bounding sphere inside whichever field of view (vertical or horizontal) is narrower.
    const vFov = (camera.fov * Math.PI) / 180
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)
    const distance = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.1

    camera.position.copy(direction.multiplyScalar(distance))
    camera.near = distance / 100
    camera.far = distance * 100
    camera.updateProjectionMatrix()
    controls.target.set(0, 0, 0)
    controls.minDistance = radius * 0.05
    controls.maxDistance = distance * 10
    controls.update()
    invalidate()
  }, [command, radius, get])

  return null
}

export default function Viewer({ info, upAxis, command, onMiss, ...partProps }) {
  return (
    // Renders only when something changes, so an idle viewer costs no GPU time.
    <Canvas frameloop="demand" dpr={[1, 2]} camera={{ fov: 35 }} gl={{ antialias: true }} onPointerMissed={onMiss}>
      <color attach="background" args={[COLORS.background]} />
      <hemisphereLight args={[COLORS.sky, COLORS.ground, 0.9]} />
      <Headlight />
      <Part info={info} upAxis={upAxis} {...partProps} />
      <Floor info={info} upAxis={upAxis} />
      <Controls radius={info.radius} command={command} />
    </Canvas>
  )
}
