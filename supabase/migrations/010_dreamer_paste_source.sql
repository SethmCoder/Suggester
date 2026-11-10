-- Allow paste ingest as a first-class booking source.
alter table dreamer_bookings
  drop constraint if exists dreamer_bookings_source_check;

alter table dreamer_bookings
  add constraint dreamer_bookings_source_check
  check (source in ('email_forward', 'manual', 'paste'));
