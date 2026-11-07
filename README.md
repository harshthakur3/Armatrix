# Armatrix Weld Seam Planner

A web app for uploading an STL part, selecting weld seams on its 3D model, setting MIG/TIG parameters, arranging the weld order, and downloading a JSON weld job.

This guide starts from a fresh computer and a new Supabase project. The React frontend and Express API run locally; Supabase hosts authentication, PostgreSQL, and private STL storage. An internet connection is required. This setup does not require Docker, a local PostgreSQL installation, or the Supabase CLI.

## Requirements

- **Node.js 22.12 or newer**, with npm. The locked Supabase packages require Node 22+, and Vite requires at least 22.12 on that release line. Install a supported Node version from [nodejs.org](https://nodejs.org/en/download).
- A [Supabase account](https://supabase.com/dashboard).
- A modern browser with WebGL enabled for the 3D viewer.
- Git if you are cloning the repositories instead of downloading them.

Check the installed tools in a terminal:

```sh
node --version
npm --version
```

## 1. Clone the repository

Clone the repository and open its root directory:

```sh
git clone https://github.com/harshthakur3/Armatrix.git
cd Armatrix
```

You can also download the repository as a ZIP and extract it. The frontend, backend, and sample parts are included together:

```text
Armatrix/
├── README.md                 # This setup guide
├── frontend/
│   ├── package.json
│   ├── package-lock.json
│   ├── .env.example
│   └── src/
├── backend/
│   ├── package.json
│   ├── package-lock.json
│   ├── .env.example
│   ├── src/
│   └── supabase/schema.sql
└── test-parts/                # Sample STL files, if supplied with the project
```

The frontend and backend have separate dependency installations. Run npm commands inside the appropriate directory; there is no root `package.json` or single root start command.

## 2. Create the Supabase database and storage

1. In the Supabase Dashboard, create a new project in your organization. Choose a project name, database password, and region, then wait for the project to finish provisioning.
2. Open **SQL Editor**, create a new query, and paste the complete contents of [backend/supabase/schema.sql](backend/supabase/schema.sql).
3. Run the query **once** on the new project.

The script creates all the application database and storage resources:

| Resource | Purpose |
| --- | --- |
| `public.parts` table | Part metadata, ownership, file path, timestamps, and the saved JSON weld plan |
| Row Level Security policies on `parts` | Each authenticated user can read and modify only their own parts |
| Private `stl-files` bucket | Stores uploaded models, with a 50 MB limit per file |
| Storage policies | Each user can access only files inside their own user-ID folder |

After running the script, confirm that `parts` appears in **Table Editor** and `stl-files` appears in **Storage** as a private bucket. The app creates user accounts, file folders, and part rows as people use it; you do not need to add sample database rows manually.

If you are reusing a Supabase project where this script already succeeded, skip this step. The policy statements are not designed to be rerun: a second run can report that a policy already exists. Do not delete existing tables or policies just to repeat setup.

## 3. Configure email/password sign-in

In **Authentication**, open the email provider settings under **Sign In / Providers** (sometimes labelled **Providers**). Make sure email/password sign-in and new user sign-ups are allowed.

Then open **Authentication → URL Configuration** and set:

| Setting | Local value |
| --- | --- |
| Site URL | `http://localhost:5173` |
| Redirect URLs | `http://localhost:5173/**` |

The current app calls `signUp()` without an explicit email redirect URL, so confirmation emails use the **Site URL**. Use the frontend URL here, rather than the API URL on port 3000. See the [Supabase redirect URL documentation](https://supabase.com/docs/guides/auth/redirect-urls).

Choose the email confirmation behavior for your development project:

- **Quick local setup:** turn off **Confirm email** in the email provider settings. A new sign-up receives a session immediately, so you can try the app without configuring email delivery. Use a separate development project for this choice.
- **With confirmation enabled:** sign up with an address that can receive your project's auth emails, open the confirmation link, and then sign in. Hosted Supabase projects enable confirmation by default. Email delivery restrictions or rate limits may require custom SMTP; see [testing hosted auth email flows](https://supabase.com/docs/guides/auth/testing-auth-flows).

If you share a Supabase project with a deployed app, changing its Site URL also changes the default confirmation destination for that deployed app. A separate development project avoids this conflict.

## 4. Create the environment files

Get your **Project URL** and **publishable key** from the project's **Connect** dialog, or use **Settings → API Keys** to find the key. Use the same Supabase project and publishable key in both applications. The key documentation is available [here](https://supabase.com/docs/guides/getting-started/api-keys).

The backend also uses the publishable key together with the signed-in user's access token. A Supabase secret/service-role key and the database password are not required by this app. Values prefixed with `VITE_` are available in the browser, so never put a secret/service-role key in those variables.

From the `Armatrix` directory, create the files using **one** of the following options. Skip copying if your local files already exist, and edit those instead.

**Windows PowerShell:**

```powershell
Copy-Item frontend/.env.example frontend/.env.local
Copy-Item backend/.env.example backend/.env
```

**macOS / Linux:**

```sh
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
```

Edit **`frontend/.env.local`**:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_API_URL=http://localhost:3000
```

Edit **`backend/.env`**:

```dotenv
PORT=3000
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
FRONTEND_ORIGIN=http://localhost:5173
```

Replace `your-project-ref` and `your-publishable-key` with your actual project values. Use the base Project URL, without `/rest/v1`, `/auth/v1`, or `/storage/v1`. Keep `VITE_API_URL` without a trailing slash or `/api` suffix: the frontend adds `/api/...` itself.

These environment filenames are already excluded by `.gitignore`. Keep the `.env.example` files as templates and share those instead of your local configuration. Restart the relevant server whenever you change an environment file.

## 5. Install dependencies and start both servers

Open two terminals in the `Armatrix` directory. Use `npm ci` to install the versions recorded in each package's `package-lock.json`; installation is needed on the first run and whenever the lockfile changes.

### Terminal 1 — backend

```sh
cd backend
npm ci
npm run dev
```

The API should print:

```text
API running on http://localhost:3000
```

Open [http://localhost:3000/api/presets](http://localhost:3000/api/presets) in your browser. You should see JSON with a `presets` array. This checks that the API is running; sign-in and upload below also check the Supabase connection. The API has no `/` page, so `Cannot GET /` at port 3000 is expected.

### Terminal 2 — frontend

```sh
cd frontend
npm ci
npm run dev -- --port 5173 --strictPort
```

Open **[http://localhost:5173](http://localhost:5173)**. Specifying the port and `--strictPort` keeps the URL aligned with Supabase and backend CORS settings. If port 5173 is occupied, Vite exits instead of silently moving to another port.

Keep both terminals running. To stop a server, press **Ctrl+C** in its terminal. On later runs, you can skip `npm ci` and use the same start commands.

## 6. Try the complete workflow

1. Open the frontend and create an account. The form requires a password of at least six characters; use a stronger password if required by your Supabase settings. Confirm your email first if confirmation is enabled.
2. Upload a non-empty `.stl` file of up to **50 MB**. Binary and ASCII STL are supported. If `test-parts` was supplied, start with `t-joint.stl` or `l-bracket-gusset.stl`.
3. Open the part and confirm that the 3D model loads. Check **File units** and **Up axis**, since STL files do not declare their units.
4. Use **Pick edge** to add a seam, or **Draw path** to click at least two points and press Enter. Select the seam to edit its parameters or apply a preset.
5. Reorder seams, reverse the weld direction, or adjust start/end trim as needed. Changes auto-save after a **600 ms** pause. Wait for **Saved**, then reopen or refresh the part to check persistence.
6. Click **Export weld job** to download `<part-name>-weld-job.json`. Export requires at least one seam and complete process parameters. The UI lists any blocking problems; unusual parameter values can produce warnings without blocking export.

The JSON uses export schema `1.0` and contains the job format version, generation timestamp, part ID/name, original file units, up axis, coordinate frame (`stl_part`), and ordered seams. Each seam includes its ID, sequence, MIG/TIG process, closed-loop flag, trimmed `path_mm`, and process parameters. Numeric field names state their units, such as `current_a`, `travel_speed_mm_s`, and `work_angle_deg`. Paths are always exported in millimetres even when the part's original `source_units` differ. Length, time, and heat-input statistics are displayed in the app rather than included in the job.

This is a general JSON format for the project demo. A specific robot still needs a controller integration with calibrated part placement, tool orientation, and approach/retract motions; those are not generated by this app.

## Useful commands

Run each command from the directory shown:

| Directory | Command | Purpose |
| --- | --- | --- |
| `backend` | `npm run dev` | Start the API with nodemon reloads |
| `backend` | `npm start` | Start the API without nodemon |
| `frontend` | `npm run dev -- --port 5173 --strictPort` | Start the frontend development server |
| `frontend` | `npm run lint` | Run Oxlint |
| `frontend` | `npm run build` | Create the frontend production bundle in `dist` |
| `frontend` | `npm run preview -- --port 5173 --strictPort` | Preview the built frontend locally |

For a production-build preview, stop the frontend development server, run `npm run build`, then run the preview command above. Keep the backend running. Using port 5173 lets the same local auth and CORS settings continue to work. Vite reads `VITE_` variables during the build, so rebuild after changing them.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Node engine error, install failure, or Vite will not start | Check `node --version`. Use Node 22.12 or newer, reopen the terminal after installing Node, then run `npm ci` in the affected directory. |
| PowerShell says `npm.ps1` cannot run | Use `npm.cmd` in place of `npm`, or use Command Prompt. Changing execution policy is not required. |
| Missing environment-variable error or blank page | Check exact variable names and filenames: `frontend/.env.local` and `backend/.env`. Replace placeholders, save, and restart the server. |
| `EADDRINUSE` or port 5173 is occupied | Stop the other process using the port. If you intentionally change a port, update the environment values and auth URLs to match. |
| CORS error, `Failed to fetch`, or edits stay unsaved | Keep the API running. Check `VITE_API_URL=http://localhost:3000` and `FRONTEND_ORIGIN=http://localhost:5173`. Open the frontend using that exact hostname and port; `127.0.0.1` is a different origin. |
| Invalid API key, expired session, or persistent 401 | Confirm both environment files use the same project's URL and publishable key. Restart both servers, sign out, and sign in again. |
| `parts` table missing, bucket not found, or upload denied by a policy | Run `backend/supabase/schema.sql` once in the correct project. Confirm the table, private `stl-files` bucket, and ownership policies exist. Upload through the signed-in app. |
| SQL says a policy already exists | The schema was already applied at least in part. Inspect existing resources instead of rerunning the entire script or deleting data. |
| Sign-in says email is not confirmed, or no confirmation arrives | Check the Confirm email setting, spam folder, and hosted auth email restrictions. For a dedicated local-development project, you can disable confirmation before creating a test account. |
| Confirmation opens the wrong site | Set Supabase Site URL to `http://localhost:5173`. The current sign-up call uses that default. |
| Uploaded parts do not appear on another account | Parts and STL files are private per user. Sign in with the account that uploaded them. |
| Presets are empty or export does not work even though uploads work | Uploads use Supabase directly; presets, plan saving, validation, deletion, and export need the Express API. Check its terminal and `/api/presets`. |
| Save reports a 409 conflict | Another window saved the part after this one loaded. Review any unsaved work before using **Reload latest** to load the saved version. |
| Export lists missing parameters or HTTP 422 | Select each flagged seam, apply a preset or fill its required parameters, check that trim leaves a non-zero weld path, and wait for **Saved**. |
| Model appears tiny or dimensions look wrong | Select the units used when exporting the STL: millimetres, centimetres, metres, or inches. Adjust Y/Z up if needed. |
| Edge picking is unavailable for a dense STL | Models over 400,000 triangles skip edge-graph creation. Use a lighter STL or the Draw path tool. |

`FRONTEND_ORIGIN` also accepts multiple exact origins separated by commas with no spaces. If you intentionally use another local URL, add that origin and adjust Supabase URL settings as needed.

## Where the code lives

| Location | Responsibility |
| --- | --- |
| [frontend/src/App.jsx](frontend/src/App.jsx) | Routes and the signed-in route guard |
| [frontend/src/auth](frontend/src/auth) and [AuthPage.jsx](frontend/src/pages/Auth/AuthPage.jsx) | Shared auth state and the sign-in/sign-up form |
| [frontend/src/pages/Parts](frontend/src/pages/Parts) | Upload and parts list |
| [frontend/src/pages/Part](frontend/src/pages/Part) | Part loading and the planning workspace |
| [frontend/src/components/Viewer.jsx](frontend/src/components/Viewer.jsx) | Three.js viewer and model interactions |
| [frontend/src/hooks](frontend/src/hooks) | STL loading and plan state/auto-save |
| [frontend/src/lib](frontend/src/lib) | Supabase/API access, STL and seam geometry, weld statistics, formatting |
| [backend/src/index.js](backend/src/index.js) | Express startup, CORS, JSON parsing, and error handling |
| [backend/src/auth.js](backend/src/auth.js) | Supabase token verification and a database client acting as the user |
| [backend/src/routes.js](backend/src/routes.js) | Presets, plan validation/saving, part deletion, and export endpoints |
| [backend/src/weld.js](backend/src/weld.js) | Welding presets, validation, and JSON job generation |
| [backend/supabase/schema.sql](backend/supabase/schema.sql) | Database table, storage bucket, and ownership policies |

Authentication, part reads/uploads, and STL downloads use Supabase directly. The frontend calls Express for validated plan saves, presets, part deletion, and exports. The backend verifies user tokens on protected endpoints and keeps Supabase Row Level Security in effect.
