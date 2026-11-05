-- Pro entitlement and monthly AI usage. Service role writes. Clients cannot upgrade themselves.

alter table profiles add column if not exists subscription_tier text not null default 'free';
alter table profiles add column if not exists subscription_period text;
alter table profiles add column if not exists ai_requests_used int not null default 0;

alter table profiles drop constraint if exists profiles_subscription_tier_check;
alter table profiles
  add constraint profiles_subscription_tier_check
  check (subscription_tier in ('free', 'pro'));
