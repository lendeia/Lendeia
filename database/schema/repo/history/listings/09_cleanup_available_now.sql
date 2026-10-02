-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — fix availability_note NOT NULL + clean up old data
-- PURPOSE   :
--   The column was originally defined as
--   `availability_note text not null default 'Available now'`
--   (self_rental_and_fields.sql) — I didn't know this when I "fixed"
--   the app code to stop defaulting to that text and instead write
--   `null`. That's actually WORSE: explicitly inserting null into a
--   NOT NULL column fails outright, which likely broke publishing NEW
--   listings entirely (backend/supabase/listings.js's createListing()
--   sends `availability_note: input.available || null`, and
--   ListEquipment.jsx never collects an availability value at all, so
--   this was null on every single new listing). The correct fix is at
--   the schema level: actually allow null, and remove the fabricated
--   default, then clean up existing rows that still have the old text.
-- CONNECTS TO :
--   Fixes the column self_rental_and_fields.sql defined. Matches
--   backend/supabase/listings.js's existing `|| null` / `|| ""` code,
--   which was already correct — the schema just needed to catch up.
-- ==================================================================

alter table listings alter column availability_note drop not null;
alter table listings alter column availability_note drop default;

update listings
set availability_note = null
where availability_note = 'Available now';

notify pgrst, 'reload schema';
