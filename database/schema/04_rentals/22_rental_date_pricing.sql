-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — real date-range pricing + early-cancel adjustment
-- PURPOSE   :
--   Rentals previously always used a PLACEHOLDER 1-day date range (see
--   backend/supabase/rentals.js's old file header — Details.jsx never
--   had a real date picker). This adds:
--
--   1) total_price — the full scheduled cost (price_per_day × number of
--      days), computed automatically by a trigger from whatever real
--      start_date/end_date the renter actually picks. Never trusted
--      from the client — the trigger recomputes it from the dates
--      regardless of what a client sends for this column.
--
--   2) adjusted_price — set ONLY when the RENTER cancels an already
--      Accepted, currently-in-progress rental (today is after its start
--      date but before its scheduled end date) — a real prorated cost
--      based on days actually used, so "I returned it early" has an
--      honest, recalculated price instead of just refunding/keeping the
--      full original amount. Left null for every other case (cancelling
--      before it starts, the owner cancelling, natural completion) —
--      those aren't "early returns", so there's nothing to adjust.
--
--   KNOWN SIMPLIFICATION (flagged, not hidden): proration is by whole
--   day only (no partial-day/hourly precision), and the actual refund
--   mechanics (who pays whom the difference) are NOT implemented here —
--   there's no real payment gateway wired into this project yet (see
--   backend/payments/processPayment.js), so this computes and displays
--   the correct adjusted figure without moving any real money.
-- CONNECTS TO :
--   Extends the rentals table and enforce_rental_status_transition
--   (previously modified in limits_delisting_notifications.sql and
--   add_completed_at.sql — this is the current final version).
--   Consumed by backend/supabase/rentals.js's mapRentalRow, displayed in
--   Dashboard.jsx's Rental History and Receipt.jsx.
-- ==================================================================

alter table rentals
  add column if not exists total_price numeric(10,2),
  add column if not exists adjusted_price numeric(10,2);

-- Backfill existing rows (which only ever had the old 1-day placeholder
-- range) so total_price is never null going forward.
update rentals
set total_price = price_per_day * greatest(1, (end_date - start_date))
where total_price is null;

create or replace function compute_rental_total_price()
returns trigger as $$
begin
  new.total_price := new.price_per_day * greatest(1, (new.end_date - new.start_date));
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_compute_rental_total_price on rentals;
create trigger trg_compute_rental_total_price
  before insert on rentals
  for each row execute function compute_rental_total_price();

-- Final version of enforce_rental_status_transition — adds early-return
-- price adjustment inside the existing Cancelled branch.
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

  if new.status = 'Cancelled' then
    if auth.uid() is distinct from new.renter_id and auth.uid() is distinct from v_owner_id then
      raise exception 'Only the renter or the listing owner can cancel this rental request.'
        using errcode = '23514';
    end if;

    -- Early-return adjustment: only when the RENTER cancels a rental
    -- that was already Accepted AND is currently in progress (started,
    -- not yet at its scheduled end). Anything else (cancelling before
    -- it starts, the owner cancelling) leaves adjusted_price null.
    if old.status = 'Accepted'
       and auth.uid() = new.renter_id
       and current_date > new.start_date
       and current_date < new.end_date then
      v_days_used := greatest(1, (current_date - new.start_date));
      new.adjusted_price := new.price_per_day * v_days_used;
    end if;
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
