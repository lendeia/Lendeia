-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — fix null ownerId on delisted rentals
-- PURPOSE   :
--   backend/supabase/rentals.js's queries embed the listing
--   (`listings(name, owner_id)`) inside each rental row — but that
--   embed is itself subject to `listings` RLS. Once a listing is
--   auto-delisted after a completed rental (see
--   limits_delisting_notifications.sql), only two rules covered who
--   could still see it: the public (active listings only) and the
--   listing's OWNER (any status, via listings_select_own_all). A
--   RENTER looking at their OWN completed rental on a now-delisted item
--   matched neither rule, so the embed silently returned nothing —
--   `ownerId` ended up null on that rental — which then caused
--   "leave a review" to fail with a not-null constraint violation on
--   reviewed_user_id, since there was no owner id to review.
--
--   The obvious fix — a `listings` policy that checks
--   `exists (select 1 from rentals where ...)` — causes
--   "infinite recursion detected in policy for relation listings",
--   because `rentals`' own SELECT policy checks back into `listings`
--   (rentals_select_participant), and Postgres re-evaluates each
--   table's RLS every time a policy subquery touches it — the two
--   policies keep triggering each other. The fix is to route the check
--   through a SECURITY DEFINER function: a function call from inside a
--   policy runs under the function's own privilege context rather than
--   re-entering the calling policy chain, breaking the cycle — the same
--   pattern already used safely elsewhere in this project (e.g.
--   get_or_create_conversation in messaging.sql).
-- CONNECTS TO :
--   Adds one more listings SELECT policy alongside
--   listings_select_active and listings_select_own_all (all three are
--   OR'd together by Postgres RLS). Fixes backend/supabase/rentals.js's
--   getMyRentals()/createRental()/setRentalStatus() embeds and
--   frontend/pages/Dashboard/Dashboard.jsx's review flow.
-- ==================================================================

create or replace function user_has_rental_on_listing(p_listing_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from rentals r
    where r.listing_id = p_listing_id and r.renter_id = p_user_id
  );
$$;

drop policy if exists listings_select_via_own_rental on listings;
create policy listings_select_via_own_rental on listings
  for select using (user_has_rental_on_listing(id, auth.uid()));

notify pgrst, 'reload schema';
