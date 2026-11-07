-- Wishlist collections, saved travel ideas, and future trip projects.
-- Owner-scoped with RLS. No destructive changes to existing trip tables.

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

create policy wishlist_collections_owner on wishlist_collections
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy wishlist_items_owner on wishlist_items
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy future_trips_owner on future_trips
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

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
