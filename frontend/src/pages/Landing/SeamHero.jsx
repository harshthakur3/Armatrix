import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import {
  BoxGeometry,
  EdgesGeometry,
  ExtrudeGeometry,
  LineCurve3,
  Shape,
  TubeGeometry,
  Vector3,
} from 'three'

// An L-bracket with a gusset: base plate, upright wall, triangular rib.
// One scene unit = 1 metre, so seam lengths read as real millimetres in the HUD.
const PLATE = 0.1
const base = new BoxGeometry(2.4, PLATE, 1.6)
const wall = new BoxGeometry(PLATE, 1.4, 1.6)
const gusset = (() => {
  const shape = new Shape()
  shape.moveTo(-1.1, PLATE)
  shape.lineTo(-0.1, PLATE)
  shape.lineTo(-1.1, 1.1)
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, { depth: PLATE, bevelEnabled: false })
  geometry.translate(0, 0, -PLATE / 2)
  return geometry
})()

// Fillet seams sit in the inside corner of each joint, welded in this order.
const FILLET = 0.02
// The wall-to-base joint is two seams: the rib (z = ±PLATE/2) sits across it and blocks the torch.
const SEAMS = [
  [new Vector3(-1.1 + FILLET, PLATE + FILLET, -0.8), new Vector3(-1.1 + FILLET, PLATE + FILLET, -PLATE / 2)],
  [new Vector3(-1.1 + FILLET, PLATE + FILLET, PLATE / 2), new Vector3(-1.1 + FILLET, PLATE + FILLET, 0.8)],
  [new Vector3(-1.1, PLATE + FILLET, PLATE / 2 + FILLET), new Vector3(-0.1, PLATE + FILLET, PLATE / 2 + FILLET)],
  [new Vector3(-1.1 + FILLET, PLATE, PLATE / 2 + FILLET), new Vector3(-1.1 + FILLET, 1.1, PLATE / 2 + FILLET)],
].map(([from, to]) => new LineCurve3(from, to))

const TUBE_SEGMENTS = 64
const TUBE_SIDES = 8
const TRIANGLES_PER_SEGMENT = TUBE_SIDES * 6

const WELD_SECONDS = 2.2
const GAP_SECONDS = 0.35
const HOLD_SECONDS = 1.8
const STEP_SECONDS = WELD_SECONDS + GAP_SECONDS
const CYCLE_SECONDS = SEAMS.length * STEP_SECONDS + HOLD_SECONDS

// Thick tube for the weld bead (revealed by draw range), thin tube for the planned path.
const WELD_TUBES = SEAMS.map((curve) => new TubeGeometry(curve, TUBE_SEGMENTS, 0.022, TUBE_SIDES, false))
const PLANNED_TUBES = SEAMS.map((curve) => new TubeGeometry(curve, 1, 0.012, TUBE_SIDES, false))

// Dark plates on a green field with signal-orange seams, as in the armatrix.com illustrations.
const COLORS = {
  plate: '#192600',
  edge: '#C5C5BD',
  gridMajor: '#628047',
  gridMinor: '#3D4F2C',
  weld: '#E97F01',
  planned: '#E9B475',
  tip: '#F6F6EE',
}

function Plate({ geometry, position }) {
  const edges = useMemo(() => new EdgesGeometry(geometry), [geometry])
  return (
    <group position={position}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color={COLORS.plate} roughness={0.65} metalness={0.35} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={COLORS.edge} transparent opacity={0.4} />
      </lineSegments>
    </group>
  )
}

function Bracket({ animate }) {
  const group = useRef(null)
  const welds = useRef([])
  const tip = useRef(null)
  const glow = useRef(null)

  useFrame(({ clock }) => {
    if (!animate) return
    const t = clock.elapsedTime % CYCLE_SECONDS
    let activePoint = null

    SEAMS.forEach((curve, i) => {
      const progress = Math.min(Math.max((t - i * STEP_SECONDS) / WELD_SECONDS, 0), 1)
      const segments = Math.floor(progress * TUBE_SEGMENTS)
      welds.current[i].geometry.setDrawRange(0, segments * TRIANGLES_PER_SEGMENT)
      if (progress > 0 && progress < 1) activePoint = curve.getPoint(progress)
    })

    tip.current.visible = activePoint !== null
    glow.current.visible = activePoint !== null
    if (activePoint) {
      tip.current.position.copy(activePoint)
      glow.current.position.copy(activePoint)
      glow.current.intensity = 2.5 + Math.random() * 1.5
    }

    group.current.rotation.y = -0.55 + Math.sin(clock.elapsedTime * 0.18) * 0.35
  })

  return (
    <group ref={group} position={[0.2, -0.45, 0]} rotation={[0, -0.55, 0]}>
      <Plate geometry={base} position={[0, PLATE / 2, 0]} />
      <Plate geometry={wall} position={[-1.15, PLATE + 0.7, 0]} />
      <Plate geometry={gusset} position={[0, 0, 0]} />

      {PLANNED_TUBES.map((geometry, i) => (
        <mesh key={`planned-${i}`} geometry={geometry}>
          <meshBasicMaterial color={COLORS.planned} transparent opacity={0.35} />
        </mesh>
      ))}
      {WELD_TUBES.map((geometry, i) => (
        <mesh key={`weld-${i}`} ref={(mesh) => (welds.current[i] = mesh)} geometry={geometry}>
          <meshBasicMaterial color={COLORS.weld} toneMapped={false} />
        </mesh>
      ))}

      <mesh ref={tip} visible={false}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshBasicMaterial color={COLORS.tip} toneMapped={false} />
      </mesh>
      <pointLight ref={glow} color={COLORS.weld} distance={1.6} decay={1.5} visible={false} />

      <gridHelper args={[8, 32, COLORS.gridMajor, COLORS.gridMinor]} position={[-0.35, -0.001, 0]} />
    </group>
  )
}

export default function SeamHero() {
  // Respect reduced motion: show every seam already welded and render a single frame.
  const [animate] = useState(
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  return (
    <Canvas
      camera={{ position: [3.4, 2.6, 4.4], fov: 34 }}
      dpr={[1, 2]}
      frameloop={animate ? 'always' : 'demand'}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 5, 4]} intensity={2} />
      <directionalLight position={[-4, 2, -3]} intensity={0.35} color="#628047" />
      <Bracket animate={animate} />
    </Canvas>
  )
}
