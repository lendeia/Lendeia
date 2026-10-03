-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — early return delists the item
-- PURPOSE   :
--   Before: when a renter returned an item early (status 'Returned'),
--   the listing was switched back ON (is_active = true) with its
--   remaining listing time restored, so it reappeared in Browse/Home.
--   Now: an early return finishes the rental the same way 'Completed'
--   does — the listing stays completely delisted (is_active = false,
--   paused_remaining cleared). No owner "Mark Completed" step is
--   needed or possible afterwards ('Returned' is a final status), and
--   the owner can relist the item manually when they want to.
--   Everything else is unchanged from
--   history/security/31_CRITICAL_lock_rental_price_fields.sql.
-- ==================================================================

create or replace function enforce_rental_status_transition()
returns trigger as $$
declare
  v_owner_id uuid;
  v_days_used integer;
begin
  -- Guard against direct price/date/identity tampering — runs on EVERY
  -- update, regardless of whether status is also changing. Only the
  -- service role (used exclusively by trusted server-side code, never
  -- the browser) can set these; any other caller has these fields
  -- silently reverted to their existing values.
  if auth.role() is distinct from 'service_role' then
    new.price_per_day := old.price_per_day;
    new.total_price := old.total_price;
    new.start_date := old.start_date;
    new.end_date := old.end_date;
    new.listing_id := old.listing_id;
    new.renter_id := old.renter_id;
  end if;

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

    -- Early return = the rental is finished, exactly like Completed:
    -- the item stays COMPLETELY delisted (it is NOT put back on the
    -- market). The owner decides whether to relist it later.
    update listings
      set is_active = false,
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
