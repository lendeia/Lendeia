-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — record who cancelled a rental
-- PURPOSE   :
--   Completes device_wide_rental_cap.sql's stricter accounting: a
--   renter-initiated cancellation now counts permanently against their
--   active-rental-slot cap, but an owner-declined Pending request
--   never should (not the renter's fault). This sets
--   rentals.cancelled_by_renter accurately at the moment a rental
--   actually becomes Cancelled, based on who made that specific call —
--   the only change from the previous version of this function.
-- CONNECTS TO :
--   Completes real_returned_status.sql. cancelled_by_renter is read by
--   enforce_renter_active_limit() in device_wide_rental_cap.sql.
-- ==================================================================

create or replace function enforce_rental_status_transition()
returns trigger as $$
declare
  v_owner_id uuid;
  v_days_used integer;
begin
  if new.status = old.status then
    return new;
  end if;

  select owner_id into v_owner_id from listings where id = new.listing_id;

  if old.status in ('Cancelled', 'Declined', 'Completed', 'Returned') then
    raise exception 'This rental request is already %, and cannot be changed further.', old.status
      using errcode = '23514';
  end if;

  if new.status in ('Accepted', 'Declined') and auth.uid() is distinct from v_owner_id then
    raise exception 'Only the listing owner can accept or decline a rental request.'
      using errcode = '23514';
  end if;

  if new.status = 'Accepted' then
    update listings
      set paused_remaining = greatest(plan_expires_at - now(), interval '0'),
          is_active = false
      where id = new.listing_id;
  end if;

  if new.status = 'Cancelled' then
    if auth.uid() is distinct from new.renter_id and auth.uid() is distinct from v_owner_id then
      raise exception 'Only the renter or the listing owner can cancel this rental request.'
        using errcode = '23514';
    end if;

    if old.status = 'Accepted' and new.received_at is not null then
      raise exception 'This item has already been handed over — use Return Item instead of Cancel.'
        using errcode = '23514';
    end if;

    -- The one real change in this file: records WHO cancelled, so the
    -- renter-slot cap can tell a self-inflicted cancellation apart from
    -- one they had no control over.
    new.cancelled_by_renter := (auth.uid() = new.renter_id);

    if old.status = 'Accepted' then
      perform set_config('renta.skip_listing_limit_check', 'true', true);
      update listings
        set is_active = true,
            plan_expires_at = now() + coalesce(paused_remaining, interval '0'),
            paused_remaining = null
        where id = new.listing_id;
    end if;
  end if;

  if new.status = 'Returned' then
    if auth.uid() is distinct from new.renter_id and auth.uid() is distinct from v_owner_id then
      raise exception 'Only the renter or the listing owner can return this rental.'
        using errcode = '23514';
    end if;
    if old.status <> 'Accepted' then
      raise exception 'Only an Accepted rental can be returned.' using errcode = '23514';
    end if;
    if new.received_at is null then
      raise exception 'This item was never confirmed as handed over — use Cancel instead.'
        using errcode = '23514';
    end if;

    perform set_config('renta.skip_listing_limit_check', 'true', true);
    update listings
      set is_active = true,
          plan_expires_at = now() + coalesce(paused_remaining, interval '0'),
          paused_remaining = null
      where id = new.listing_id;

    if current_date > new.start_date and current_date < new.end_date then
      v_days_used := greatest(1, (current_date - new.start_date));
      new.adjusted_price := new.price_per_day * v_days_used;
    end if;

    new.returned_at := now();
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
    update listings set is_active = false, paused_remaining = null where id = new.listing_id;
    new.completed_at := now();
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

notify pgrst, 'reload schema';
