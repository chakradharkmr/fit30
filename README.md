# Fit30 Reset

A free, local-first 30-day diet and movement web app: balanced eating, three short strength sessions, two aerobic sessions and daily walking. It is a static single-page app with no build step, plus a handful of Netlify Functions. You can turn on optional Google sign-in (Supabase) to sync one record between devices.

> **Headline:** Lose up to **3 kg** in 30 days. Keep the habits.
> 3 kg is an ambitious upper target, not a promise. Waist measurement, fitness and consistency count too.

## Safety statement

Fit30 Reset is educational software for generally healthy adults. It is **not** medical diagnosis, treatment or personalised clinical care. People who should seek clinical advice first: anyone who is pregnant or postpartum, under 18 or frail, or who has an eating disorder, kidney disease, uncontrolled diabetes, significant cardiac disease, recent surgery, or serious back or pelvic-floor problems. Stop signals: chest pain, faintness, severe breathlessness, neurological symptoms, sharp or radiating pain. The same notice appears on the landing page and in the Learn view.

## Features

- **Targets:** Mifflin–St Jeor BMR × activity factor (1.2 / 1.375 / 1.55 / 1.725), minus about 300 / 500 / 700 kcal. Software floors are 1,200 kcal (female) and 1,500 kcal (male), and the target is never above maintenance. Protein is ≈1.4 g/kg, fat ≈28% of energy and carbohydrate fills the rest. Protein is capped at 40% of energy so carbohydrate can never go negative. Everything is editable in Settings, with a floor warning.
- **Food diary:** four meals, any date, totals derived from `grams / 100 × per100`, add / edit / delete (delete asks for confirmation), plus gentle over-target, low-protein and low-veg prompts.
- **Offline library:** 98 everyday foods in 7 categories, with search and filters that work offline. Custom foods are checked for plausibility.
- **USDA FoodData Central search:** done through `/.netlify/functions/food-search`, so the key stays on the server.
- **Barcode lookup:** Open Food Facts through `/.netlify/functions/barcode`, with a GS1 check-digit check, `BarcodeDetector` camera scanning and manual entry as the fallback.
- **Meal builder:** live totals, food-group shares, coaching prompts, "Suggest balanced meal" (always within budget), and saved meals you can load, duplicate, delete or add to the diary.
- **Weekly templates:** four editable weeks (Foundation, High-volume, Performance, Consolidation), each 7 days × 4 meals. You can reset one week at a time.
- **Groceries:** a list generated from a week × household size and grouped by aisle. It is editable and checkable, custom items survive regeneration, and you can print it or export it as text or JSON.
- **Night-before checklist:** template tasks for each week, custom tasks and notes, and an optional local Notification reminder (off by default).
- **30-day training plan:** Strength A / B with core, aerobic and rest days across 4 phases. You can record sets, reps, load, time and notes, plus difficulty, pain notes and aerobic minutes. The 12-minute minimum session needs confirmation. Warning symptoms block completion, but you can save the session as stopped.
- **Optional wger exercise search** through `/.netlify/functions/exercises`, with attribution. The built-in technique library is the fallback.
- **Progress:** check-ins, adherence stats and hand-written SVG charts (weight with 7-day average and target reference, calories, protein, steps, sleep, waist, workout frequency). Each chart has a text summary and a hidden data table. There is no projection.
- **Data controls:** JSON export, validated import (wrapped `{app, schema, data}` or a bare state object) and a confirmed reset.
- **PWA:** installable and works offline after the first load.
- **Optional accounts:** Google OAuth with PKCE through Supabase. One JSON record per user, last-write-wins, never merged silently.

## Project structure

```
index.html            App shell and static landing content (works before JS boots)
styles.css            Design tokens, light/dark/system themes, layout, print styles
app.js                All logic and views (Fit30Core, loadable in Node) + browser layer
account.js            Optional Google sign-in and sync (window.Fit30Account)
manifest.webmanifest  PWA manifest
sw.js                 Service worker (shell precache, SWR assets, network-only APIs)
netlify.toml          Publish root, functions dir, Node 20, security headers
privacy.html, terms.html
icons/                SVG + PNG icons (192, 512, maskable, apple-touch)
netlify/lib/account.mjs           Shared account helpers (token verification, Supabase REST)
netlify/functions/food-search.mjs USDA proxy
netlify/functions/barcode.mjs     Open Food Facts proxy
netlify/functions/exercises.mjs   wger proxy
netlify/functions/account-config.mjs, account-state.mjs, account-delete.mjs
supabase/schema.sql   Idempotent table + RLS setup
tests/logic.test.mjs, tests/account.test.mjs
```

