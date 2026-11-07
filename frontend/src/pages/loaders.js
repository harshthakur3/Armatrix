// Shared import() calls, so a page chunk can be preloaded on hover before it is routed to.
export const loadAuthPage = () => import('./Auth/AuthPage.jsx')
export const loadPartsPage = () => import('./Parts/PartsPage.jsx')
export const loadPartPage = () => import('./Part/PartPage.jsx')
export const loadViewer = () => import('../components/Viewer.jsx')

// Opening a part needs both its page and the 3D viewer (three.js).
export function preloadPart() {
  loadPartPage()
  loadViewer()
}
