import { lazy, Suspense } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/useAuth.js'
import Logo from '../../components/Logo.jsx'
import Pins from '../../components/Pins.jsx'
import { loadAuthPage } from '../loaders.js'
import exampleJob from '../../assets/examples/bracket-weld-job.json'
import styles from './Landing.module.css'

// Three.js is heavy; load the 3D hero after the page shell has painted.
const SeamHero = lazy(() => import('./SeamHero.jsx'))

const WORKFLOW = [
  {
    no: '01',
    title: 'Upload the part',
    body: 'Load an .stl file. It is stored privately to your account, ready to reopen.',
  },
  {
    no: '02',
    title: 'Select seams',
    body: 'Pick the joints to weld directly on the 3D model.',
  },
  {
    no: '03',
    title: 'Set parameters',
    body: 'Process, current, voltage, travel speed and torch angle for every seam.',
  },
  {
    no: '04',
    title: 'Export the job',
    body: 'Download an ordered JSON weld job that a robot controller can consume.',
  },
]

const OUTPUT_TRAITS = [
  { title: 'Explicit units', body: 'Every length, speed and angle states its unit. Nothing is implied.' },
  { title: 'Ordered sequence', body: 'Seams carry their weld order, so the controller runs them as planned.' },
  { title: 'Self-contained', body: 'Paths and parameters live in the file. No viewer state is needed.' },
]

// Matches the animation: the rib splits the wall-to-base joint into two seams.
const HUD_SEAMS = [
  { id: 'S01', joint: 'Wall → Base', length: '750 mm' },
  { id: 'S02', joint: 'Wall → Base', length: '750 mm' },
  { id: 'S03', joint: 'Rib → Base', length: '1000 mm' },
  { id: 'S04', joint: 'Rib → Wall', length: '1000 mm' },
]

// Complete output from the backend's buildWeldJob for the animated bracket.
// Use the same JSON formatting as the planner's download.
const SAMPLE_JOB = JSON.stringify(exampleJob, null, 2)

function formatDocStamp(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `DOC . ${pad(date.getDate())} . ${pad(date.getMonth() + 1)} . ${pad(date.getFullYear() % 100)}`
}

// Stamped once per page load, like the datestamp on armatrix.com.
const DOC_STAMP = formatDocStamp(new Date())

const ARROW = (
  <span className="btn-arrow" aria-hidden="true">
    →
  </span>
)

export default function Landing() {
  const { user } = useAuth()
  const primaryTo = user ? '/parts' : '/auth?mode=signup'
  const primaryLabel = user ? 'Open planner' : 'Start planning'

  return (
    <>
      <section className={styles.hero}>
        <Pins />
        <header className={styles.nav}>
          <Logo height={44} />
          <nav className={styles.navLinks} aria-label="Primary">
            <a href="#workflow">Workflow</a>
            <a href="#output">Output</a>
          </nav>
          {user ? (
            <Link to="/parts" className="btn btn-outline btn-sm">
              Open planner
            </Link>
          ) : (
            <Link
              to="/auth?mode=signin"
              className="btn btn-outline btn-sm"
              onMouseEnter={loadAuthPage}
              onFocus={loadAuthPage}
            >
              Sign in
            </Link>
          )}
        </header>

        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <p className="label tag">[ Weld Seam Planner ]</p>
            <h1 className={styles.headline}>Plan every weld before the robot moves.</h1>
            <p className={`body-copy ${styles.lead}`}>
              Load a part, select the seams, set how each one is welded and in what order. Export
              a weld job your robot controller can run.
            </p>
            <div className={styles.heroActions}>
              <Link to={primaryTo} className="btn btn-solid">
                {primaryLabel}
                {ARROW}
              </Link>
              <a href="#workflow" className="btn btn-outline">
                How it works
                {ARROW}
              </a>
            </div>
          </div>

          <div
            className={`panel ${styles.viewport}`}
            role="img"
            aria-label="A 3D steel bracket with four weld seams being traced in sequence"
          >
            <div className={styles.viewportCanvas}>
              <Suspense fallback={null}>
                <SeamHero />
              </Suspense>
            </div>
            <div className={`label ${styles.hudTop}`} aria-hidden="true">
              <span>[ Live preview ]</span>
              <span>bracket_L.stl</span>
            </div>
            <ol className={styles.hudSeams} aria-hidden="true">
              {HUD_SEAMS.map((seam) => (
                <li key={seam.id} className="label">
                  <span className={styles.hudId}>{seam.id}</span>
                  <span>{seam.joint}</span>
                  <span className={styles.hudMeta}>{seam.length}</span>
                </li>
              ))}
            </ol>
            <Pins />
          </div>
        </div>
      </section>

      <main>
        <section id="workflow" className={styles.section}>
          <h2 className="section-title">Workflow</h2>
          <div className={styles.intro}>
            <p className={styles.statement}>From a raw part to a robot-ready weld job.</p>
            <p className={`body-copy ${styles.introBody}`}>
              The four steps every weld plan needs: where the welds go, how each is made, and in
              what order.
            </p>
          </div>
          <ol className={styles.steps}>
            {WORKFLOW.map((step) => (
              <li key={step.no} className={styles.step}>
                <span className={styles.stepNo}>{step.no}</span>
                <h3 className="label marked">{step.title}</h3>
                <p className="body-copy">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="output" className={`${styles.section} ${styles.output}`}>
          <div className={styles.outputCopy}>
            <h2 className="section-title">Output</h2>
            <p className={styles.statement}>A weld job a controller can read.</p>
            <ul className={styles.traits}>
              {OUTPUT_TRAITS.map((trait) => (
                <li key={trait.title}>
                  <h3 className="label marked">{trait.title}</h3>
                  <p className="body-copy">{trait.body}</p>
                </li>
              ))}
            </ul>
          </div>
          <figure className={`panel ${styles.code}`}>
            <figcaption className="label">
              <span>weld_job.json</span>
              <span>[ Full example ]</span>
            </figcaption>
            <pre tabIndex={0} aria-label="Complete example weld job JSON; scroll to read all four seams">
              <code>{SAMPLE_JOB}</code>
            </pre>
            <Pins />
          </figure>
        </section>

        <section className={styles.section}>
          <div className={`panel ${styles.cta}`}>
            <Pins />
            <h2 className={`section-title ${styles.ctaTitle}`}>Plan your first part</h2>
            <p className={`body-copy ${styles.ctaBody}`}>Parts and plans are private to your account.</p>
            <Link to={primaryTo} className="btn btn-solid">
              {user ? 'Open planner' : 'Create an account'}
              {ARROW}
            </Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <Logo height={28} />
          <span className={`label ${styles.stamp}`}>{DOC_STAMP}</span>
        </div>
        <dl className={styles.footerCols}>
          <div>
            <dt className="label">Project</dt>
            <dd>Weld Seam Planner</dd>
          </div>
          <div>
            <dt className="label">Stack</dt>
            <dd>React · Three.js · Supabase</dd>
          </div>
          <div>
            <dt className="label">Account</dt>
            <dd>
              <Link to={user ? '/parts' : '/auth?mode=signin'}>{user ? 'Open planner' : 'Sign in'}</Link>
            </dd>
          </div>
        </dl>
      </footer>
    </>
  )
}
