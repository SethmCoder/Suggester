# Phase 3 — Persistent Travel Intelligence, Trip Wizard & Subscription

## Shared traveler profile architecture

- **Canonical store:** `profiles.traveler_profile.travelIntelligence` (JSON on existing `traveler_profile` jsonb; no new migration).
- **Client cache:** `localStorage` key `waypoint:travel-intelligence-v1` with merge-on-load via `/api/intelligence`.
- **Shape (`TravelIntelligence` v1):**
  - `explicit` — user-set interests, pace, transport, budget, duration, destination types, regions, favorites/avoids.
  - `inferred` — weighted interests with evidence counts, preferred/previous destinations, downranked interests.
  - `personalizationEnabled`, `explanations`, `updatedAt`.
- **Modules:** `src/lib/intelligence/{types,derive,store,sync,server}.ts` + `src/app/api/intelligence/route.ts`.
- Intro dream text from Phase 0 traveler storage hydrates into `favoriteExperiences` without duplicating a second memory system.

## Personalization logic

- Signals: wishlist save/remove, discover save, future-trip create, activity keep/dismiss, explicit set, toggle, reset.
- **One interaction is not permanent:** inferred interests need `evidence >= 2` and `weight >= 1.25` before they enter `effectiveInterests`.
- Explicit preferences always apply; inferred are ignored when personalization is off.
- Downranks (e.g. repeated nightlife dismissals) filter those interests out of effective sets.
- Sensitive traits are never learned; explanations stay about travel interests/budget/duration/destinations.
- Wired into Discover scoring, Compare, trip create/generate interests, Trip Wizard prompts, and place-feedback soft signals.

## Trip Wizard integration

- Assistant route loads travel intelligence + wishlist + future trips from Supabase and passes JSON as traveler context.
- Prompt updates emphasize targeted patches, preserved unaffected days, and preference-aware replacements.
- Still uses existing Groq + local patch fallback; no second AI memory.

## Subscription entitlements

- Existing Stripe checkout + entitlement cookie + `gateFeature` retained (no second payment system).
- Centralized in `src/lib/billing/limits.ts` + `PRO_PRICE_USD` / `PRO_PRICE_ANNUAL_USD` in entitlements.
- **List prices:** Free $0 · Pro monthly **$5.99** · Pro annual **$49.99**.
- Checkout accepts `{ interval: "month" | "year" }`.
- Free: basic discovery, wishlist (5 collections), future trips, compare up to 2 destinations, basic preferences, no generate.
- Pro: advanced personalization, generate, advanced wizard, compare up to 4, unlimited collections (null cap), higher AI quota.
- Expiration does not delete trips/wishlist/future trips; only Pro-gated generation pauses.

## Database changes

- **None.** Reuses `profiles.traveler_profile` jsonb nested key `travelIntelligence`.

## API configurations

| Route | Role |
| --- | --- |
| `GET/PUT/POST /api/intelligence` | Load, replace, or apply signal |
| `POST /api/discover` | Merges server intelligence into filters/context |
| `POST /api/discover/compare` | Intelligence + Free/Pro compare caps |
| `POST /api/trips/[id]/assistant` | Traveler + wishlist + future-trip context |
| `POST /api/trips/create` | Merges effective interests into generation |
| `POST /api/billing/checkout` | Monthly or annual Stripe `price_data` |
| Wishlist collections POST | Free collection cap |

## Security considerations

- Intelligence APIs use existing authenticated Supabase server client + RLS on `profiles`.
- Offline/unauthenticated clients keep localStorage only; remote writes require auth.
- Server-side AI routes receive structured context; no client-trusted entitlement for Pro features.
- Learning excludes sensitive personal characteristics by design.

## UI

- **Profile → Travel preferences:** view/edit/remove, reset, disable personalization, “why these recommendations.”
- **Dashboard:** year-round entry points (Discover, Future Trips, Wishlist, Compare, Preferences, Plan).
- **Discover:** shows preference explanations; Plans page shows Free/Pro copy from `planCopy()`.

## Tests completed

- `src/tests/intelligence.test.ts` — evidence thresholds, downranks, toggle, reset, price/limits.
- Re-ran `discover`, `billing`, `trip-engine` suites (pass).
- `tsc --noEmit` clean.

## Outstanding issues

- Full browser E2E of the 12-step journey still needs a signed-in Supabase + Stripe test session.
- Annual Stripe price uses `price_data` (same pattern as monthly); configure Dashboard Price IDs later if desired for tax/reporting.
- Compare Board default seed lists three destinations; Free users must trim to two before compare succeeds.
- Inferred weights are soft heuristics, not a trained model — quality improves with more repeated signals over time.
