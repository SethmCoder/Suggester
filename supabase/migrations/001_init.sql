-- Waypoint core + popularity cache

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  destination text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'draft',
  cover_image_url text,
  idempotency_key text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists trip_preferences (
  trip_id uuid primary key references trips(id) on delete cascade,
  payload jsonb not null
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

alter table trips enable row level security;
alter table trip_preferences enable row level security;
alter table itinerary_days enable row level security;
alter table activities enable row level security;

create policy trips_owner on trips for all using (auth.uid() = owner_id);
create policy prefs_owner on trip_preferences for all using (
  exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid())
);
create policy days_owner on itinerary_days for all using (
  exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid())
);
create policy activities_owner on activities for all using (
  exists (
    select 1 from itinerary_days d
    join trips t on t.id = d.trip_id
    where d.id = day_id and t.owner_id = auth.uid()
  )
);
