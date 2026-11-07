import { useState, useTransition } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/useAuth.js'
import Logo from '../../components/Logo.jsx'
import Pins from '../../components/Pins.jsx'
import { supabase } from '../../lib/supabase.js'
import styles from './AuthPage.module.css'

const COPY = {
  signin: {
    title: 'Sign in',
    subtitle: 'Open your parts and weld plans.',
    submit: 'Sign in',
    pending: 'Signing in…',
    switchPrompt: 'New here?',
    switchLabel: 'Create an account',
  },
  signup: {
    title: 'Create account',
    subtitle: 'Your parts and plans stay private to you.',
    submit: 'Create account',
    pending: 'Creating account…',
    switchPrompt: 'Already have an account?',
    switchLabel: 'Sign in',
  },
}

const STEPS = ['Upload', 'Select seams', 'Set parameters', 'Export']

const MIN_PASSWORD_LENGTH = 6

export default function AuthPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const mode = searchParams.get('mode') === 'signup' ? 'signup' : 'signin'
  const copy = COPY[mode]

  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState(null) // { kind: 'error' | 'notice', text }

  const redirectTo = location.state?.from ?? '/parts'
  if (user) return <Navigate to={redirectTo} replace />

  function switchMode(next) {
    setMessage(null)
    setSearchParams({ mode: next }, { replace: true, state: location.state })
  }

  function handleSubmit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email')).trim()
    const password = String(form.get('password'))
    setMessage(null)

    startTransition(async () => {
      const { data, error } =
        mode === 'signup'
          ? await supabase.auth.signUp({ email, password })
          : await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        setMessage({ kind: 'error', text: error.message })
      } else if (!data.session) {
        // With email confirmation enabled, sign-up returns no session until the link is clicked.
        setMessage({ kind: 'notice', text: 'Check your inbox to confirm your email, then sign in.' })
      } else {
        navigate(redirectTo, { replace: true })
      }
    })
  }

  return (
    <div className={styles.page}>
      <aside className={`panel ${styles.brand}`}>
        <Pins />
        <Logo height={30} />
        <div className={styles.brandBody}>
          <p className="label tag">[ Weld Seam Planner ]</p>
          <p className={styles.quote}>Where the welds go, how each is made, and in what order.</p>
        </div>
        <ol className={styles.brandSteps}>
          {STEPS.map((step, i) => (
            <li key={step} className="label">
              <span>0{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </aside>

      <main className={styles.main}>
        <div className={styles.mobileLogo}>
          <Logo height={28} />
        </div>

        <div className={styles.card}>
          <div className={styles.tabs} role="group" aria-label="Choose sign in or sign up">
            <button
              type="button"
              className="label"
              aria-pressed={mode === 'signin'}
              onClick={() => switchMode('signin')}
            >
              Sign in
            </button>
            <button
              type="button"
              className="label"
              aria-pressed={mode === 'signup'}
              onClick={() => switchMode('signup')}
            >
              Sign up
            </button>
          </div>

          <header className={styles.header}>
            <h1 className="section-title">{copy.title}</h1>
            <p className="body-copy">{copy.subtitle}</p>
          </header>

          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span className="label">Email</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                required
              />
            </label>

            <label className={styles.field}>
              <span className="label">Password</span>
              <input
                name="password"
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={mode === 'signup' ? MIN_PASSWORD_LENGTH : undefined}
                placeholder={mode === 'signup' ? `At least ${MIN_PASSWORD_LENGTH} characters` : ''}
                required
              />
            </label>

            {message ? (
              <p
                className={message.kind === 'error' ? 'callout' : `callout ${styles.notice}`}
                role={message.kind === 'error' ? 'alert' : 'status'}
              >
                {message.text}
              </p>
            ) : null}

            <button type="submit" className="btn btn-solid" disabled={isPending}>
              {isPending ? copy.pending : copy.submit}
              <span className="btn-arrow" aria-hidden="true">
                →
              </span>
            </button>
          </form>

          <p className={`body-copy ${styles.switch}`}>
            {copy.switchPrompt}{' '}
            <button type="button" onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}>
              {copy.switchLabel}
            </button>
          </p>
        </div>

        <Link to="/" className={`label ${styles.back}`}>
          ← Back to home
        </Link>
      </main>
    </div>
  )
}
