# Frontend code guide — page by page

The three main screens are **Landing → Parts list → Part workspace**, with a separate **Auth** screen. This guide maps each screen to its files and tells you where to make changes. For installation, see the [main README](../README.md); for API internals, see the [backend guide](../backend/README.md).

## First: how the application starts

```text
index.html -> main.jsx -> BrowserRouter + AuthProvider -> App.jsx
  /                -> Landing
  /auth            -> AuthPage
  /parts           -> ProtectedLayout -> AppLayout -> PartsPage
  /parts/:partId   -> ProtectedLayout -> AppLayout -> PartPage -> PartWorkspace
```

| File | Logic it owns |
| --- | --- |
| [index.html](index.html) | Browser title, metadata, favicon link, and the `root` element for React. |
| [src/main.jsx](src/main.jsx) | Imports global CSS; mounts `App` inside `StrictMode`, `BrowserRouter`, and `AuthProvider`. |
| [src/App.jsx](src/App.jsx) | Routes and lazy page loading. `ProtectedLayout` waits for auth, redirects signed-out users, and remembers the requested pathname. Unknown URLs go home. Also preconnects to Supabase. |
| [src/pages/loaders.js](src/pages/loaders.js) | Shared dynamic imports. `preloadPart()` loads the part-page/viewer **JavaScript** on hover/focus, not part data or the STL. Look under JS/All in Network, not only Fetch/XHR; cached modules may need no new request. |

`lazy` loads component code when needed; `Suspense` provides its loading fallback. Fetching actual page data is a separate operation.

## Page 1: Landing (`/`)

| File | What it does / what to change here |
| --- | --- |
| [Landing.jsx](src/pages/Landing/Landing.jsx) | Homepage markup/text. `WORKFLOW`, `OUTPUT_TRAITS`, and `HUD_SEAMS` hold repeated content. Uses auth state for CTA text/destination, lazy-loads `SeamHero`, displays sample JSON, and formats the footer date. |
| [SeamHero.jsx](src/pages/Landing/SeamHero.jsx) | Scripted 3D demo, separate from uploaded models. Defines base/wall/rib geometry and four `SEAMS`. `Plate` renders geometry/outlines; `Bracket` uses `useFrame` to reveal weld tubes, move the tip/light, and rotate the scene. Edit geometry, colors, or timing here. Reduced-motion preference stops animation. |
| [Landing.module.css](src/pages/Landing/Landing.module.css) | Hero/navigation, demo overlays, workflow tiles, sample-code scroll area, footer, and responsive layout. |
| [bracket-weld-job.json](src/assets/examples/bracket-weld-job.json) | Static four-seam example displayed through `JSON.stringify`. Changing it does **not** change real exported jobs. |

**Also uses:** shared `Logo`, `Pins`, `useAuth`, and the auth-page loader. This page does not load a user's STL or generate their plan.

## Page 2: Parts list (`/parts`)

The main pair is **`PartsPage.jsx` for behavior/markup + `PartsPage.module.css` for appearance**. Data operations live in `lib/parts.js`.

| File | What it does / important functions |
| --- | --- |
| [PartsPage.jsx](src/pages/Parts/PartsPage.jsx) | Loads rows on mount; renders empty/list/error states. `upload` validates then opens the created part. `handleFileChange` resets the input so the same file can be retried; `handleDrop` accepts the first dropped file. `handleDelete` requires two clicks, calls the API, then removes the local row. Hover/focus preloads workspace code. |
| [PartsPage.module.css](src/pages/Parts/PartsPage.module.css) | Columns, row hover, delete confirmation, empty state, and mobile layout. `content-visibility` skips rendering off-screen rows until needed. |
| [lib/parts.js](src/lib/parts.js) | `validateStl` checks extension, non-empty size, and the 50 MiB cap. `listParts` reads metadata sorted by newest `updated_at`. `uploadPart` uploads to `<userId>/<random UUID>.stl`, creates the row, and attempts file cleanup if row creation fails. `deletePart` calls Express. |
| [lib/format.js](src/lib/format.js) | `formatBytes`, `formatDate`, and `formatMm` format display labels. The date formatter is created once and reused. Also used by the workspace. |

**Upload flow:** picker/drop → `upload` → `validateStl` → `uploadPart` → Supabase Storage + metadata row → navigate to the workspace.

Uploads/list reads use Supabase directly under ownership policies; deletion uses Express. Actual STL parsing happens when opening the model, after extension/size checks.

