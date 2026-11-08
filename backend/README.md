# Backend code guide

Armatrix's backend has **four JavaScript files**. It validates weld plans, saves them, deletes parts, and generates JSON weld jobs. Supabase handles authentication, PostgreSQL, and STL storage. For local setup, see the [main README](../README.md).

Read in this order: **index.js → auth.js → routes.js → weld.js → schema.sql**.

## 1. [src/index.js](src/index.js) — starts the server

- Loads `.env` using `dotenv`, then creates the Express application.
- Reads `FRONTEND_ORIGIN` and configures CORS for the allowed browser origins. CORS is separate from user authentication.
- Parses JSON bodies with a **2 MB limit**.
- Registers public `GET /health` and mounts `routes.js` under `/api`.
- Handles malformed JSON (**400**), oversized bodies (**413**), and unexpected errors (**500**).
- Listens on `PORT` (default **3000**) at `0.0.0.0`.

**Remember:** server setup and shared request handling live here.

## 2. [src/auth.js](src/auth.js) — verifies the user

Its main function is **`requireUser(req, res, next)`**, middleware that runs before protected route handlers:

1. Reads `Authorization: Bearer <token>` from the request.
2. Creates a Supabase client using the publishable key and that user's token.
3. Verifies the token with `db.auth.getUser(token)`; missing/invalid tokens return **401**.
4. Attaches the client as `req.db`, then calls `next()` to continue.

Routes use `req.db` to access Supabase **as the signed-in user**, so Row Level Security (RLS) still controls ownership. This backend does not use a service-role key.

**Remember:** authentication checks who the user is; RLS checks which data they can access.

## 3. [src/routes.js](src/routes.js) — connects URLs to operations

All paths below have the `/api` prefix added by `index.js`.

| Endpoint | Logic | Protected? |
| --- | --- | --- |
| `GET /presets` | Returns `PRESETS` from `weld.js`; no database call. | No |
| `POST /plans/validate` | Returns `{ errors, warnings }` without saving. Validation results come in a 200 response. | No |
| `PUT /parts/:id/plan` | Validates the plan, updates `plan` and `updated_at`, and returns warnings plus the new timestamp. Invalid data returns 400. | Yes |
| `DELETE /parts/:id` | Looks up `file_path`, deletes the STL object, then deletes its database row. Returns 204. | Yes |
| `GET /parts/:id/weld-job` | Reads the saved plan, calls `buildWeldJob`, and returns JSON or 422 with blocking problems. | Yes |

### The important save logic: preventing overwritten edits

The frontend sends its last-known `updated_at` timestamp in the **`If-Match` header**. The update filters by both part ID and that timestamp:

```js
const expectedVersion = req.get('If-Match')
if (expectedVersion) update = update.eq('updated_at', expectedVersion)
```

If another tab has already saved, the timestamp no longer matches. The route checks that the part still exists and returns **409 Conflict**, preserving the newer save. Missing/inaccessible parts and malformed UUIDs return **404**. The header is optional in the backend; the application's frontend supplies it.

**Two details to explain correctly:** deletion involves separate storage/database operations, so it is not atomic. Export reads the database plan; the frontend disables its Export button while edits are unsaved.

## 4. [src/weld.js](src/weld.js) — welding rules and export logic

This file contains no HTTP or database calls. It exports **`PRESETS`, `validatePlan`, and `buildWeldJob`**.

| Name to find | What it does |
| --- | --- |
| `UNITS` | Converts source coordinates to mm: `mm: 1`, `cm: 10`, `m: 1000`, `in: 25.4`. |
| `FIELDS` | Defines parameter labels, units, and typical MIG/TIG ranges. Voltage and wire feed apply only to MIG. |
| `PRESETS` | Four starting configurations: MIG steel 3/6/8 mm and TIG stainless 2 mm. |
| `isPoint` / `distance` / `pathLength` | Check three finite coordinates, calculate 3D distance, and sum segment lengths. Closed paths include the last-to-first segment. |
| `validatePlan(plan)` | Checks units, up axis, seam IDs, points, trims, process, and applicable parameter values. Returns `{ errors, warnings }`. |
| `lerp` / `cutPath` | Interpolate points and keep the section between two distances along an open path. |
| `round` / `SCHEMA_VERSION` | Round exported coordinates to three decimals and identify format version `1.0`. |
| `buildWeldJob(part, plan)` | Revalidates, converts coordinates to mm, trims open paths, preserves seam order, assigns `sequence`, and keeps process-specific parameters. Returns `{ job }` or `{ problems }`. |

