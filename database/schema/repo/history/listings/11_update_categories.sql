-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — updated category set
-- PURPOSE   :
--   Replaces the category list entirely:
--     Removed: Construction, Gardening, Cleaning, Heavy Equipment
--     Added:   Gadgets & Electronics
--     Kept:    Equipment, Power Tools
--     New:     Tools
--   New order: Equipment, Gadgets & Electronics, Tools, Power Tools
--   (matches shared/constants/index.js's CATEGORIES array).
--
--   Existing listings in a removed category can't just be left as-is —
--   the CHECK constraint would then reject any future update to those
--   rows (and they'd silently mismatch the category filter UI, which
--   only offers the new four). Reassigns them:
--     Heavy Equipment -> Tools (explicit replacement)
--     Construction, Gardening, Cleaning -> Equipment (no direct
--     replacement was specified for these, so they fall back to the
--     general "Equipment" category rather than being left in limbo)
-- CONNECTS TO :
--   Updates the constraint from database/schema/add_equipment_category.sql.
-- ==================================================================

update listings set category = 'Tools' where category = 'Heavy Equipment';
update listings set category = 'Equipment' where category in ('Construction', 'Gardening', 'Cleaning');

alter table listings
  drop constraint if exists listings_category_allowed;
alter table listings
  add constraint listings_category_allowed check (
    category in ('Equipment', 'Gadgets & Electronics', 'Tools', 'Power Tools')
  );

notify pgrst, 'reload schema';