## Local preview

Static only (no functions, so online search and accounts show their "unavailable" messages):

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

With functions (needs the Netlify CLI):

```bash
npm install -g netlify-cli
netlify dev            # serves the site and /.netlify/functions/* on http://localhost:8888
```

Tests (Node 20+, no dependencies):

```bash
node --test tests/logic.test.mjs
node --test tests/account.test.mjs
```

## Deploying to Netlify

1. Create a new site from this repository (or drag-and-drop the zip in **Sites → Add new site → Deploy manually**).
2. Leave the build command empty. The publish directory is the repository root (`netlify.toml` sets `publish = "."` and `functions = "netlify/functions"`).
3. Optionally add environment variables (below) and redeploy.

## Environment variables

All variables are server-side only and are read inside Netlify Functions.

| Variable | Required for | Notes |
|---|---|---|
| `USDA_API_KEY` | Online food search | Free key from https://fdc.nal.usda.gov/api-key-signup. Without it, search returns `error: "not_configured"` and the offline library keeps working. |
| `SUPABASE_URL` | Accounts | `https://<project-ref>.supabase.co` (must be https). |
| `SUPABASE_ANON_KEY` | Accounts | Public anon key. Sent to the browser by `account-config` (this is expected). |
| `SUPABASE_SERVICE_ROLE_KEY` | Accounts | **Secret.** Used only in functions for server-to-server calls. Never sent to the browser. |

Barcode lookup (Open Food Facts) and exercise search (wger) need no keys.

## Optional accounts and Google sign-in

With no `SUPABASE_*` variables, the account button explains that accounts are not configured, and every feature works locally.

### 1. Create the Supabase project

Either create a project at https://supabase.com, or add the **Supabase integration** in Netlify (**Site configuration → Integrations → Supabase**). The integration links a project and can set `SUPABASE_URL` and `SUPABASE_ANON_KEY` for you. Make sure `SUPABASE_SERVICE_ROLE_KEY` is also set (see step 6).

### 2. Run the schema

In the Supabase dashboard, open **SQL Editor**, paste `supabase/schema.sql` and run it. It is idempotent. It creates `public.fit30_accounts`, enables row-level security with **no policies**, revokes access from `anon` and `authenticated`, and grants it to `service_role`. Browsers therefore cannot touch the table directly; all access goes through the functions.

### 3. Create a Google OAuth client

In Google Cloud Console:

1. **APIs & Services → OAuth consent screen**: configure it (External), add your app name, support email and the `email`, `profile` and `openid` scopes. Publish it, or add test users.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
3. **Authorised redirect URIs**: `https://<project-ref>.supabase.co/auth/v1/callback`
4. Copy the client ID and client secret.

### 4. Enable the Google provider in Supabase

**Authentication → Sign In / Providers → Google**: enable it and paste the client ID and secret.

### 5. Allow your site's redirect URLs

**Authentication → URL Configuration**:

- **Site URL**: `https://<your-site>.netlify.app` (or your custom domain).
- **Redirect URLs**: add `https://<your-site>.netlify.app/**`. For deploy previews add `https://*--<your-site>.netlify.app/**`, and for local testing add `http://localhost:8888/**`.

The app sends `redirect_to=<origin><path>`. Supabase rejects sign-ins whose redirect is not on this allow-list.

### 6. Set environment variables and redeploy

In Netlify (**Site configuration → Environment variables**), set `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` (from **Supabase → Project Settings → API**). Mark the service key as secret if your plan supports it, then **redeploy**. Functions only see variables from deploys made after the change.

### CSP note

