-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — add the missing relist_listing() RPC
-- PURPOSE   :
--   backend/supabase/listings.js's relistListing() has been calling
--   `supabase.rpc("relist_listing", ...)` since the listing-lifecycle
--   rework, but that function was never actually created against the
--   paused_remaining-based schema in listing_lifecycle.sql — an earlier
--   draft of this function (using a different, superseded
--   `delist_reason` column) was written but replaced before ever being
--   run, and the replacement was never added. This is that missing
--   piece: a real relist_listing(), guarding against relisting an item
--   that's currently paused (mid-rental, via paused_remaining being
--   non-null) and always giving a FRESH full period otherwise — the
--   "reward" for completing a rental or renewing an expired one.
-- CONNECTS TO :
--   Completes database/schema/listing_lifecycle.sql. Called from
--   backend/supabase/listings.js's relistListing().
-- ==================================================================

create or replace function relist_listing(p_listing_id uuid, p_days integer)
returns setof listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_paused_remaining interval;
begin
  select owner_id, paused_remaining into v_owner_id, v_paused_remaining
  from listings where id = p_listing_id;

  if v_owner_id is null then
    raise exception 'Listing not found.' using errcode = '23503';
  end if;
  if auth.uid() is distinct from v_owner_id then
    raise exception 'Only the owner can relist this item.' using errcode = '23514';
  end if;
  if v_paused_remaining is not null then
    raise exception 'This item is currently rented and can''t be relisted until the rental ends.'
      using errcode = '23514';
  end if;
  if p_days is null or p_days <= 0 then
    raise exception 'Invalid listing period.' using errcode = '23514';
  end if;

  return query
  update listings
  set is_active = true,
      plan_expires_at = now() + (p_days || ' days')::interval
  where id = p_listing_id
  returning *;
end;
$$;

grant execute on function relist_listing(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
