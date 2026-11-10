-- Community flight schedule built from user confirmation pastes / forwards.
-- Stores schedule facts only — never confirmation / PNR codes.
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

-- Anyone signed in can read the shared schedule database.
drop policy if exists user_flights_select_authenticated on user_flights;
create policy user_flights_select_authenticated on user_flights
  for select
  using (auth.uid() is not null);

-- Inserts/updates go through the service role (Dreamer paste / inbound).
-- No direct client writes of raw rows.
