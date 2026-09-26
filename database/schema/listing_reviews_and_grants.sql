-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — per-listing reviews + view permission fix
-- PURPOSE   :
--   1) Adds `listing_rating_summary`, a real per-LISTING aggregate rating
--      (reviews are stored against a rental, which has a listing_id —
--      this view aggregates by that). Details.jsx shows a specific
--      item's own reviews/rating, the way a product page on an online
--      marketplace does, rather than only the owner-wide aggregate
--      (owner_rating_summary, added earlier, still powers the Store page).
--   2) Explicitly GRANTs SELECT on both rating views to `anon` and
--      `authenticated`. This is the actual fix for "0 reviews won't
--      update": a view doesn't automatically inherit the same
--      role grants a table gets, so without this, PostgREST (and thus
--      the JS client) could silently get permission-denied on the view
--      and the app's error handling was written to fail soft to 0/0
--      rather than throw a visible error - it looked like empty data
--      instead of a blocked read.
-- CONNECTS TO :
--   Consumed by backend/supabase/reviews.js's new
--   getReviewsForListing()/getListingRatingSummary(), displayed on
--   frontend/pages/Details/Details.jsx.
-- ==================================================================

create or replace view listing_rating_summary as
select
  r.listing_id,
  round(avg(rv.rating)::numeric, 1) as avg_rating,
  count(*) as review_count
from reviews rv
join rentals r on r.id = rv.rental_id
group by r.listing_id;

-- The actual fix: make sure the roles your app queries as can read these
-- views. (The underlying `reviews` table already has a public SELECT RLS
-- policy — that alone does not guarantee a *view* built on top of it is
-- also grantable to these roles.)
grant select on owner_rating_summary to anon, authenticated;
grant select on listing_rating_summary to anon, authenticated;

-- Cheap insurance: force PostgREST to notice the new view immediately
-- instead of waiting for its normal cache refresh interval.
notify pgrst, 'reload schema';
