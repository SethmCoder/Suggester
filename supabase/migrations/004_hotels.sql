-- Hotel catalog. Reference data is public OpenStreetMap; only the service role writes it.

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

create index if not exists hotel_import_runs_region_idx on hotel_import_runs (region_key, started_at desc);

alter table hotels enable row level security;
alter table hotel_import_runs enable row level security;

drop policy if exists hotels_public_read on hotels;
create policy hotels_public_read on hotels for select using (true);

-- No insert, update, or delete policies. The service role bypasses RLS.

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
