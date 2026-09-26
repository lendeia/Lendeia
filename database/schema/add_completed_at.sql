-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — real "completed at" timestamp
-- PURPOSE   :
--   Rental History previously only showed the rental's date RANGE
--   (start_date -> end_date) — there was no record of WHEN the request
--   was actually made, and no dedicated record of when it was marked
--   Completed (only a generic updated_at that isn't even auto-bumped by
--   a trigger). Adds a real completed_at column, set by the same
--   trigger that already handles the Completed transition — set exactly
--   once, at the real moment of completion, not inferred from a
--   generic "last modified" timestamp that could be touched by
--   unrelated updates later.
-- CONNECTS TO :
--   Extends the enforce_rental_status_transition trigger (already
--   modified twice before, in limits_delisting_notifications.sql and
--   reviews_and_ratings.sql — this is the current final version).
--   Consumed by backend/supabase/rentals.js's mapRentalRow, displayed in
--   frontend/pages/Dashboard/Dashboard.jsx's RequestRow.
-- ==================================================================

alter table rentals add column if not exists completed_at timestamptz;

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

  if new.status = 'Completed' then
    if auth.uid() is distinct from v_owner_id then
      raise exception 'Only the listing owner can mark a rental as completed.'
        using errcode = '23514';
    end if;
    if old.status <> 'Accepted' then
      raise exception 'Only an Accepted rental can be marked Completed.'
        using errcode = '23514';
    end if;
    update listings set is_active = false where id = new.listing_id;
    -- The actual new addition: record precisely when this happened.
    new.completed_at := now();
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_enforce_rental_status_transition on rentals;
create trigger trg_enforce_rental_status_transition
  before update of status on rentals
  for each row execute function enforce_rental_status_transition();

notify pgrst, 'reload schema';
