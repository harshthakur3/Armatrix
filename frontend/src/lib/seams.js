import { EdgesGeometry } from 'three'

// Faces meeting at more than this angle form a "feature edge": plate outlines and joint lines.
const FEATURE_ANGLE = 30
// A traced seam continues through a vertex only if the path turns less than this.
const MAX_TURN_COS = Math.cos((35 * Math.PI) / 180)
// Above this, building the edge graph would block the page for too long.
export const MAX_EDGE_TRIANGLES = 400_000

// Small vector helpers on [x, y, z] arrays.
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (v) => Math.sqrt(dot(v, v))
const unit = (v) => {
  const l = len(v) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
const round3 = (v) => Math.round(v * 1000) / 1000

/**
 * The part's feature edges as a graph, in file coordinates.
 *   positions  Float32Array of segment endpoints, ready to draw
 *   vertices   [[x, y, z]] unique corner points
 *   segments   [[a, b]] vertex ids for each edge
 *   touching   for each vertex id, the segments that meet there
 */
export function buildEdgeGraph(geometry) {
  const edges = new EdgesGeometry(geometry, FEATURE_ANGLE)
  const positions = edges.getAttribute('position').array
  edges.dispose()

  const idByKey = new Map()
  const vertices = []
  const vertexId = (i) => {
    const point = [positions[i], positions[i + 1], positions[i + 2]]
    // STL repeats every corner per triangle; rounding merges the copies into one vertex.
    const key = point.map((v) => Math.round(v * 1000)).join()
    if (!idByKey.has(key)) {
      idByKey.set(key, vertices.length)
      vertices.push(point)
    }
    return idByKey.get(key)
  }

  const segments = []
  for (let i = 0; i < positions.length; i += 6) {
    const a = vertexId(i)
    const b = vertexId(i + 3)
    if (a !== b) segments.push([a, b])
  }

  const touching = vertices.map(() => [])
  segments.forEach(([a, b], s) => {
    touching[a].push(s)
    touching[b].push(s)
  })

  return { positions, vertices, segments, touching }
}

// Position of `point` along segment a→b: 0 at a, 1 at b (clamped).
function along(point, a, b) {
  const ab = sub(b, a)
  return Math.max(0, Math.min(1, dot(sub(point, a), ab) / (dot(ab, ab) || 1)))
}

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const midpoint = (a, b) => lerp(a, b, 0.5)

function distanceToSegment(point, a, b) {
  return len(sub(point, lerp(a, b, along(point, a, b))))
}

// Index of the feature edge closest to `point`, or -1 if none is within `maxDistance`.
// When edges overlap (a wall's short bottom edge lying on a base plate's long edge),
// the shorter one wins: it is the more specific joint.
export function nearestSegment(graph, point, maxDistance) {
  const tie = maxDistance * 1e-3
  let best = -1
  let bestDistance = maxDistance
  let bestLength = Infinity
  for (let s = 0; s < graph.segments.length; s++) {
    const [a, b] = graph.segments[s].map((id) => graph.vertices[id])
    const d = distanceToSegment(point, a, b)
    const length = len(sub(b, a))
    if (d < bestDistance - tie || (d <= bestDistance + tie && length < bestLength)) {
      bestDistance = Math.min(d, bestDistance)
      bestLength = length
      best = s
    }
  }
  return best
}

/**
 * For drawing seams by hand: snaps a point on the surface to the nearest corner,
 * else to the nearest point on a feature edge, else leaves it where it is.
 */
export function snapPoint(graph, point, radius) {
  if (graph) {
    let corner = null
    let cornerDistance = radius
    for (const v of graph.vertices) {
      const d = len(sub(v, point))
      if (d < cornerDistance) {
        cornerDistance = d
        corner = v
      }
    }
    if (corner) return { point: corner.map(round3), kind: 'corner' }

    const s = nearestSegment(graph, point, radius)
    if (s >= 0) return { point: closestPointOnSegment(graph, s, point).map(round3), kind: 'edge' }
  }
  return { point: point.map(round3), kind: 'surface' }
}

// The point on feature edge `s` closest to `point` (snaps the cursor onto the edge).
export function closestPointOnSegment(graph, s, point) {
  const [a, b] = graph.segments[s].map((id) => graph.vertices[id])
  return lerp(a, b, along(point, a, b))
}


// From vertex `to` (arrived at from `from`), keep taking the straightest unused edge.
// Returns the vertices visited, and whether the walk came back round to `stopAt`.
function walk(graph, from, to, used, stopAt) {
  const path = [to]
  let prev = from
  let current = to
  for (;;) {
    const heading = unit(sub(graph.vertices[current], graph.vertices[prev]))
    let next = -1
    let bestCos = MAX_TURN_COS
    for (const s of graph.touching[current]) {
      if (used.has(s)) continue
      const [a, b] = graph.segments[s]
      const candidate = a === current ? b : a
      const cos = dot(heading, unit(sub(graph.vertices[candidate], graph.vertices[current])))
      if (cos > bestCos) {
        bestCos = cos
        next = s
      }
    }
    if (next < 0) return { path, closed: false }

    used.add(next)
    const [a, b] = graph.segments[next]
    prev = current
    current = a === current ? b : a
    if (current === stopAt) return { path, closed: true }
    path.push(current)
  }
}

/**
 * Splits a joint line wherever another part meets it, and drops the sections that part sits on.
 *
 * Example: a rib standing across a wall-to-base joint. The rib's corners lie on the joint line,
 * so the line is cut there; the section between the cuts runs along the rib's own edge, meaning
 * the rib covers it and the torch can't reach it. One 160 mm line becomes two seams.
 */
function splitAroundParts(graph, points, used, tolerance) {
  const liesOn = (point, s) => {
    const [a, b] = graph.segments[s]
    return distanceToSegment(point, graph.vertices[a], graph.vertices[b]) < tolerance
  }

  // 1. Cut the line at every other edge vertex that lies inside one of its segments.
  const pieces = [[points[0]]]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const cuts = graph.vertices
      .filter((v) => distanceToSegment(v, a, b) < tolerance)
      .map((v) => ({ v, t: along(v, a, b) }))
      .filter(({ t }) => t > 1e-3 && t < 1 - 1e-3)
      .sort((p, q) => p.t - q.t)
    for (const { v } of cuts) {
      pieces.at(-1).push(v)
      pieces.push([v])
    }
    pieces.at(-1).push(b)
  }

  // 2. Nothing cut the line: keep it whole (another plate's edge may simply coincide with it).
  if (pieces.length === 1) return pieces

  // 3. Keep only sections that don't run along another part's edge.
  const open = pieces.filter((piece) => {
    const mid = midpoint(piece[0], piece[1])
    return !graph.segments.some((_, s) => !used.has(s) && liesOn(mid, s))
  })

  // 4. Everything "covered" means the same edge is simply stored twice (common in CAD exports,
  //    where one face splits an edge its neighbour keeps whole). Nothing blocks it: keep it whole.
  return open.length > 0 ? open : [points]
}

