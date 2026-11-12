-- One-time Trip Pass entitlements (per trip). Owner-only RLS.
-- Plus subscription remains on profiles.subscription_tier = 'pro' (internal id).

create table if not exists trip_passes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, trip_id)
);

create unique index if not exists trip_passes_stripe_session_uidx
  on trip_passes (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists trip_passes_user_idx
  on trip_passes (user_id, created_at desc);

create index if not exists trip_passes_trip_idx
  on trip_passes (trip_id);

create index if not exists trip_passes_active_idx
  on trip_passes (user_id, trip_id, expires_at);

alter table trip_passes enable row level security;

drop policy if exists trip_passes_select_own on trip_passes;
create policy trip_passes_select_own
  on trip_passes for select
  using (auth.uid() = user_id);

-- Inserts/updates are performed by the service role from Stripe webhooks.
-- Authenticated clients may read their own rows only.
drop policy if exists trip_passes_insert_own on trip_passes;
drop policy if exists trip_passes_update_own on trip_passes;
drop policy if exists trip_passes_delete_own on trip_passes;
