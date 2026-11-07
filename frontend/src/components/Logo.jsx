import { Link } from 'react-router'
import logoUrl from '../assets/brand/logo-horizontal-sand.svg'

// Light Sand horizontal logo from the asset pack; every surface in the app is dark.
export default function Logo({ height = 28 }) {
  return (
    <Link to="/" aria-label="Armatrix home">
      <img src={logoUrl} alt="Armatrix" height={height} style={{ width: 'auto' }} />
    </Link>
  )
}
