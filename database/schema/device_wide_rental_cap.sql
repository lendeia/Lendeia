-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — stricter active-rental-slot accounting
-- PURPOSE   :
--   Previously, a "slot" was occupied only while a rental was Pending
--   or Accepted — the moment it became Cancelled OR Declined, it
--   stopped counting, freeing a slot immediately. By explicit request,
--   this is now stricter: a RENTER-INITIATED cancellation keeps
--   counting against their cap permanently — only reaching Completed
--   or Returned actually frees the slot. This closes the loophole of
--   hitting your cap, cancelling one of your own active requests, and
--   immediately requesting something else instead, without ever
--   actually completing a rental.
--
--   DELIBERATE CARVE-OUT: an owner DECLINING a Pending request does NOT
--   count against the renter's cap — that's the owner's decision, not
--   the renter's fault, and permanently penalizing a renter for
--   something they didn't do would eventually lock well-behaved users
--   out of the platform entirely with no way back in. Only a
--   Cancelled status where the renter was the one who cancelled counts
--   toward this stricter, permanent accounting.
--
--   HONEST RISK, still worth restating even with that carve-out: a
--   renter who cancels their own Accepted-but-not-yet-received rental
--   (a normal, legitimate thing to do — plans change) now permanently
--   loses that slot instead of getting it back. Over time, someone who
--   cancels often enough could exhaust their cap with no way to regain
--   it except successfully completing/returning other rentals.
-- CONNECTS TO :
--   Replaces the active-count logic in device_wide_rental_cap.sql's
--   enforce_renter_active_limit().
-- ==================================================================

create or replace function enforce_renter_active_limit()
returns trigger as $$
declare
  v_completed integer;
  v_cap integer;
  v_active_count integer;
  v_device_active_count integer;
begin
  select coalesce(completed_as_renter, 0) into v_completed
  from renter_completed_rentals_summary
  where user_id = new.renter_id;

  v_cap := case when coalesce(v_completed, 0) >= 5 then 5 else 2 end;

  -- Occupies a slot while Pending/Accepted (still unresolved), AND
  -- permanently once Cancelled BY THE RENTER (see file header) — only
  -- Completed/Returned/Declined-by-owner don't count.
  select count(*) into v_active_count
  from rentals
  where renter_id = new.renter_id
    and (
      status in ('Pending', 'Accepted')
      or (status = 'Cancelled' and cancelled_by_renter = true)
    );

  if v_active_count >= v_cap then
    raise exception
      'You can have up to % active rental requests at a time (you have %.). Complete % successful rentals to raise this to 5.',
      v_cap, v_active_count, 5
      using errcode = '23514';
  end if;

  if new.device_id is not null then
    select count(*) into v_device_active_count
    from rentals
    where device_id = new.device_id
      and (
        status in ('Pending', 'Accepted')
        or (status = 'Cancelled' and cancelled_by_renter = true)
      );

    if v_device_active_count >= v_cap then
      raise exception
        'This device already has % active rental requests across your account(s) — the limit is % until more rentals are successfully completed.',
        v_device_active_count, v_cap
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Records WHO cancelled, needed for the carve-out above — a plain
-- status update doesn't otherwise say whether the renter or the owner
-- was the one who set it to Cancelled.
alter table rentals add column if not exists cancelled_by_renter boolean;

notify pgrst, 'reload schema';
