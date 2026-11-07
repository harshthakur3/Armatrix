import { createClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()

if (!url || !publishableKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. See .env.example.')
}

export const supabase = createClient(url, publishableKey)
