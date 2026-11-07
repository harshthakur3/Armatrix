import { supabase } from './supabase.js'

const API_URL = import.meta.env.VITE_API_URL
if (!API_URL) throw new Error('Missing VITE_API_URL. See .env.example.')

// Calls the Node API as the signed-in user: it verifies this token on every protected route.
export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const payload = await response.json().catch(() => ({})) // 204 No Content has no body
  if (!response.ok) {
    const error = new Error(payload.error?.message ?? `Request failed (${response.status}).`)
    error.status = response.status // e.g. 409 when the part was saved elsewhere
    error.details = payload.error?.details ?? [] // e.g. the seams that block an export
    throw error
  }
  return payload
}
