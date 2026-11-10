-- Community hotel stays from confirmation pastes (no confirmation codes).
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
