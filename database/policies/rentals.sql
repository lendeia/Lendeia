-- ==================================================================
-- FILE TYPE : SUPABASE RLS POLICIES
-- PURPOSE   :
--   Row-level security for `rentals`: visible to the renter or the listing
--   owner only; only the renter can create; either party can update status.
-- CONNECTS TO :
--   Applies to the table in database/schema/rentals.sql.
-- ==================================================================
-- Row-level security for `rentals`.
alter table rentals enable row level security;

-- A rental is visible to the renter or the listing's owner
create policy rentals_select_participant on rentals
  for select using (
    renter_id = auth.uid()
    or exists (
      select 1 from listings l
      where l.id = rentals.listing_id and l.owner_id = auth.uid()
    )
  );

-- Only the renter can create a rental request in their own name
create policy rentals_insert_own on rentals
  for insert with check (renter_id = auth.uid());

-- Either participant can update status (accept/decline/cancel)
create policy rentals_update_participant on rentals
  for update using (
    renter_id = auth.uid()
    or exists (
      select 1 from listings l
      where l.id = rentals.listing_id and l.owner_id = auth.uid()
    )
  );
