-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — real listing lifecycle (Active -> Rented -> Completed/Cancelled -> Expired)
-- PURPOSE   :
--   Implements the full lifecycle exactly as specified:
--     1) A listing is Active and publicly visible for its plan's
--        duration (7/14/30 days depending on free/standard/featured).
--     2) The moment a rental is CONFIRMED (Accepted) — not when it's
--        later Completed — the listing is delisted immediately: it's
--        no longer visible to other customers, and its countdown is
--        PAUSED (the remaining time is snapshotted, not reset).
--     3) If the rental COMPLETES, the listing stays delisted. The owner
--        must explicitly "List Again," which gives a FRESH full period
--        — this rewards completing rentals.
--     4) If the rental is CANCELLED instead (by either party) while it
--        was Accepted, the listing becomes available again with its
--        PAUSED remaining time restored — NOT a fresh period. This is
--        what stops someone from abusing accept-then-cancel to keep
--        refreshing a listing's countdown for free.
--     5) If nobody rents it within its period, it naturally stops being
--        publicly visible the moment that period elapses — enforced in
--        real time by the public SELECT policy itself (comparing
--        plan_expires_at to now() on every read), not by a scheduled
--        job. The owner still sees it in their own "My Items" (that
--        policy is unaffected) and can Renew it for a fresh period,
--        using the exact same mechanism as "List Again."
--
--   KNOWN SIMPLIFICATION: while a listing is paused for an Accepted
--   rental, "List Again"/Renew is intentionally NOT offered — the owner
--   must wait for that rental to resolve (Complete or Cancel) first,
--   since offering a fresh relist mid-rental would let an owner
--   effectively double-list an item that's still out with a renter.
-- CONNECTS TO :
--   Extends listings_select_active (database/policies/listings.sql) and
--   enforce_rental_status_transition (most recently modified in
--   rental_date_pricing.sql — this is the current final version).
--   backend/supabase/listings.js's relistListing() now takes the plan's
--   day count explicitly and sets a real fresh plan_expires_at.
-- ==================================================================

alter table listings
  add column if not exists paused_remaining interval;

-- ---- Safeguard: restoring a paused listing after cancellation must
-- never fail due to the per-plan active-listing-count check (e.g. the
-- owner created other listings while this one was paused/out on
-- rental) — cancelling a rental should always succeed for the renter
-- regardless of the OWNER's current listing count. A transaction-local
-- flag lets the restore step below bypass that specific check just for
-- itself, without weakening it for actual new listings/relists. ----
create or replace function enforce_listing_plan_limits()
returns trigger as $$
declare
  max_active integer;
  active_count integer;
begin
  if coalesce(current_setting('renta.skip_listing_limit_check', true), 'false') = 'true' then
    return new;
  end if;

  max_active := case new.plan
    when 'free' then 7
    when 'standard' then 10
    when 'featured' then 30
    else 7
  end;

  select count(*) into active_count
  from listings
  where owner_id = new.owner_id
    and is_active = true
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if active_count >= max_active then
    raise exception
      'Plan "%" allows up to % active listings; you already have %.',
      new.plan, max_active, active_count
      using errcode = '23514';
  end if;

  return new;
end;
$$ language plpgsql;

-- ---- 5. Real-time expiration: enforced on every read, no cron needed ----
drop policy if exists listings_select_active on listings;
create policy listings_select_active on listings
  for select using (
    is_active = true
    and (plan_expires_at is null or plan_expires_at > now())
  );

-- ---- 2, 3, 4: delist-on-accept, pause/restore, stays-delisted-on-complete ----
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

  if old.status in ('Cancelled', 'Declined', 'Completed') then
    raise exception 'This rental request is already %, and cannot be changed further.', old.status
      using errcode = '23514';
  end if;

  if new.status in ('Accepted', 'Declined') and auth.uid() is distinct from v_owner_id then
    raise exception 'Only the listing owner can accept or decline a rental request.'
      using errcode = '23514';
  end if;

  -- 2) Confirmed -> delist immediately, PAUSING (not resetting) the
  -- listing's remaining countdown.
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

    -- 4) Cancelling an already-Accepted (confirmed) rental restores the
    -- listing with its PAUSED remaining time — not a fresh period.
    -- Cancelling a still-Pending rental never touched the listing in
    -- the first place (only Accept pauses it), so there's nothing to
    -- restore there.
    if old.status = 'Accepted' then
      perform set_config('renta.skip_listing_limit_check', 'true', true);
      update listings
        set is_active = true,
            plan_expires_at = now() + coalesce(paused_remaining, interval '0'),
            paused_remaining = null
        where id = new.listing_id;
    end if;

    -- Early-return PRICE adjustment (separate concern from the listing
    -- availability restore above) — only when the RENTER cancels a
    -- rental that was already in progress (started, not yet at its
    -- scheduled end).
    if old.status = 'Accepted'
       and auth.uid() = new.renter_id
       and current_date > new.start_date
       and current_date < new.end_date then
      v_days_used := greatest(1, (current_date - new.start_date));
      new.adjusted_price := new.price_per_day * v_days_used;
    end if;
  end if;

  -- 3) Completed -> stays delisted. No fresh period here — that only
  -- happens when the owner explicitly clicks "List Again"
  -- (backend/supabase/listings.js's relistListing).
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

drop trigger if exists trg_enforce_rental_status_transition on rentals;
create trigger trg_enforce_rental_status_transition
  before update of status on rentals
  for each row execute function enforce_rental_status_transition();

notify pgrst, 'reload schema';
