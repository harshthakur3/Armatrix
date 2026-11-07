import { api } from './api.js'
import { supabase } from './supabase.js'

const BUCKET = 'stl-files'
export const MAX_STL_MB = 50

// Returns a user-facing message, or null when the file can be uploaded.
export function validateStl(file) {
  if (!file.name.toLowerCase().endsWith('.stl')) return 'Only .stl files are supported.'
  if (file.size === 0) return 'This file is empty.'
  if (file.size > MAX_STL_MB * 1024 * 1024) return `Files must be ${MAX_STL_MB} MB or smaller.`
  return null
}

export async function listParts() {
  const { data, error } = await supabase
    .from('parts')
    .select('id, name, size_bytes, updated_at')
    // Most recently edited first: saving seams bumps updated_at, so the part you worked on rises to the top.
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data
}

// Row-level security scopes this to the signed-in user; another user's id returns null.
export async function getPart(id) {
  const { data, error } = await supabase
    .from('parts')
    .select('id, name, size_bytes, file_path, created_at, updated_at, plan')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

// Plans go through the API, which validates them before saving. Both return { warnings }.
// `version` is the part's updated_at when editing started; the API refuses (409) if it has moved on.
export const savePlan = (id, plan, version) =>
  api(`/api/parts/${id}/plan`, { method: 'PUT', body: plan, headers: { 'If-Match': version } })
export const validatePlan = (plan) => api('/api/plans/validate', { method: 'POST', body: plan })
export const fetchPresets = () => api('/api/presets').then((data) => data.presets)
export const fetchWeldJob = (id) => api(`/api/parts/${id}/weld-job`)
export const deletePart = (id) => api(`/api/parts/${id}`, { method: 'DELETE' })

// Files live under <user id>/ so the storage policies can scope them to their owner.
export async function uploadPart(file, userId) {
  const filePath = `${userId}/${crypto.randomUUID()}.stl`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file, { contentType: 'model/stl' })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('parts')
    .insert({ name: file.name, file_path: filePath, size_bytes: file.size })
    .select('id')
    .single()
  if (error) {
    // Don't leave an orphaned file behind when the row can't be created.
    await supabase.storage.from(BUCKET).remove([filePath])
    throw error
  }
  return data.id
}