`connect-src` in `netlify.toml` includes `https://*.supabase.co`. The browser talks to Supabase Auth directly to exchange the OAuth code and refresh tokens, so without this entry sign-in fails silently. If you use a custom Supabase domain, add it to `connect-src`.

### How the flow behaves

1. "Continue with Google" creates a 32-byte PKCE verifier (kept in `sessionStorage`) and its SHA-256 challenge. It then goes to `/auth/v1/authorize?provider=google&...&code_challenge_method=s256`.
2. Supabase returns to the app with `?code=`. The app exchanges it at `/auth/v1/token?grant_type=pkce` and removes the code from the URL with `history.replaceState`. The implicit `#access_token=` fragment is also handled as a fallback.
3. Tokens are stored in `fit30.auth.v1`. They are refreshed 90 seconds before expiry. A `401` triggers one forced refresh and retry, then a clean sign-out.
4. On first sign-in the app never merges silently:
   - **Empty device + cloud copy**: it offers to restore. Declining leaves sync off.
   - **Local data + no cloud copy**: it offers to upload.
   - **Both**: you choose **Keep this device**, **Use cloud copy** or **Keep both**. Keep both downloads a JSON backup of this device first, then restores the cloud copy.
5. While sync is on, changes upload after 1.8 s of inactivity. An upload is skipped when nothing changed (`meta.lastSaved` is ignored), and pending changes are flushed when the tab is hidden or closed.
6. Every function call verifies the bearer token with `GET /auth/v1/user` (anon key) and reads or writes **only** the row for the returned UUID. A `user_id` sent by the client is ignored.

### Testing the functions with curl

```bash
SITE=https://<your-site>.netlify.app
curl -s $SITE/.netlify/functions/account-config            # {"enabled":true,...} — no service key
curl -s -i -X POST $SITE/.netlify/functions/account-config # 405 with Allow: GET
curl -s -i $SITE/.netlify/functions/account-state          # 401 unauthorized (no token)
# With a real access token (copy accessToken from localStorage "fit30.auth.v1"):
TOKEN=...
curl -s -H "Authorization: Bearer $TOKEN" $SITE/.netlify/functions/account-state
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"state":{"version":1}}' $SITE/.netlify/functions/account-state
curl -s "$SITE/.netlify/functions/barcode?code=3017620422003"
curl -s "$SITE/.netlify/functions/food-search?q=lentils"
```

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Account dialog says "not configured" | One of the three `SUPABASE_*` variables is missing, or the site was not redeployed | Set all three, then redeploy |
| Google shows `redirect_uri_mismatch` | The Google client is missing the Supabase callback | Add `https://<project-ref>.supabase.co/auth/v1/callback` |
| You return to the app but stay signed out | The site URL is not on the Supabase redirect allow-list, or the CSP blocks Supabase | Add `https://<site>/**` in URL Configuration; keep `https://*.supabase.co` in `connect-src` |
| "Sign-in could not be completed in this tab" | The PKCE verifier was lost (different tab or private mode) | Start sign-in again in the same tab |
| Sync shows "status 502" | The table is missing, or the service key is wrong | Run `schema.sql`; check `SUPABASE_SERVICE_ROLE_KEY` |
| Upload fails with 413 | The state is over 1.8 MB | Export a backup; prune old data |
| "account_delete_partial" message | The auth user was deleted but the row delete failed | The row cascades with the user in most setups; otherwise delete it manually in Supabase |

### Account limitations

- One record per user, last-write-wins, with no field-level merge or conflict history.
- Sync runs only while the app is open; there is no background sync.
- Tokens are stored in `localStorage`, which an XSS bug or a malicious extension could read. The strict CSP and escaping of all user text reduce, but do not remove, this risk.
- Google is the only provider.

## PWA behaviour

- `sw.js` precaches the shell: `./`, `index.html`, `styles.css`, `account.js`, `app.js`, the manifest, the legal pages and all icons.
- Navigations are network-first with a cached shell fallback. Same-origin assets use stale-while-revalidate.
- `/.netlify/functions/*` and all cross-origin requests are network-only and never cached.
- Bump `CACHE_VERSION` (currently `fit30-reset-v1.1.0`) whenever a shell file changes.
- After one online load the shell, food library, planner, training plan and all local data work offline. Online lookups show readable offline messages.

