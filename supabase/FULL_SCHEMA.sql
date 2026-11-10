-- =============================================================================
-- Waypoint — full schema (idempotent)
-- =============================================================================
-- Paste into Supabase SQL Editor and Run. Safe to re-run:
--   • tables/indexes/columns use IF NOT EXISTS
--   • policies are dropped then recreated
--   • constraints are dropped then re-added
-- Does not delete data. Does not drop tables.
-- Covers migrations 001–009.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Profiles
-- -----------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);

alter table profiles add column if not exists username text;
alter table profiles add column if not exists maps_provider text default 'openstreetmap';
alter table profiles add column if not exists subscription_tier text not null default 'free';
alter table profiles add column if not exists subscription_period text;
alter table profiles add column if not exists ai_requests_used int not null default 0;
alter table profiles add column if not exists stripe_customer_id text;
alter table profiles add column if not exists traveler_profile jsonb;

create unique index if not exists profiles_username_uq
  on profiles (username)
  where username is not null;

alter table profiles drop constraint if exists profiles_subscription_tier_check;
alter table profiles
  add constraint profiles_subscription_tier_check
  check (subscription_tier in ('free', 'pro'));

alter table profiles enable row level security;

drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- 2. Trips + itinerary
-- -----------------------------------------------------------------------------
create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  destination text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'draft',
  cover_image_url text,
  idempotency_key text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists trips_idempotency_key_uq
  on trips (idempotency_key)
  where idempotency_key is not null;

create index if not exists trips_owner_idx
  on trips (owner_id, updated_at desc);

create table if not exists trip_preferences (
  trip_id uuid primary key references trips(id) on delete cascade,
  payload jsonb not null
);

create table if not exists trip_priorities (
  trip_id uuid primary key references trips(id) on delete cascade,
  must_see text[] default '{}',
  preferred text[] default '{}',
  optional text[] default '{}',
  avoid text[] default '{}',
  ideal_trip text
);

create table if not exists itinerary_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  day_index int not null,
  unique (trip_id, day_index)
);

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references itinerary_days(id) on delete cascade,
  place_id text,
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  start_time time,
  duration_minutes int,
  priority text,
  planning_note text,
  hours_verified boolean default false,
  website_uri text,
  google_maps_uri text,
  popularity_label text,
  popularity_sources text[],
  popularity_attribution_urls text[],
  sort_order int not null,
  user_locked boolean default false,
  completed boolean default false,
  source text default 'ai'
);

alter table activities add column if not exists end_time time;
alter table activities add column if not exists travel_minutes_from_prev int default 0;
alter table activities add column if not exists opening_hours jsonb;
alter table activities add column if not exists photo_name text;
alter table activities add column if not exists schedule_warnings text[];

create unique index if not exists activities_day_sort_uq
  on activities (day_id, sort_order);
create unique index if not exists activities_day_place_uq
  on activities (day_id, place_id)
  where place_id is not null;

create table if not exists ai_generations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  kind text not null,
  request jsonb,
  response jsonb,
  created_at timestamptz default now()
);

create table if not exists assistant_messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  role text not null,
  content text not null,
  pending_patch jsonb,
  created_at timestamptz default now()
);

create table if not exists trip_shares (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  share_token text unique not null,
  permission text not null check (permission in ('view', 'edit')),
  shared_with_user_id uuid references auth.users(id),
  created_at timestamptz default now()
);

alter table trips enable row level security;
alter table trip_preferences enable row level security;
alter table trip_priorities enable row level security;
alter table itinerary_days enable row level security;
alter table activities enable row level security;
alter table ai_generations enable row level security;
alter table assistant_messages enable row level security;
alter table trip_shares enable row level security;

drop policy if exists trips_owner on trips;
create policy trips_owner on trips
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists prefs_owner on trip_preferences;
create policy prefs_owner on trip_preferences
  for all using (
    exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid())
  );

drop policy if exists trip_priorities_owner on trip_priorities;
create policy trip_priorities_owner on trip_priorities
  for all using (
    exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid())
  );

drop policy if exists days_owner on itinerary_days;
create policy days_owner on itinerary_days
  for all using (
    exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid())
  );

