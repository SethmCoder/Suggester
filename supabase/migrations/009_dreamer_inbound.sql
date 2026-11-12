-- Dreamer inbound mailbox, raw emails, and TripIt-like booking cards.
-- Extends future_trips; no destructive changes to trips.
--
-- Note (app policy): paste + inbound API routes no longer persist text_body /
-- html_body (store null). Columns remain for schema compatibility; parsed
-- dreamer_bookings metadata is what lives in the cloud. Clients may keep the
-- raw body in sessionStorage key waypoint:dreamer-email:<bookingId>.

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
    check (source in ('email_forward', 'manual')),
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

create policy dreamer_mailboxes_owner on dreamer_mailboxes
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy inbound_emails_owner on inbound_emails
  for select using (auth.uid() = owner_id);

create policy dreamer_bookings_owner on dreamer_bookings
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
