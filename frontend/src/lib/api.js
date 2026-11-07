import { supabase } from './supabase.js'

const API_URL = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '')
if (!API_URL) throw new Error('Missing VITE_API_URL. See .env.example.')

function requestError(message, status, details = []) {
  const error = new Error(message)
  error.status = status
  error.details = Array.isArray(details) ? details : []
  return error
}

// Calls the Node API as the signed-in user: it verifies this token on every protected route.
export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  let response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw requestError('Cannot reach the server. It may be starting. Please try again.', 0)
  }

  if (response.status === 204) return {}
  let payload
  try {
    payload = await response.json()
  } catch {
    throw requestError(response.ok ? 'The server returned an unreadable response. Please try again.' : `Request failed (${response.status}). Please try again.`, response.status)
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw requestError('The server returned an unexpected response. Please try again.', response.status)
  }
  if (!response.ok) {
    throw requestError(payload.error?.message ?? `Request failed (${response.status}).`, response.status, payload.error?.details)
  }
  return payload
}
