alter table profiles add column if not exists username text unique;
alter table profiles add column if not exists maps_provider text default 'openstreetmap';