/**
 * Turns one clicked edge into the seams along that joint. Follows connected edges in both
 * directions until the path turns sharply, then splits it around parts that block the torch.
 * Returns a list of seams: usually one, two when something sits across the joint, and a single
 * closed loop for round joints such as a pipe on a plate.
 */
export function traceSeam(graph, startSegment, tolerance) {
  const [a, b] = graph.segments[startSegment]
  const used = new Set([startSegment])

  const forward = walk(graph, a, b, used, a)
  if (forward.closed) {
    const points = [a, ...forward.path].map((id) => graph.vertices[id].map(round3))
    return [{ points, closed: true }]
  }

  const ids = [...walk(graph, b, a, used, -1).path.reverse(), ...forward.path]
  return splitAroundParts(graph, ids.map((id) => graph.vertices[id]), used, tolerance).map((piece) => ({
    points: piece.map((p) => p.map(round3)),
    closed: false,
  }))
}

// The seams a click on `segment` would add, leaving out any that are already in `seams`.
export function newSeamsAt(graph, seams, segment, tolerance) {
  return traceSeam(graph, segment, tolerance).filter(
    ({ points }) => !findSeamNear(seams, midpoint(points[0], points[1]), tolerance),
  )
}

// The stretch of an open path between `start` and `end` (distances along it, in file units).
function cutPath(points, start, end) {
  const out = []
  let walked = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const length = len(sub(b, a))
    const from = walked
    walked += length
    // Skip segments wholly before the start or after the end (touching counts as outside,
    // so a trim landing exactly on a corner doesn't add a zero-length piece).
    if (walked <= start || from >= end || length === 0) continue
    if (out.length === 0) out.push(lerp(a, b, (Math.max(start, from) - from) / length))
    out.push(lerp(a, b, (Math.min(end, walked) - from) / length))
  }
  return out
}

/**
 * The part of a seam that actually gets welded, after its start/end trim (in mm).
 * `scale` is mm per file unit. Loops are always welded whole. Returns the seam itself when untrimmed.
 */
export function weldPath(seam, scale) {
  const { start_mm = 0, end_mm = 0 } = seam.trim ?? {}
  if (seam.closed || (start_mm === 0 && end_mm === 0)) return seam
  const total = seamLength(seam)
  return { points: cutPath(seam.points, start_mm / scale, total - end_mm / scale), closed: false }
}

// Path length in file units, including the closing segment of a loop.
export function seamLength({ points, closed }) {
  let total = 0
  for (let i = 1; i < points.length; i++) total += len(sub(points[i], points[i - 1]))
  if (closed && points.length > 2) total += len(sub(points[0], points.at(-1)))
  return total
}

// Id of a saved seam whose path passes within `maxDistance` of `point`, else null.
export function findSeamNear(seams, point, maxDistance) {
  for (const seam of seams) {
    const { points, closed } = seam
    const count = closed ? points.length : points.length - 1
    for (let i = 0; i < count; i++) {
      if (distanceToSegment(point, points[i], points[(i + 1) % points.length]) < maxDistance) return seam.id
    }
  }
  return null
}

// S01, S02, ... never reusing a number, so ids stay stable after deletes.
export function nextSeamId(seams) {
  const highest = Math.max(0, ...seams.map((seam) => Number(seam.id.slice(1))))
  return `S${String(highest + 1).padStart(2, '0')}`
}
