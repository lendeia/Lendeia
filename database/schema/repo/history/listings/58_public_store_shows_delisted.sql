-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — public store view shows delisted items too
-- PURPOSE   :
--   Previously, OwnerStore.jsx could only ever show a given owner's
--   ACTIVE listings — it reads from the shared listings context, which
--   is scoped by listings_select_active RLS (is_active=true, not
--   expired). There was no way for anyone but the owner themselves to
--   see their own delisted items (listings_select_own_all is
--   owner_id = auth.uid()-only). Now a store visitor can see a
--   delisted item too, labeled "Not currently listed" instead of being
--   silently hidden — this function is what makes that possible: it
--   returns an owner's FULL listing set (active + inactive) to anyone,
--   not just the owner. This is a deliberate, narrow exception to the
--   normal "own listings only" privacy boundary — a listing's own
--   existence/name/photos/price were already public info while active;
--   this just also surfaces it while inactive, which isn't materially
--   more sensitive.
-- CONNECTS TO :
--   Called by backend/supabase/listings.js's getOwnerAllListings(), used
--   by frontend/pages/Store/OwnerStore.jsx instead of the shared
--   (active-only) listings context.
-- ==================================================================

create or replace function get_owner_all_listings(p_owner_id uuid)
returns table (
  id uuid,
  name text,
  brand text,
  model text,
  category text,
  price_per_day numeric,
  condition text,
  description text,
  location text,
  latitude double precision,
  longitude double precision,
  primary_image_url text,
  photo_urls text[],
  is_active boolean,
  plan text,
  plan_expires_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    l.id, l.name, l.brand, l.model, l.category, l.price_per_day, l.condition, l.description,
    l.location, l.latitude, l.longitude, l.primary_image_url, l.photo_urls, l.is_active, l.plan,
    l.plan_expires_at, l.created_at
  from listings l
  where l.owner_id = p_owner_id
  order by l.created_at desc;
$$;

grant execute on function get_owner_all_listings(uuid) to authenticated;

notify pgrst, 'reload schema';
