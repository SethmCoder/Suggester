-- First-party product analytics (signup → plan-trip funnel, etc.)
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

-- Users can insert their own events; only service role reads aggregates.
drop policy if exists analytics_events_insert_own on analytics_events;
create policy analytics_events_insert_own on analytics_events
  for insert
  with check (auth.uid() = user_id);

drop policy if exists analytics_events_select_own on analytics_events;
create policy analytics_events_select_own on analytics_events
  for select
  using (auth.uid() = user_id);
