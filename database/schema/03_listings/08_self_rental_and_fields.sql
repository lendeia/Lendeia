-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — self-rental prevention + real-data fields
-- PURPOSE   :
--   1) Guarantees a user can never rent their own listing, enforced in
--      TWO independent layers so a mistake in one doesn't leave a gap:
--        a) RLS: the insert policy on `rentals` now also requires the
--           renter is NOT the listing's owner.
--        b) A BEFORE INSERT/UPDATE trigger that re-checks the same rule
--           directly against the `listings` table. This matters because
--           RLS can be bypassed by code running with the service_role key
--           (e.g. a future server-side job) — the trigger fires regardless
--           of which key/role performed the write, so self-rental stays
--           blocked even if RLS is ever misconfigured or intentionally
--           bypassed elsewhere.
--   2) Adds `availability_note` to `listings` (a short human-readable
--      status like "Available now") and confirms `latitude`/`longitude`
--      exist, since backend/supabase/listings.js now writes real rows
--      instead of the old backend/listings/*.js mocks.
-- CONNECTS TO :
--   Enforced against database/schema/rentals.sql + listings.sql.
--   Consumed by backend/supabase/rentals.js (createRental) and
--   backend/supabase/listings.js (createListing/updateListing).
-- ==================================================================

-- ---- Self-rental prevention: RLS layer ----
drop policy if exists rentals_insert_own on rentals;
create policy rentals_insert_own on rentals
  for insert with check (
    renter_id = auth.uid()
    and not exists (
      select 1 from listings l
      where l.id = listing_id and l.owner_id = auth.uid()
    )
  );

-- ---- Self-rental prevention: trigger layer (defense in depth) ----
create or replace function reject_self_rental()
returns trigger as $$
declare
  v_owner_id uuid;
begin
  select owner_id into v_owner_id from listings where id = new.listing_id;

  if v_owner_id is null then
    raise exception 'Listing % does not exist.', new.listing_id
      using errcode = '23503'; -- foreign_key_violation
  end if;

  if v_owner_id = new.renter_id then
    raise exception 'You cannot rent your own listing.'
      using errcode = '23514'; -- check_violation
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_reject_self_rental on rentals;
create trigger trg_reject_self_rental
  before insert or update of listing_id, renter_id on rentals
  for each row execute function reject_self_rental();

-- ---- Fields needed for real (non-mock) listing data ----
alter table listings
  add column if not exists availability_note text not null default 'Available now';

-- latitude/longitude already exist in database/schema/listings.sql;
-- this is just a safety no-op if this migration runs on a fresh DB where
-- that file hasn't been applied in some non-standard order.
alter table listings
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;
