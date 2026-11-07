import { Suspense } from 'react'
import { Outlet } from 'react-router'
import { useAuth } from '../auth/useAuth.js'
import { supabase } from '../lib/supabase.js'
import Logo from './Logo.jsx'
import styles from './AppLayout.module.css'

// Shell for every signed-in page: the top bar stays put while page code loads.
export default function AppLayout() {
  const { user } = useAuth()

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <Logo height={44} />
        <span className={`label ${styles.user}`}>{user.email}</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </div>
  )
}
