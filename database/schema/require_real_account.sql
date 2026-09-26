-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — require a real account to list/rent
-- PURPOSE   :
--   The frontend now blocks anonymous users from creating a listing or
--   requesting a rental (see state/listings/listingsStore.jsx and
--   state/rentals/rentalsStore.jsx) — but a frontend-only check can
--   always be bypassed by calling the Supabase API directly, the same
--   way self-rental prevention or the "who can accept a rental" rule
--   could be if they only lived in the UI. This migration enforces the
--   identical rule at the RLS layer, using the `is_anonymous` column
--   that's kept in sync automatically by anonymous_auth.sql's
--   sync_is_anonymous trigger.
-- CONNECTS TO :
--   Tightens the insert policies from database/policies/listings.sql and
--   database/policies/rentals.sql. Depends on database/schema/anonymous_auth.sql
--   already being applied (for users.is_anonymous to exist).
-- ==================================================================

drop policy if exists listings_insert_own on listings;
create policy listings_insert_own on listings
  for insert with check (
    owner_id = auth.uid()
    and exists (
      select 1 from users u
      where u.id = auth.uid() and u.is_anonymous = false
    )
  );

drop policy if exists rentals_insert_own on rentals;
create policy rentals_insert_own on rentals
  for insert with check (
    renter_id = auth.uid()
    and not exists (
      select 1 from listings l
      where l.id = listing_id and l.owner_id = auth.uid()
    )
    and exists (
      select 1 from users u
      where u.id = auth.uid() and u.is_anonymous = false
    )
  );
