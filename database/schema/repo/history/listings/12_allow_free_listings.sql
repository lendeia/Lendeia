-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — allow ₱0 listings, keep realistic ceiling
-- PURPOSE   :
--   listings.price_per_day previously required > 0 — a free (₱0/day)
--   listing was rejected at the database level even if the frontend
--   allowed it. Relaxes the minimum to >= 0 while keeping the existing
--   100,000/day ceiling from stricter_listing_rules.sql unchanged.
-- CONNECTS TO :
--   Matches the frontend validation in
--   frontend/pages/ListEquipment/ListEquipment.jsx.
-- ==================================================================

alter table listings drop constraint if exists listings_price_per_day_check;
alter table listings add constraint listings_price_per_day_check check (price_per_day >= 0);

notify pgrst, 'reload schema';