## Page 3: Part workspace (`/parts/:partId`)

```text
PartPage -> fetch part record -> PartWorkspace connects everything
  useStl + stl.js          download, parse, measure the model
  seams.js                geometry calculations
  Viewer                  render model/seams and report pointer hits
  usePlan                 saved plan state + autosave
  SeamList / SeamEditor   sidebar controls
  ExportButton            fetch job and download JSON
```

### A. Loading and coordinating the page

| File | What it does / important functions |
| --- | --- |
| [PartPage.jsx](src/pages/Part/PartPage.jsx) | Reads `partId`, calls `getPart`, and shows missing-part UI on absent data/fetch errors. Ignores stale fetch results after cleanup. `key={part.id}` remounts workspace state when switching parts. |
| [PartPage.module.css](src/pages/Part/PartPage.module.css) | Styles the missing-part screen, not the planner layout. |
| [PartWorkspace.jsx](src/pages/Part/PartWorkspace.jsx) | Coordinator: calls both hooks, measures geometry, memoizes the edge graph, fetches presets, and connects child props/callbacks. Owns active tool, display mode, camera command, selection, hover preview, draft points, cursor, shortcuts, unit/up-axis controls, and save-status display. |
| [PartWorkspace.module.css](src/pages/Part/PartWorkspace.module.css) | Viewport/sidebar split, inspector width, toolbar, loading/error/progress overlays, status/axes, shortcuts, and mobile stacking. |
| [hooks/useStl.js](src/hooks/useStl.js) | Loading/progress/ready/error state. Calls STL download/parser, updates progress only on percentage changes, aborts requests and disposes loaded geometry during cleanup. |
| [lib/stl.js](src/lib/stl.js) | `downloadStl`: signed 60-second Storage URL, streamed progress or `arrayBuffer` fallback. `parseStl`: binary/ASCII `STLLoader`, rejects unusable geometry, computes bounds. `describeGeometry`: triangle count, dimensions, center, radius, grid spacing; `gridCellFor` chooses readable spacing. |

**In `PartWorkspace.jsx`, look for:**

- `locate` + `hoverTarget`: find the nearby edge/existing seam and decide selection versus new-seam preview.
- `handleHover` + `handlePick`: update preview/cursor; select a seam, trace new seams, or place a snapped draft point.
- `withDefaults` + `finishDraft`: apply the first fetched preset and finish a manually drawn open seam with at least two points.
- `switchTool` + `onKeyDown`: clear drafts/hover, finish/undo/cancel, delete selection, switch **E/D** tools and **F/1–4** camera views. Typing/modifier shortcuts are ignored.
- `VIEWS`, `TOOLS`, `MODES`, `SHORTCUTS`, `PICK_PIXELS`, `UNITS`: toolbar choices, keys, picking tolerance, unit scale. `command.n` lets repeated view clicks refit the camera.

### B. Geometry calculations versus rendering

| File | What it does / important functions |
| --- | --- |
| [lib/seams.js](src/lib/seams.js): graph/picking | `buildEdgeGraph` extracts feature edges, merges rounded duplicate vertices, and builds adjacency. `nearestSegment` finds the nearest edge, preferring a shorter edge for near ties. `closestPointOnSegment` projects onto it; `snapPoint` prioritizes corner → edge → surface. |
| Same `seams.js`: tracing | `walk` follows the straightest unused connected edge. `traceSeam` follows both directions or detects a closed loop. `splitAroundParts` uses an edge-based heuristic to split around intersecting ribs; `newSeamsAt` filters existing seams. `findSeamNear` identifies saved seams; `nextSeamId` picks one above the highest currently present ID. |
| Same `seams.js`: path math | `seamLength` sums segment lengths including loop closure. `weldPath` applies open-seam trims; `cutPath` interpolates endpoints between vertices. Vector helpers (`sub`, `dot`, `len`, `unit`, `along`, `lerp`, `midpoint`, `distanceToSegment`) support this math. `FEATURE_ANGLE` and `MAX_TURN_COS` tune extraction/tracing. |
| [components/Viewer.jsx](src/components/Viewer.jsx) | React Three Fiber canvas. `Part` draws mesh/edges and converts pointer hits to file coordinates; ignores clicks ending an orbit drag. `SeamPath` draws tubes/start markers; `SeamBead` shows trimmed welds; `Drawing` shows draft/cursor; `Axes`/`Floor` draw references. `Headlight` follows the camera. `Controls` handles OrbitControls, damping, view directions, fit, and zoom. Generated geometry/controls have cleanup handlers. |

