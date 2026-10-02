-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — preserve reviews when a listing is deleted
-- PURPOSE   :
--   reviews.listing_id currently references listings(id) ON DELETE
--   CASCADE (see fix_listing_reviews_visibility.sql) — meaning deleting
--   a listing silently destroys every review ever left about it,
--   including reviews of the RENTER's behavior on that rental. That's a
--   real safety problem: an owner (or renter) could delete a listing
--   specifically to erase a bad review history. This is the same class
--   of bug rental_item_snapshot.sql already fixed for rentals.listing_id
--   (changed from CASCADE to SET NULL there) — applying the identical
--   fix here.
--   Reviews still count toward a person's overall rating/reputation via
--   reviewed_user_id regardless of this change (getUserReputationSummary,
--   getReviewsForOwner don't depend on listing_id at all) — this only
--   affects whether a review also stays attached to the now-deleted
--   listing's own page, which naturally no longer exists to show it on.
-- CONNECTS TO :
--   Completes fix_listing_reviews_visibility.sql. Matches
--   rental_item_snapshot.sql's identical fix for rentals.listing_id.
-- ==================================================================

alter table reviews drop constraint if exists reviews_listing_id_fkey;
alter table reviews
  add constraint reviews_listing_id_fkey
  foreign key (listing_id) references listings(id) on delete set null;

notify pgrst, 'reload schema';
