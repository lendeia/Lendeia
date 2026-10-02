-- ==================================================================
-- FILE TYPE : SUPABASE SCHEMA — TABLE
-- PURPOSE   :
--   Extended profile data (rating, review/rental counts) kept separate from
--   `users` (auth identity), plus the saved_listings bookmark join table.
-- CONNECTS TO :
--   profiles.user_id -> users(id). saved_listings joins users<->listings.
--   RLS in database/policies/profiles.sql. Queries in database/queries/profiles.sql.
-- ==================================================================
-- Extended profile data, kept separate from `users` (auth identity)
create table if not exists profiles (
  user_id uuid primary key references users(id) on delete cascade,
  rating numeric(2,1) not null default 0,
  review_count integer not null default 0,
  rental_history_count integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Saved/bookmarked listings, many-to-many
create table if not exists saved_listings (
  user_id uuid not null references users(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
