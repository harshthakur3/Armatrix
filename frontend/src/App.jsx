import { lazy, Suspense } from 'react'
import { preconnect } from 'react-dom'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { useAuth } from './auth/useAuth.js'
import AppLayout from './components/AppLayout.jsx'
import Landing from './pages/Landing/Landing.jsx'
import { loadAuthPage, loadPartPage, loadPartsPage } from './pages/loaders.js'

// Pages off the landing path load on demand to keep the first paint small.
const AuthPage = lazy(loadAuthPage)
const PartsPage = lazy(loadPartsPage)
const PartPage = lazy(loadPartPage)

function ProtectedLayout() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return null
  if (!user) return <Navigate to="/auth?mode=signin" state={{ from: location.pathname }} replace />
  return <AppLayout />
}

export default function App() {
  // Every auth and storage call goes to Supabase: open the connection early.
  preconnect(import.meta.env.VITE_SUPABASE_URL)

  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/parts" element={<PartsPage />} />
          <Route path="/parts/:partId" element={<PartPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
