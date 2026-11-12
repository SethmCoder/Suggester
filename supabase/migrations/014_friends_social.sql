-- Friends, social activity, and resource shares (v1)

create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  constraint friendships_not_self check (requester_id <> addressee_id)
);

create unique index if not exists friendships_pair_uq on friendships (
  least(requester_id, addressee_id),
  greatest(requester_id, addressee_id)
);

create index if not exists friendships_addressee_pending_idx
  on friendships (addressee_id, created_at desc)
  where status = 'pending';

create index if not exists friendships_requester_idx
  on friendships (requester_id, created_at desc);

create table if not exists social_activity (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  subject_type text,
  subject_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists social_activity_actor_idx
  on social_activity (actor_id, created_at desc);

create index if not exists social_activity_created_idx
  on social_activity (created_at desc);

-- Recipient read access on trip shares
drop policy if exists shares_recipient on trip_shares;
create policy shares_recipient on trip_shares
  for select using (shared_with_user_id = auth.uid());

create table if not exists future_trip_shares (
  id uuid primary key default gen_random_uuid(),
  future_trip_id uuid not null references future_trips(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  shared_with_user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null check (permission in ('view', 'edit')),
  created_at timestamptz not null default now(),
  unique (future_trip_id, shared_with_user_id)
);

create index if not exists future_trip_shares_recipient_idx
  on future_trip_shares (shared_with_user_id, created_at desc);

create table if not exists wishlist_collection_shares (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references wishlist_collections(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  shared_with_user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null check (permission in ('view', 'edit')),
  created_at timestamptz not null default now(),
  unique (collection_id, shared_with_user_id)
);

create index if not exists wishlist_collection_shares_recipient_idx
  on wishlist_collection_shares (shared_with_user_id, created_at desc);

alter table friendships enable row level security;
alter table social_activity enable row level security;
alter table future_trip_shares enable row level security;
alter table wishlist_collection_shares enable row level security;

create policy friendships_participant on friendships
  for all using (
    auth.uid() = requester_id or auth.uid() = addressee_id
  )
  with check (
    auth.uid() = requester_id or auth.uid() = addressee_id
  );

create policy social_activity_actor on social_activity
  for insert with check (auth.uid() = actor_id);

create policy social_activity_read on social_activity
  for select using (
    auth.uid() = actor_id
    or exists (
      select 1 from friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = social_activity.actor_id)
          or (f.addressee_id = auth.uid() and f.requester_id = social_activity.actor_id)
        )
    )
  );

create policy future_trip_shares_owner on future_trip_shares
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy future_trip_shares_recipient on future_trip_shares
  for select using (shared_with_user_id = auth.uid());

create policy wishlist_collection_shares_owner on wishlist_collection_shares
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy wishlist_collection_shares_recipient on wishlist_collection_shares
  for select using (shared_with_user_id = auth.uid());