The viewer uses **demand rendering**: frames are requested for changes and while camera damping settles. Change 3D colors in `Viewer.jsx`, not CSS. Centering/Y-Z rotation is for display; `worldToLocal` converts hits back to original STL coordinates.

`MAX_EDGE_TRIANGLES` is **400,000**; above it the workspace skips graph creation. Manual drawing still accepts surface points without corner/edge snapping; the current UI also replaces the seam-list area with a density notice.

### C. Saved state, editing, and export

| File | What it does / important functions |
| --- | --- |
| [hooks/usePlan.js](src/hooks/usePlan.js) | Owns `plan`, warnings, save status/errors, and version. `edit` marks changes as saving; setters add/remove/update seams, change units/up-axis, apply params to all, or reorder via `moveSeam`. Validates on open; debounces saves **600 ms**. A promise queue serializes saves; revision guards prevent stale responses showing “Saved”. Sends `updated_at` through `If-Match`; 409 becomes `conflict`. Cleanup clears the pending timer. |
| [SeamList.jsx](src/components/SeamList.jsx) + [CSS](src/components/SeamList.module.css) | Ordered IDs, trimmed lengths, loop/warning labels, selection, move/delete buttons. Calls parent callbacks; actual state changes are in `usePlan`. CSS owns rows/actions/selection appearance. |
| [SeamEditor.jsx](src/components/SeamEditor.jsx) + [CSS](src/components/SeamEditor.module.css) | `NumberField`: numeric/null input and Shift+arrow steps. `setParam`/`setTrim`: emit updates. `applyPreset`: replace params. `reverse`: reverse points **and swap trims**. Hides MIG-only fields for TIG and trim controls for loops. Shows statistics/warnings; apply-to-all calls the parent with a 2-second confirmation. CSS owns inputs/grid/stats. |
| [lib/weld.js](src/lib/weld.js) | `PARAM_FIELDS`: labels, units, step sizes, MIG-only visibility. `seamStats`: joint/trimmed length, time = length ÷ speed, MIG heat input = voltage × current ÷ speed ÷ 1000. `formatSeconds`: duration labels. Presets/validation ranges live in [backend weld.js](../backend/src/weld.js). |
| [ExportButton.jsx](src/components/ExportButton.jsx) | `handleExport` fetches the job and displays problems; disabled while unsaved/exporting. `downloadJson` creates a Blob/object URL, clicks a download link, and revokes the URL. Uses global button/callout CSS. **Real JSON fields are generated in backend `buildWeldJob`.** |

**Persisted:** units, up-axis, seams, parameters, trims in `usePlan`. **Temporary:** tool/camera/display/selection/hover/draft in workspace. Draft points persist only after finishing. Pending debounce changes are not automatically flushed when leaving the page.

**Edit flow:** `SeamEditor.onChange` → workspace `updateSeam` → `usePlan.edit` → redraw → delayed `savePlan` → backend validation/save → warnings + timestamp. Export reads that saved plan.

## Supporting screen: Auth (`/auth`)

| File | What it does |
| --- | --- |
| [AuthPage.jsx](src/pages/Auth/AuthPage.jsx) + [CSS](src/pages/Auth/AuthPage.module.css) | `?mode=` selects sign-in/up. `COPY` holds text; `switchMode` clears messages. `handleSubmit` reads FormData and calls Supabase `signUp`/`signInWithPassword`, showing errors/email-confirmation notice or navigating to the remembered path/default `/parts`. Pending state disables submit; sign-up minimum length is six. CSS owns form/tabs/brand/mobile layout. |
| [auth/AuthProvider.jsx](src/auth/AuthProvider.jsx) | Subscribes to Supabase `onAuthStateChange`, updates `user`/`loading` for initial session, sign-in/out, refresh, and unsubscribes on cleanup. |
| [auth/useAuth.js](src/auth/useAuth.js) | Defines `AuthContext` and `useAuth()`; throws if used outside the provider. |

Redirect rules belong in **App.jsx**, form behavior in **AuthPage.jsx**, shared session state in **AuthProvider.jsx**. Navigation guards are backed by server token checks and Supabase ownership policies.

## Shared files used by these pages