## Data model

`localStorage["fit30.reset.v1"]`:

```js
{ version: 1, profile, targets, mission: { startDate }, diary: { "YYYY-MM-DD": [entry] }, health: { date: {...} },
  savedMeals, mealSplit, plans: { 1..4: [7 days × { breakfast, lunch, dinner, snacks }] }, groceries, prep, workouts,
  builder, ui: { theme }, meta: { createdAt, lastSaved } }
```

Diary entries store `grams` and a `per100` snapshot (kcal, protein, carbohydrate, fat). Totals are always derived, never stored. `normaliseState()` runs on load, on import and on cloud restore. It clamps numbers, drops invalid dates and entries, caps array sizes (400 dates, 60 entries per day, 100 saved meals, and so on), validates enums and falls back to safe defaults. Other keys: `fit30.auth.v1`, `fit30.sync.v1`, and a short-lived PKCE verifier in `sessionStorage`.

## Security notes

- There are no secrets in client files, tests or this README. All keys come from environment variables.
- The strict CSP has no inline scripts and no `eval`. Images are allowed only from `self`, `data:`, `https://wger.de` and `https://*.openfoodfacts.org`.
- Every function validates the method (`405` with `Allow`), query length, barcode format and check digit, and payload shape and size (`413 invalid_state`). Responses carry `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
- Upstream text is stripped of markup and control characters, then escaped again in the browser.
- Account endpoints return `503 not_configured` without config and `401 unauthorized` without a valid token. All access is scoped to the UUID that Supabase returns.
- The repository root is published, so `tests/`, `supabase/` and function sources are publicly readable. They contain no secrets.

## Accessibility notes

- Semantic landmarks, a skip link, one `h1` per view, ordered headings, and focus moves to the view heading on navigation.
- Every form control has an explicit label. Errors use `aria-describedby` and `aria-invalid`, and focus moves to the first invalid field.
- Native `<dialog>` with `showModal()`: labelled, focused on open, focus restored on close, Escape and click-outside close it.
- Charts have a text summary and a visually hidden data table. The calorie ring and meters have text equivalents, so colour is never the only signal.
- `:focus-visible` rings, 44 px targets in primary flows, `prefers-reduced-motion` support, light, dark and system themes, and layouts from 320 px to 1440 px with no horizontal scrolling.

## Acceptance checklist

See the specification's section 15. The checklist covers first run and targets, diary and library, APIs, planner/groceries/preparation, training, progress, data/PWA/resilience and accounts. Items needing a deployed site or live credentials (PWA install over HTTPS, Google sign-in, Supabase rows) must be checked on a Netlify deploy.

## Choices made where the spec was open

- Settings lives at an extra `#settings` route, alongside the six main routes.
- The first-run "landing" is the hero, the safety notice and the onboarding form. After onboarding, the dashboard replaces it.
- Weekly strength and aerobic counts use the **mission week** that contains the selected date (days 1–7, 8–14, …). Outside the mission they use the last 7 days.
- The 12-minute minimum session counts as a completed workout for adherence but not as a strength session.
- Normalising a workout that is marked complete but has warning symptoms records it as stopped.
- Custom, USDA and barcode foods are saved directly as diary entries (with a per-100 snapshot) instead of in a separate custom-food list.
- The evening reminder fires only while the app is open, because there is no push server.
- Reset all data also turns sync off, so an empty device does not overwrite the cloud copy.

## Known limitations

- Food values in the offline library are typical averages, not brand-specific.
- `BarcodeDetector` is available mainly in Chromium-based browsers on Android and desktop; other browsers fall back to manual entry.
- The USDA `DEMO_KEY` is heavily rate-limited, so use a personal key in production.
- Function caches are per-instance and in memory.

## Data sources and licences

- USDA FoodData Central: public domain.
- Open Food Facts: Open Database Licence (ODbL); crowd-sourced, so check the label.
- wger: Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0).

## Safety summary

Educational use only, for generally healthy adults. Not medical advice. Seek clinical advice first if any of the listed conditions apply, and stop exercising and seek help at any of the stop signals. 3 kg in 30 days is an upper target; slower progress is normal and still progress.
