-- ==================================================================
-- FILE TYPE : SUPABASE RLS POLICIES
-- PURPOSE   :
--   Row-level security for `profiles` (public read, self-only write) and
--   `saved_listings` (fully private to its owner).
-- CONNECTS TO :
--   Applies to tables in database/schema/profiles.sql.
-- ==================================================================
-- Row-level security for `profiles` and `saved_listings`.
alter table profiles enable row level security;
alter table saved_listings enable row level security;

-- Profiles are publicly readable (ratings/review counts shown on listings)
create policy profiles_select_all on profiles
  for select using (true);

-- Only the user themselves can update their own profile row
create policy profiles_update_own on profiles
  for update using (user_id = auth.uid());

create policy profiles_insert_own on profiles
  for insert with check (user_id = auth.uid());

-- Saved listings are private to the user who saved them
create policy saved_listings_owner_only on saved_listings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
