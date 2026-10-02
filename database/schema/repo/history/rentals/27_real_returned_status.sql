-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — real "Returned" status
-- PURPOSE   :
--   Previously, ending an Accepted rental early always set
--   status='Cancelled', regardless of whether the item had ever
--   actually been handed over — Dashboard.jsx just relabeled the button
--   "Return Item" in that case, but the underlying status (and its
--   Pill/history display) still said "Cancelled". That's the wrong
--   signal: cancelling something you never received and returning
--   something you actually used are meaningfully different events, and
--   "Cancelled" doesn't distinguish them anywhere in Rental History.
--
--   Now:
--     - Cancel: only valid for a Pending rental (never confirmed), or
--       an Accepted rental where handoff was never confirmed
--       (received_at is null). Attempting to Cancel an Accepted rental
--       that WAS received is rejected — that must go through Return.
--     - Returned (new status): only valid for an Accepted rental where
--       received_at IS set. Same early-return price recalculation and
--       listing-reactivation-with-remaining-time-restored behavior that
--       "returning via Cancelled" used to have, just under its own
--       honest status now, with its own returned_at timestamp so
--       Rental History can show "Item Returned" + the actual date.
-- CONNECTS TO :
--   Builds on confirm_item_received.sql's received_at and
--   listing_lifecycle.sql's pause/restore mechanism. Consumed by
--   backend/supabase/rentals.js's returnRental() and Dashboard.jsx's
--   status Pill/filters, which now need to recognize 'Returned' as its
--   own status alongside Pending/Accepted/Completed/Declined/Cancelled.
-- ==================================================================

alter table rentals add column if not exists returned_at timestamptz;

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

    -- Cancel is only for "never confirmed" (Pending) or "accepted but
    -- not yet handed over" (Accepted, received_at still null). Once
    -- handoff is confirmed, ending the rental early must go through
    -- Return instead.
    if old.status = 'Accepted' and new.received_at is not null then
      raise exception 'This item has already been handed over — use Return Item instead of Cancel.'
        using errcode = '23514';
    end if;

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

    -- Same early-return price recalculation the old "return via
    -- Cancelled" path had — just reachable through the real Returned
    -- status now.
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