| File | What it does |
| --- | --- |
| [lib/supabase.js](src/lib/supabase.js) | Shared browser client from trimmed environment URL/key; errors if missing. Used for auth, row reads/uploads, signed file URLs. |
| [lib/api.js](src/lib/api.js) | `api` attaches the session token/extra headers, sends JSON to Express, handles 204, and parses responses. `requestError` standardizes message/status/details for network, response, and API errors. |
| [lib/parts.js](src/lib/parts.js), remaining functions | `getPart`: read part/plan from Supabase. `savePlan`: PUT with `If-Match`. `validatePlan`, `fetchPresets`, `fetchWeldJob`, `deletePart`: named API wrappers, not implementations of welding rules. |
| [AppLayout.jsx](src/components/AppLayout.jsx) + [CSS](src/components/AppLayout.module.css) | Signed-in shell: logo, email, sign-out, and `Outlet` for the active protected page. CSS styles header/mobile email visibility. |
| [Segmented.jsx](src/components/Segmented.jsx) + [CSS](src/components/Segmented.module.css) | Reusable tool/view/process/etc. buttons. `value` selects the pressed option; `onChange` calls the owner. CSS styles hover/pressed states. |
| [Logo.jsx](src/components/Logo.jsx) / [Pins.jsx](src/components/Pins.jsx) | Home link with scalable brand SVG / static four-corner decorative markup. |
| [styles/global.css](src/styles/global.css) | Fonts, palette variables, resets, shared typography/buttons/panels/callouts/pins, focus and reduced-motion rules. `*.module.css` files style their associated page/component; shared classes such as `btn` live here. |

## Assets and project configuration

| File | Purpose |
| --- | --- |
| [logo-horizontal-sand.svg](src/assets/brand/logo-horizontal-sand.svg) / [favicon.svg](public/favicon.svg) | In-page branding / browser-tab icon. |
| [onest-latin.woff](src/assets/fonts/onest-latin.woff) / [42dot-sans-latin.woff](src/assets/fonts/42dot-sans-latin.woff) | Local heading/button and body fonts loaded by global CSS. |
| [package.json](package.json) / [package-lock.json](package-lock.json) | Scripts/dependencies and exact npm resolution. React = UI, Router = navigation, Three.js/R3F = 3D, Supabase JS = data/auth. Commands: `dev`, `build`, `lint`, `preview`; Node 22.x. |
| [vite.config.js](vite.config.js) | React plugin and build checks for required environment values, valid HTTP(S) URLs, API base path, hosted HTTPS configuration. |
| [vercel.json](vercel.json) | Rewrites nested routes to `index.html` for SPA direct links/refreshes. |
| [.env.example](.env.example) / local `.env.local` | Supabase URL/publishable key and API base URL. `VITE_` values reach the browser bundle; never put service-role secrets here. |
| [.oxlintrc.json](.oxlintrc.json) / [.gitignore](.gitignore) | Hook/component-export lint rules / exclusions for dependencies, local files, generated output, logs, editor files. `node_modules`/`dist` are generated. |

## Quick lookup: “I need to change…”

| Change | Open first |
| --- | --- |
| Homepage text / demo / sample JSON | `Landing.jsx` / `SeamHero.jsx` / `assets/examples/bracket-weld-job.json` |
| Auth form / route guard / sign-out header | `AuthPage.jsx` / `App.jsx` / `AppLayout.jsx` |
| Upload rules/list sorting / delete confirmation | `lib/parts.js` / `PartsPage.jsx`; storage file cap also lives in backend `schema.sql`. |
| Pick/draw behavior or shortcuts | `PartWorkspace.jsx`; geometry math is in `lib/seams.js`. |
| Edge detection/snapping/rib splitting | `lib/seams.js` → `FEATURE_ANGLE`, `snapPoint`, `splitAroundParts`. |
| Camera/lighting/3D colors / sidebar width | `Viewer.jsx` / `PartWorkspace.module.css`. |
| Autosave delay or conflict handling | `usePlan.js`; server conflict response is in backend `routes.js`. |
| Parameter inputs / presets and ranges | `SeamEditor.jsx` + frontend `lib/weld.js` / backend `weld.js`. |
| Trim/reverse / reorder / statistics | `SeamEditor.jsx` + `seams.js` / `SeamList.jsx` + `usePlan.js` / `lib/weld.js`. |
| Download filename / real export fields | `ExportButton.jsx` / backend `weld.js` → `buildWeldJob`; keep the homepage example in sync. |
| Overall theme / one page's spacing | `global.css` / that page's `*.module.css`. |
