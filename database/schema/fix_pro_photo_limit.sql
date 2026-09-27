-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — fix Pro's real photo limit (new)
-- PURPOSE   :
--   frontend/components/PlanCard.jsx's Pro maxPhotos was changed to
--   10, but the database's OWN independent enforcement
--   (listings_plan_photo_limit, from stricter_listing_rules.sql) was
--   never updated to match — it still allowed up to 20 for 'featured'.
--   That meant the two didn't actually agree: the app's own real
--   safety net would still accept up to 20 photos even though the
--   frontend UI and plan description said 10. This brings the
--   database in line with what's actually offered now.
-- ==================================================================

alter table listings
  drop constraint if exists listings_plan_photo_limit;
-- NOT VALID — a listing that already has 11-20 photos (allowed under
-- the old limit) is grandfathered in rather than having its
-- constraint check fail the migration, or worse, having photos
-- silently/destructively trimmed off just to satisfy a schema change.
-- New uploads and any future edit to an over-the-new-limit listing
-- still get capped at 10 correctly — this only skips RETROACTIVELY
-- validating rows that were fine under the rules at the time they
-- were saved.
alter table listings
  add constraint listings_plan_photo_limit check (
    array_length(photo_urls, 1) <= case plan
      when 'free' then 5
      when 'standard' then 10
      when 'featured' then 10
    end
  ) not valid;

notify pgrst, 'reload schema';
