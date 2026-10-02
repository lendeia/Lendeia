-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — fix plan-limit check blocking deactivation
-- PURPOSE   :
--   enforce_listing_plan_limits() (listing_lifecycle.sql) checked the
--   owner's active-listing count on EVERY update to is_active,
--   regardless of whether the update was activating or DEactivating a
--   listing. That meant manually delisting an item (or any other path
--   that sets is_active to false) could be incorrectly rejected with
--   "too many active listings" if the owner already had other active
--   listings at/over their plan's cap — even though deactivating a
--   listing REDUCES the active count, and should never be blocked by a
--   cap meant to stop exceeding it. Now only enforced when the update
--   would leave the row active.
-- CONNECTS TO :
--   Completes database/schema/listing_lifecycle.sql. Relevant now that
--   backend/supabase/listings.js adds a manual "Delist" action.
-- ==================================================================

create or replace function enforce_listing_plan_limits()
returns trigger as $$
declare
  max_active integer;
  active_count integer;
begin
  if coalesce(current_setting('renta.skip_listing_limit_check', true), 'false') = 'true' then
    return new;
  end if;

  -- Deactivating (or any update that leaves is_active false/null) can
  -- never itself cause the cap to be exceeded — skip the check entirely
  -- in that case.
  if new.is_active is distinct from true then
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

notify pgrst, 'reload schema';
