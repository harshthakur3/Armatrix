import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Catch hosting configuration mistakes during the build, before publishing a broken page.
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_API_URL']) {
      if (!env[name]?.trim()) throw new Error(`Missing ${name}. Set it in the hosting environment before building.`)
    }
    for (const name of ['VITE_SUPABASE_URL', 'VITE_API_URL']) {
      let url
      try { url = new URL(env[name].trim()) }
      catch { throw new Error(`${name} must be a valid HTTP(S) base URL.`) }
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${name} must use HTTP or HTTPS.`)
      if (name === 'VITE_API_URL' && url.pathname !== '/') throw new Error('VITE_API_URL must be the backend base URL without /api or another path.')
      if (process.env.VERCEL === '1' && (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
        throw new Error(`${name} must use a public HTTPS URL for a Vercel deployment.`)
      }
    }
  }
  return { plugins: [react()] }
})