drop policy if exists activities_owner on activities;
create policy activities_owner on activities
  for all using (
    exists (
      select 1 from itinerary_days d
      join trips t on t.id = d.trip_id
      where d.id = day_id and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from itinerary_days d
      join trips t on t.id = d.trip_id
      where d.id = day_id and t.owner_id = auth.uid()
    )
  );

drop policy if exists ai_gen_owner on ai_generations;
create policy ai_gen_owner on ai_generations
  for all using (
    exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid())
  );

drop policy if exists assistant_owner on assistant_messages;
create policy assistant_owner on assistant_messages
  for all using (
    exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid())
  );

drop policy if exists shares_owner on trip_shares;
create policy shares_owner on trip_shares
  for all using (
    exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 3. Caches + usage (service role writes; RLS on, no client policies)
-- -----------------------------------------------------------------------------
create table if not exists place_popularity_cache (
  destination_key text primary key,
  payload jsonb not null,
  retrieved_at timestamptz not null default now()
);

create table if not exists popularity_provider_runs (
  id uuid primary key default gen_random_uuid(),
  destination_key text not null,
  provider text not null,
  success boolean not null,
  retrieved_at timestamptz default now()
);

create table if not exists place_cache (
  place_id text primary key,
  payload jsonb not null,
  retrieved_at timestamptz not null default now()
);

create table if not exists route_cache (
  cache_key text primary key,
  payload jsonb not null,
  retrieved_at timestamptz not null default now()
);

create table if not exists api_usage (
  sku text not null,
  month_key text not null,
  count int not null default 0,
  primary key (sku, month_key)
);

alter table place_popularity_cache enable row level security;
alter table popularity_provider_runs enable row level security;
alter table place_cache enable row level security;
alter table route_cache enable row level security;
alter table api_usage enable row level security;

-- -----------------------------------------------------------------------------
-- 4. Hotels catalog (public read; service role writes)
-- -----------------------------------------------------------------------------
create table if not exists hotels (
  id uuid primary key default gen_random_uuid(),
  osm_id text not null,
  osm_type text not null check (osm_type in ('node', 'way', 'relation')),
  wikidata_id text,
  name text not null,
  property_type text not null,
  latitude double precision not null,
  longitude double precision not null,
  address text,
  city text,
  region text,
  country text,
  country_code text,
  postal_code text,
  website text,
  phone text,
  email text,
  star_rating numeric,
  amenities jsonb not null default '[]'::jsonb,
  check_in text,
  check_out text,
  chain text,
  opened_on text,
  last_verified_at timestamptz,
  source text not null default 'openstreetmap',
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (osm_type, osm_id)
);

create index if not exists hotels_city_idx on hotels (city);
create index if not exists hotels_country_idx on hotels (country_code);
create index if not exists hotels_type_idx on hotels (property_type);
create index if not exists hotels_name_idx on hotels (name);
create index if not exists hotels_lat_lng_idx on hotels (latitude, longitude);

create table if not exists hotel_import_runs (
  id uuid primary key default gen_random_uuid(),
  region_key text not null,
  status text not null,
  fetched int not null default 0,
  upserted int not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists hotel_import_runs_region_idx
  on hotel_import_runs (region_key, started_at desc);

alter table hotels enable row level security;
alter table hotel_import_runs enable row level security;

drop policy if exists hotels_public_read on hotels;
create policy hotels_public_read on hotels for select using (true);

do $$
begin
  create extension if not exists postgis;
  alter table hotels add column if not exists geog geography(Point, 4326);
  update hotels
    set geog = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
    where geog is null;
  create index if not exists hotels_geog_idx on hotels using gist (geog);
  create or replace function hotels_set_geog() returns trigger
  language plpgsql as $f$
  begin
    new.geog := ST_SetSRID(ST_MakePoint(new.longitude, new.latitude), 4326)::geography;
    return new;
  end;
  $f$;
  drop trigger if exists hotels_geog on hotels;
  create trigger hotels_geog
    before insert or update on hotels
    for each row execute function hotels_set_geog();
exception when others then
  raise notice 'PostGIS skipped: %', sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Wishlist + future trips (Dreamer projects)
-- -----------------------------------------------------------------------------
create table if not exists wishlist_collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wishlist_collections_owner_idx
  on wishlist_collections (owner_id, created_at desc);

create table if not exists wishlist_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid references wishlist_collections(id) on delete set null,
  name text not null,
  location text,
  description text,
  category text not null default 'custom'
    check (category in (
      'destination', 'attraction', 'restaurant', 'cafe', 'museum',
      'hotel', 'neighborhood', 'outdoor', 'experience', 'custom'
    )),
  source_url text,
  external_place_id text,
  photo_url text,
  photo_attribution text,
  estimated_price text,
  notes text,
  priority text not null default 'medium'
    check (priority in ('high', 'medium', 'low')),
  lat double precision,
  lng double precision,
  address text,
  associated_trip_id uuid references trips(id) on delete set null,
  associated_future_trip_id uuid,
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wishlist_items_owner_idx
  on wishlist_items (owner_id, saved_at desc);
create index if not exists wishlist_items_collection_idx
  on wishlist_items (collection_id);
create index if not exists wishlist_items_location_idx
  on wishlist_items (owner_id, location);
create index if not exists wishlist_items_category_idx
  on wishlist_items (owner_id, category);
create index if not exists wishlist_items_external_idx
  on wishlist_items (owner_id, external_place_id)
  where external_place_id is not null;

create table if not exists future_trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text,
  destination text not null,
  status text not null default 'wishlist'
    check (status in (
      'wishlist', 'researching', 'comparing', 'planning',
      'ready', 'completed', 'archived'
    )),
  potential_start date,
  potential_end date,
  estimated_duration_days int,
  travelers int,
  budget numeric,
  currency text default 'USD',
  interests text[] default '{}',
  transport text,
  notes text,
  preferences jsonb not null default '{}'::jsonb,
  cover_image_url text,
  converted_trip_id uuid references trips(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists future_trips_owner_idx
  on future_trips (owner_id, updated_at desc);
create index if not exists future_trips_status_idx
  on future_trips (owner_id, status);

alter table wishlist_items
  drop constraint if exists wishlist_items_associated_future_trip_id_fkey;
alter table wishlist_items
  add constraint wishlist_items_associated_future_trip_id_fkey
  foreign key (associated_future_trip_id) references future_trips(id) on delete set null;

create table if not exists future_trip_wishlist_items (
  future_trip_id uuid not null references future_trips(id) on delete cascade,
  wishlist_item_id uuid not null references wishlist_items(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (future_trip_id, wishlist_item_id)
);

create table if not exists future_trip_plans (
  id uuid primary key default gen_random_uuid(),
  future_trip_id uuid not null references future_trips(id) on delete cascade,
  label text not null default 'Draft',
  payload jsonb not null default '{}'::jsonb,
  estimated_expenses text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists future_trip_plans_future_idx
  on future_trip_plans (future_trip_id, created_at desc);

alter table wishlist_collections enable row level security;
alter table wishlist_items enable row level security;
alter table future_trips enable row level security;
alter table future_trip_wishlist_items enable row level security;
alter table future_trip_plans enable row level security;

drop policy if exists wishlist_collections_owner on wishlist_collections;
create policy wishlist_collections_owner on wishlist_collections
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists wishlist_items_owner on wishlist_items;
create policy wishlist_items_owner on wishlist_items
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists future_trips_owner on future_trips;
create policy future_trips_owner on future_trips
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists future_trip_wishlist_owner on future_trip_wishlist_items;
create policy future_trip_wishlist_owner on future_trip_wishlist_items
  for all using (
    exists (
      select 1 from future_trips t
      where t.id = future_trip_id and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from future_trips t
      where t.id = future_trip_id and t.owner_id = auth.uid()
    )
  );

drop policy if exists future_trip_plans_owner on future_trip_plans;
create policy future_trip_plans_owner on future_trip_plans
  for all using (
    exists (
      select 1 from future_trips t
      where t.id = future_trip_id and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from future_trips t
      where t.id = future_trip_id and t.owner_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 6. Dreamer inbound email + bookings
-- -----------------------------------------------------------------------------
create table if not exists dreamer_mailboxes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  address text not null,
  created_at timestamptz not null default now(),
  unique (owner_id),
  unique (token)
);

create index if not exists dreamer_mailboxes_token_idx on dreamer_mailboxes (token);

create table if not exists inbound_emails (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  owner_id uuid references auth.users(id) on delete set null,
  from_address text,
  to_addresses text[] not null default '{}',
  subject text,
  text_body text,
  html_body text,
  received_at timestamptz not null default now(),
  status text not null default 'received'
    check (status in ('received', 'parsed', 'matched', 'unassigned', 'failed')),
  parse_error text,
  unique (message_id)
);

create index if not exists inbound_emails_owner_idx
  on inbound_emails (owner_id, received_at desc);

create table if not exists dreamer_bookings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  future_trip_id uuid references future_trips(id) on delete set null,
  trip_id uuid references trips(id) on delete set null,
  inbound_email_id uuid references inbound_emails(id) on delete set null,
  kind text not null default 'other'
    check (kind in ('flight', 'hotel', 'rail', 'other')),
  title text not null,
  parsed jsonb not null default '{}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  match_score double precision,
  source text not null default 'email_forward'
    check (source in ('email_forward', 'manual', 'paste')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dreamer_bookings_owner_idx
  on dreamer_bookings (owner_id, created_at desc);
create index if not exists dreamer_bookings_future_idx
  on dreamer_bookings (future_trip_id);

alter table dreamer_mailboxes enable row level security;
alter table inbound_emails enable row level security;
alter table dreamer_bookings enable row level security;

drop policy if exists dreamer_mailboxes_owner on dreamer_mailboxes;
create policy dreamer_mailboxes_owner on dreamer_mailboxes
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists inbound_emails_owner on inbound_emails;
create policy inbound_emails_owner on inbound_emails
  for select using (auth.uid() = owner_id);

drop policy if exists dreamer_bookings_owner on dreamer_bookings;
create policy dreamer_bookings_owner on dreamer_bookings
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- =============================================================================
-- 7. Product analytics
-- =============================================================================

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  path text,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_name_created_idx
  on analytics_events (event_name, created_at desc);

create index if not exists analytics_events_user_created_idx
  on analytics_events (user_id, created_at desc);

alter table analytics_events enable row level security;

drop policy if exists analytics_events_insert_own on analytics_events;
create policy analytics_events_insert_own on analytics_events
  for insert
  with check (auth.uid() = user_id);

drop policy if exists analytics_events_select_own on analytics_events;
create policy analytics_events_select_own on analytics_events
  for select
  using (auth.uid() = user_id);

-- =============================================================================
-- 8. Community flights (from user confirmation pastes)
-- =============================================================================

create table if not exists user_flights (
  id uuid primary key default gen_random_uuid(),
  flight_number text not null,
  from_iata text not null,
  to_iata text not null,
  travel_date date not null,
  departure_local text,
  arrival_local text,
  cabin text,
  airline text,
  report_count integer not null default 1 check (report_count >= 1),
  first_reported_by uuid references auth.users(id) on delete set null,
  last_reported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (flight_number, travel_date, from_iata, to_iata)
);

create index if not exists user_flights_number_date_idx
  on user_flights (flight_number, travel_date desc);

create index if not exists user_flights_route_date_idx
  on user_flights (from_iata, to_iata, travel_date desc);

alter table user_flights enable row level security;

drop policy if exists user_flights_select_authenticated on user_flights;
create policy user_flights_select_authenticated on user_flights
  for select
  using (auth.uid() is not null);

-- =============================================================================
-- 9. Community hotel stays (from user confirmation pastes)
-- =============================================================================

create table if not exists user_stays (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  hotel_name text not null,
  check_in date not null,
  check_out date,
  nights integer,
  report_count integer not null default 1 check (report_count >= 1),
  first_reported_by uuid references auth.users(id) on delete set null,
  last_reported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city, hotel_name, check_in)
);

create index if not exists user_stays_city_checkin_idx
  on user_stays (city, check_in desc);

alter table user_stays enable row level security;

drop policy if exists user_stays_select_authenticated on user_stays;
create policy user_stays_select_authenticated on user_stays
  for select
  using (auth.uid() is not null);

-- =============================================================================
-- Done. Verify Dreamer tables exist:
--   select to_regclass('public.inbound_emails'),
--          to_regclass('public.dreamer_bookings'),
--          to_regclass('public.future_trips'),
--          to_regclass('public.user_flights'),
--          to_regclass('public.user_stays');
-- =============================================================================