### Errors versus warnings

- **Errors block saving and export:** invalid units/process, duplicate seam IDs, malformed points, negative/non-finite trims or parameter values.
- **Blocking warnings allow drafts to save but prevent export:** missing required parameters or trim that removes the whole seam.
- **Ordinary range warnings allow both:** a numeric value outside its configured typical range.
- An empty seam list can be saved, but cannot be exported. Zero parameter values are not rejected outright; they may produce range warnings.

### Two examples worth remembering

**Trimming:** a 100 mm straight seam with 10 mm start trim and 20 mm end trim exports from **10 mm to 80 mm**. `cutPath` uses interpolation when a trim falls between existing points.

**Export conversion:** saved `points` use the selected source units; exported `path_mm` always uses millimetres. Raw trim settings are replaced by the trimmed coordinates. `params.process` becomes the seam's top-level `process`. TIG omits voltage and wire feed.

`closed: true` means connect the final point back to the first; `false` means stop at the last point. Closed loops export without trimming. `coordinate_frame: "stl_part"` preserves the STL origin and axes; export does not transform points into robot coordinates.

**Remember:** the user chooses welding order; the backend preserves it rather than optimizing it.

## 5. [supabase/schema.sql](supabase/schema.sql) — database and storage rules

Run this setup script once in Supabase's SQL Editor; Express does not run it automatically.

- **`parts` table:** `id`, owner `user_id`, filename `name`, storage `file_path`, `size_bytes`, JSONB `plan`, and creation/update timestamps. File bytes live in Storage; the plan lives in the row.
- **Table RLS policies:** authenticated users can select, insert, update, and delete only their own rows, checked using `user_id = auth.uid()`.
- **Private `stl-files` bucket:** 50 MiB per file; storage policies restrict access to paths beginning with the user's ID.
- **Index:** `(user_id, created_at desc)`. `updated_at` has no update trigger here; the save route sets it explicitly.

`USING` controls access to existing rows; `WITH CHECK` checks new/updated rows. The policy statements are not guarded against rerunning the script.

## 6. Other files

| File | What you need to know |
| --- | --- |
| [package.json](package.json) | CommonJS modules, Node 22.x, dependencies, and scripts. `npm start` runs Node; `npm run dev` uses nodemon. `npm test` is currently a failing placeholder. |
| [package-lock.json](package-lock.json) | Generated exact dependency resolution used by `npm ci`; do not memorize its package entries. |
| [.env.example](.env.example) / local `.env` | Template versus actual configuration: `PORT`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `FRONTEND_ORIGIN`. The local file is ignored by Git. |
| [.gitignore](.gitignore) | Excludes dependencies, local environment files, logs, build output, and editor/OS files. |

Dependencies: **Express** handles HTTP, **cors** handles browser origin permissions, **dotenv** loads local configuration, **supabase-js** accesses auth/database/storage, and development-only **nodemon** restarts the server after edits.

## 7. Interview lookup: things outside this backend

| If asked about... | Where to show the code |
| --- | --- |
| STL upload, part listing, or why files bypass Express | [frontend parts.js](../frontend/src/lib/parts.js): browser → Supabase directly, with ownership policies. |
| The 600 ms autosave timer and queued requests | [frontend usePlan.js](../frontend/src/hooks/usePlan.js): backend only processes each received save. |
| Edge tracing and splitting seams around ribs | [frontend seams.js](../frontend/src/lib/seams.js): mesh geometry work happens in the browser. |
| Weld time and heat-input calculations | [frontend weld.js](../frontend/src/lib/weld.js): these statistics are not in the current job export. |
| Downloading the generated JSON | [ExportButton.jsx](../frontend/src/components/ExportButton.jsx): API returns JSON; browser downloads it. |

**Practise this request flow:** frontend → `index.js` → protected-route `requireUser` → `routes.js` → `weld.js` / Supabase → response.

**Scope to be honest about:** this exports a general weld plan for controller integration; it does not execute a physical robot or generate full calibrated tool poses. RLS enforces ownership, while application validation checks weld-plan rules. Current policies allow owners to write directly through Supabase too, so export revalidates the saved plan.
