-- Extended Waypoint schema (run after 001_init.sql)

alter table activities add column if not exists end_time time;
alter table activities add column if not exists travel_minutes_from_prev int default 0;
alter table activities add column if not exists opening_hours jsonb;
alter table activities add column if not exists photo_name text;
alter table activities add column if not exists schedule_warnings text[];

create unique index if not exists activities_day_sort_uq on activities (day_id, sort_order);
create unique index if not exists activities_day_place_uq on activities (day_id, place_id)
  where place_id is not null;

create table if not exists trip_priorities (
  trip_id uuid primary key references trips(id) on delete cascade,
  must_see text[] default '{}',
  preferred text[] default '{}',
  optional text[] default '{}',
  avoid text[] default '{}',
  ideal_trip text
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

alter table trip_priorities enable row level security;
alter table ai_generations enable row level security;
alter table assistant_messages enable row level security;
alter table trip_shares enable row level security;

create policy trip_priorities_owner on trip_priorities for all using (
  exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid())
);

create policy ai_gen_owner on ai_generations for all using (
  exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid())
);

create policy assistant_owner on assistant_messages for all using (
  exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid())
);

create policy shares_owner on trip_shares for all using (
  exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid())
);

create policy profiles_self on profiles for all using (auth.uid() = id);

alter table profiles enable row level security;
alter table place_popularity_cache enable row level security;
alter table popularity_provider_runs enable row level security;
