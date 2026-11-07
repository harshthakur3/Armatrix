import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { supabase } from './supabase.js'

const loader = new STLLoader()

// Downloads through a short-lived signed URL (instead of storage.download) so progress can be shown.
export async function downloadStl(filePath, { signal, onProgress }) {
  const { data, error } = await supabase.storage.from('stl-files').createSignedUrl(filePath, 60)
  if (error) throw new Error('The file for this part could not be found in storage.')

  const response = await fetch(data.signedUrl, { signal })
  if (!response.ok) throw new Error(`Download failed (HTTP ${response.status}).`)

  const total = Number(response.headers.get('content-length'))
  if (!total || !response.body) return response.arrayBuffer()

  // Collect chunks rather than pre-sizing a buffer: a compressed response can exceed content-length.
  const reader = response.body.getReader()
  const chunks = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    onProgress(Math.min(received / total, 1))
  }
  return new Blob(chunks).arrayBuffer()
}

// Parses binary or ASCII STL and rejects anything that isn't usable geometry.
export function parseStl(buffer) {
  let geometry
  try {
    geometry = loader.parse(buffer)
  } catch {
    throw new Error('This file could not be read as an STL.')
  }

  if (!geometry.getAttribute('position')?.count) {
    geometry.dispose()
    throw new Error('No triangles found. The file may be empty or not an STL.')
  }

  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  if (!Number.isFinite(geometry.boundingSphere.radius)) {
    geometry.dispose()
    throw new Error('The file contains invalid coordinates.')
  }
  return geometry
}

// A "nice" grid spacing (1, 2 or 5 × 10^n) giving roughly ten cells across the part.
function gridCellFor(maxDim) {
  const raw = maxDim / 10
  const power = 10 ** Math.floor(Math.log10(raw))
  const m = raw / power
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * power
}

// Everything the viewer and inspector need, measured once in the file's own coordinates.
export function describeGeometry(geometry) {
  const { min, max } = geometry.boundingBox
  const size = [max.x - min.x, max.y - min.y, max.z - min.z]
  const maxDim = Math.max(...size)
  return {
    triangles: geometry.getAttribute('position').count / 3,
    min: [min.x, min.y, min.z],
    size,
    center: [(min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2],
    maxDim,
    radius: geometry.boundingSphere.radius,
    gridCell: gridCellFor(maxDim),
  }
}
