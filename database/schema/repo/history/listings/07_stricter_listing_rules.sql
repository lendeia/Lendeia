-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — stricter listing validation
-- PURPOSE   :
--   The frontend (frontend/pages/ListEquipment/ListEquipment.jsx) already
--   enforces things like "at least 3 photos", "description >= 20 chars",
--   and per-plan active-listing limits (see its `PLANS` array) — but
--   client-side validation alone can always be bypassed by calling the
--   API directly. This migration re-enforces the same rules (and a few
--   extra ones) at the database layer, which cannot be bypassed, so
--   listings stay trustworthy regardless of which client created them.
-- CONNECTS TO :
--   Tightens database/schema/listings.sql. Keep the numbers below in
--   sync with the `PLANS` constant in
--   frontend/pages/ListEquipment/ListEquipment.jsx if either changes.
-- ==================================================================

-- 1) Real photos, not just a single primary_image_url.
--    Mirrors the frontend's "at least 3 photos" requirement.
alter table listings
  add column if not exists photo_urls text[] not null default '{}';

alter table listings
  drop constraint if exists listings_min_photos;
alter table listings
  add constraint listings_min_photos check (array_length(photo_urls, 1) >= 3);

-- 2) Meaningful name/description lengths (prevents "a", "asdf" spam).
alter table listings
  drop constraint if exists listings_name_length,
  drop constraint if exists listings_description_length;
alter table listings
  add constraint listings_name_length check (char_length(btrim(name)) between 3 and 120),
  add constraint listings_description_length check (
    description is not null and char_length(btrim(description)) >= 20
  );

-- 3) Category must be one of the app's known categories (mirrors
--    shared/constants CATEGORIES) instead of accepting arbitrary text.
alter table listings
  drop constraint if exists listings_category_allowed;
alter table listings
  add constraint listings_category_allowed check (
    category in ('Power Tools', 'Construction', 'Gardening', 'Cleaning', 'Heavy Equipment')
  );

-- 4) Condition must be one of a known set of values.
alter table listings
  drop constraint if exists listings_condition_allowed;
alter table listings
  add constraint listings_condition_allowed check (
    condition in ('New', 'Like New', 'Good', 'Fair', 'Needs Repair')
  );

-- 5) Sane upper bound on price — catches typos like ₱2,999,900/day and
--    obvious abuse, while still allowing genuine heavy-equipment pricing.
alter table listings
  drop constraint if exists listings_price_ceiling;
alter table listings
  add constraint listings_price_ceiling check (price_per_day <= 100000);

-- 6) Location must be non-empty (not just whitespace).
alter table listings
  drop constraint if exists listings_location_present;
alter table listings
  add constraint listings_location_present check (char_length(btrim(location)) > 0);

-- 7) Plan tiers + per-plan limits, mirroring
--    frontend/pages/ListEquipment/ListEquipment.jsx's PLANS array, enforced
--    server-side via a trigger (a CHECK constraint can't count sibling rows).
alter table listings
  add column if not exists plan text not null default 'free',
  add column if not exists plan_expires_at timestamptz;

alter table listings
  drop constraint if exists listings_plan_allowed;
alter table listings
  add constraint listings_plan_allowed check (plan in ('free', 'standard', 'featured'));

alter table listings
  drop constraint if exists listings_plan_photo_limit;
alter table listings
  add constraint listings_plan_photo_limit check (
    array_length(photo_urls, 1) <= case plan
      when 'free' then 5
      when 'standard' then 10
      when 'featured' then 20
    end
  );

create or replace function enforce_listing_plan_limits()
returns trigger as $$
declare
  max_active integer;
  active_count integer;
begin
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
      using errcode = '23514'; -- check_violation, so API clients see it as a validation error
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_enforce_listing_plan_limits on listings;
create trigger trg_enforce_listing_plan_limits
  before insert or update of owner_id, plan, is_active on listings
  for each row
  when (new.is_active = true)
  execute function enforce_listing_plan_limits();

-- 8) Prevent accidental duplicate listings: the same owner publishing the
--    exact same item (name+brand+model) twice while both copies are
--    active is almost always a double-submit bug or spam, not two
--    genuinely different items.
create unique index if not exists listings_no_duplicate_active
  on listings (owner_id, lower(btrim(name)), lower(btrim(coalesce(brand, ''))), lower(btrim(coalesce(model, ''))))
  where is_active = true;
