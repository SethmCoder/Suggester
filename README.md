# Waypoint

AI-powered travel itinerary planner built with Next.js, Supabase, Groq, and Google Maps Platform.

## Setup

1. Copy `.env.example` to `.env.local` and fill in keys.
2. Run Supabase migrations in order:
   - `supabase/migrations/001_init.sql`
   - `supabase/migrations/002_waypoint_full_schema.sql`
3. Set a **$1 budget alert** on Google Cloud (Maps still requires billing).
4. `npm install && npm run dev`

### Required environment

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Server trip writes & caches |
| `GROQ_API_KEY` | Itinerary generation |
| `GOOGLE_MAPS_SERVER_KEY` | Geocoding, Places, Routes (server only) |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | Maps JavaScript (referrer-restricted) |

## Demo mode

Use **Try demo** on the home or login page (no API keys required). This starts a cookie-backed demo session with a sample Paris itinerary clearly labeled as demo data. Edits stay in the browser; AI regenerate and live assistant patches require a real account.

## Features

- Supabase auth (sign up, login, password reset, profile)
- Dashboard with trip search and cards
- Four-step trip wizard
- Groq structured itinerary generation with Google place verification
- Popularity signals from public travel RSS (+ optional SerpApi / social API hooks)
- Route-aware scheduling with opening-hours checks
- Itinerary page: expandable days, map, drag-and-drop edits, autosave
- In-itinerary assistant with approve-before-apply patches
- Day regeneration and pace/route actions

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run test` — Vitest (scoring, hours)

## Google free-tier discipline

- Place Details (Enterprise SKU) cached 30 days; hard stop near 900/month
- Routes Essentials field mask only; transit uses per-leg calls
- Place photos served via `/api/places/photo` with usage tracking

## Popularity

See env vars `POPULARITY_*` in `.env.example`. Disabled or failed providers fall back to standard generation without trending labels.
