# Waypoint

AI-powered travel itinerary planner built with Next.js, Supabase, Groq, and Google Maps Platform.

## Setup (local)

1. Copy `.env.example` to `.env` (or `.env.local`) and fill in keys.
2. Run Supabase SQL migrations (or `supabase/FULL_SCHEMA.sql`), including
   `011_analytics_events.sql` for signup→plan funnel stats.
3. Set a **$1 budget alert** on Google Cloud (Maps still requires billing).
4. `npm install && npm run dev`

### Required environment

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL (Vercel production domain) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Server trip writes & caches |
| `GROQ_API_KEY` | Itinerary generation + assistant |
| `MAPS_PROVIDER` | `openstreetmap` (default) or `google` |
| `GOOGLE_MAPS_*` | Optional — only if you choose Google in Settings |

## Deploy on Vercel

1. Import the GitHub repo (`SethmCoder/Suggester`) into [Vercel](https://vercel.com).
2. Framework preset: **Next.js** (`vercel.json` included).
3. Add the env vars above in **Project → Settings → Environment Variables** (Production + Preview).
4. Deploy. Note the URL, e.g. `https://suggester.vercel.app`.
5. Set `NEXT_PUBLIC_SITE_URL` to that URL and redeploy.

### Connect Supabase

1. Create a Supabase project.
2. Paste URL + anon key + service role key into Vercel env.
3. In Supabase **SQL Editor**, run both migration files.
4. In Supabase **Authentication → URL configuration**:
   - **Site URL:** `https://your-app.vercel.app`
   - **Redirect URLs:**  
     `https://your-app.vercel.app/auth/callback`  
     `http://localhost:3000/auth/callback`  
     `http://localhost:3001/auth/callback`
5. Optional: enable Email provider (default) for sign-up.

After that, sign-up, create trip, and the itinerary maker assistant all use live Supabase storage.

## Demo mode

**Try demo** works with no keys. Sample Paris trip; assistant still handles flight delays / place swaps locally (approve to apply).

## Itinerary maker assistant

On any itinerary page, open **Ask itinerary maker** to:

- Swap or remove a place (“Change the Louvre to Musée d'Orsay”)
- Shift a day for delays (“My flight is delayed by 2 hours on day 1”)
- Lighten a day, move stops, get follow-up suggestions

Changes show as a **proposed patch** — nothing applies until you approve.

## Features

- Supabase auth (sign up, login, password reset, profile)
- Dashboard with trip search and cards
- Four-step trip wizard + AI generation
- Popularity signals (optional)
- Route-aware scheduling + opening-hours checks
- Map / schedule views, drag-and-drop edits, autosave
- Conversational itinerary maker (delays, place changes)
- Day regenerate actions
- First-party signup → plan funnel (Settings → Product funnel)

## Scripts

- `npm run dev` — local server
- `npm run build` — production build (same as Vercel)
- `npm run test` — Vitest
