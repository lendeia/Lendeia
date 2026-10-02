-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — add "Equipment" category
-- PURPOSE   :
--   shared/constants/index.js's CATEGORIES gained a 6th entry,
--   "Equipment" — but the database's listings_category_allowed CHECK
--   constraint (stricter_listing_rules.sql) still only permitted the
--   original 5. Without this migration, creating a listing under the
--   new category would pass all frontend validation and then fail at
--   the database with a check_violation — the exact kind of "looks done
--   but isn't" gap this project has been careful to avoid elsewhere.
-- CONNECTS TO :
--   Updates the constraint from database/schema/stricter_listing_rules.sql.
-- ==================================================================

alter table listings
  drop constraint if exists listings_category_allowed;
alter table listings
  add constraint listings_category_allowed check (
    category in ('Power Tools', 'Construction', 'Gardening', 'Cleaning', 'Heavy Equipment', 'Equipment')
  );
