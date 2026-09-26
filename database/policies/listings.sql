-- ==================================================================
-- FILE TYPE : SUPABASE RLS POLICIES
-- PURPOSE   :
--   Row-level security for `listings`: public read of active listings, but
--   insert/update/delete restricted to the owning user (auth.uid()).
-- CONNECTS TO :
--   Applies to the table in database/schema/listings.sql. Works unchanged with
--   anonymous Supabase auth users, since anon sessions still have a auth.uid().
-- ==================================================================
-- Row-level security for `listings`. Assumes an auth layer that sets
-- current_setting('app.user_id') or an equivalent auth.uid() (Supabase-style).

alter table listings enable row level security;

-- Anyone can read active listings (public marketplace browsing)
create policy listings_select_active on listings
  for select using (is_active = true);

-- Only the owner can insert/update/delete their own listings
create policy listings_insert_own on listings
  for insert with check (owner_id = auth.uid());

create policy listings_update_own on listings
  for update using (owner_id = auth.uid());

create policy listings_delete_own on listings
  for delete using (owner_id = auth.uid());
