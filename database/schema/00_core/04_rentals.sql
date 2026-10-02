-- ==================================================================
-- FILE TYPE : SUPABASE SCHEMA — TABLE
-- PURPOSE   :
--   Rental requests between a renter and a listing's owner (Pending -> Accepted
--   /Declined -> Completed/Cancelled). Mirrors backend/rentals/*.js and the
--   `requests` array in state/rentals/rentalsStore.jsx.
-- CONNECTS TO :
--   FKs to listings(id) and users(id). RLS in database/policies/rentals.sql.
--   Queries in database/queries/rentals.sql.
-- ==================================================================
-- Rental requests between a renter and a listing's owner
create table if not exists rentals (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  renter_id uuid not null references users(id) on delete cascade,
  start_date date not null,
  end_date date not null check (end_date > start_date),
  price_per_day numeric(10,2) not null,
  status text not null default 'Pending', -- Pending | Accepted | Completed | Declined | Cancelled
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_rentals_listing on rentals(listing_id);
create index if not exists idx_rentals_renter on rentals(renter_id);
create index if not exists idx_rentals_status on rentals(status);
