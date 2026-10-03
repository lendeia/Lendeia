-- ==================================================================
-- FILE TYPE : SUPABASE SCHEMA — TABLE
-- PURPOSE   :
--   Equipment listings owned/managed by users. Mirrors the shape produced by
--   backend/listings/createListing.js and consumed by frontend Browse/Map/Details.
-- CONNECTS TO :
--   FKs to users(id). Row-level security lives in database/policies/listings.sql.
--   Prewritten CRUD SQL lives in database/queries/listings.sql.
--   See database/schema/stricter_listing_rules.sql for extra validation added
--   on top of this base table (min photos, price ceiling, plan limits, etc).
-- ==================================================================
-- Equipment listings owned/managed by users
create table if not exists listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  name text not null,
  brand text,
  model text,
  category text not null,
  price_per_day numeric(10,2) not null check (price_per_day > 0),
  condition text not null default 'Good',
  description text,
  location text not null,
  latitude double precision,
  longitude double precision,
  primary_image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_listings_owner on listings(owner_id);
create index if not exists idx_listings_category on listings(category);