-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — rental status transition rules
-- PURPOSE   :
--   The existing `rentals_update_participant` RLS policy
--   (database/policies/rentals.sql) allows EITHER the renter or the
--   listing owner to update a rental's status — but it doesn't
--   distinguish WHICH status changes each party may make. As written, a
--   renter could set their own pending request to "Accepted" themselves,
--   which defeats the entire point of an approval flow. This migration
--   adds a trigger enforcing the actual real-world rule:
--     - Only the listing OWNER may set status to Accepted or Declined
--       (this is the accept/decline action from the "Owner Rental
--       Requests" flow).
--     - Either the renter or the owner may set status to Cancelled.
--     - Once a request is Cancelled, Declined, or Completed, its status
--       can no longer change (no un-declining, no un-cancelling).
-- CONNECTS TO :
--   Applies to database/schema/rentals.sql. Consumed by
--   backend/supabase/rentals.js's setRentalStatus(), called from
--   frontend/pages/Dashboard/Dashboard.jsx's Accept/Decline/Cancel buttons.
-- ==================================================================

create or replace function enforce_rental_status_transition()
returns trigger as $$
declare
  v_owner_id uuid;
begin
  if new.status = old.status then
    return new;
  end if;

  select owner_id into v_owner_id from listings where id = new.listing_id;

  if old.status in ('Cancelled', 'Declined', 'Completed') then
    raise exception 'This rental request is already %, and cannot be changed further.', old.status
      using errcode = '23514';
  end if;

  if new.status in ('Accepted', 'Declined') and auth.uid() is distinct from v_owner_id then
    raise exception 'Only the listing owner can accept or decline a rental request.'
      using errcode = '23514';
  end if;

  if new.status = 'Cancelled'
     and auth.uid() is distinct from new.renter_id
     and auth.uid() is distinct from v_owner_id then
    raise exception 'Only the renter or the listing owner can cancel this rental request.'
      using errcode = '23514';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_enforce_rental_status_transition on rentals;
create trigger trg_enforce_rental_status_transition
  before update of status on rentals
  for each row execute function enforce_rental_status_transition();
