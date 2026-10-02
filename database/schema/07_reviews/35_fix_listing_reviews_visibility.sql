-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — fix reviews disappearing from product pages
-- PURPOSE   :
--   getReviewsForListing() (backend/supabase/reviews.js) previously found
--   a listing's reviews by joining reviews -> rentals -> listing_id. That
--   join silently failed for anyone who wasn't the renter or owner of
--   that SPECIFIC rental, because `rentals` has strict participant-only
--   RLS (rentals_select_participant) — even though `reviews` itself is
--   publicly readable. A review written by a renter was visible on
--   their own profile (getReviewsForOwner queries `reviews` directly, no
--   join) but vanished from the product's own Details page for anyone
--   else, since the join to the RLS-protected `rentals` row got filtered
--   out for them.
--
--   Fix: store `listing_id` directly on `reviews`, set automatically by
--   the existing eligibility trigger (never trusted from client input),
--   so looking up a listing's reviews never needs to touch `rentals` —
--   and therefore never runs into its RLS — at all.
-- CONNECTS TO :
--   Extends database/schema/reviews_and_ratings.sql /
--   two_way_category_reviews.sql. Consumed by
--   backend/supabase/reviews.js's getReviewsForListing().
-- ==================================================================

alter table reviews add column if not exists listing_id uuid references listings(id) on delete cascade;

-- Backfill existing rows (if any were created before this column existed).
update reviews r
set listing_id = ren.listing_id
from rentals ren
where r.rental_id = ren.id and r.listing_id is null;

create index if not exists idx_reviews_listing on reviews(listing_id);

create or replace function enforce_review_eligibility()
returns trigger as $$
declare
  v_rental_status text;
  v_renter_id uuid;
  v_owner_id uuid;
  v_listing_id uuid;
begin
  select r.status, r.renter_id, l.owner_id, l.id
    into v_rental_status, v_renter_id, v_owner_id, v_listing_id
  from rentals r
  join listings l on l.id = r.listing_id
  where r.id = new.rental_id;

  if v_renter_id is null then
    raise exception 'Rental % does not exist.', new.rental_id
      using errcode = '23503';
  end if;

  if v_rental_status <> 'Completed' then
    raise exception 'You can only review a completed rental.'
      using errcode = '23514';
  end if;

  if new.reviewer_id = new.reviewed_user_id then
    raise exception 'You cannot review yourself.'
      using errcode = '23514';
  end if;

  -- Set directly from the rental's own listing — never trusted from
  -- whatever the client sent, same principle as reviewer_role below.
  new.listing_id := v_listing_id;

  if new.reviewer_id = v_renter_id then
    if new.reviewed_user_id <> v_owner_id then
      raise exception 'As the renter, this review must be for the listing owner.'
        using errcode = '23514';
    end if;
    new.reviewer_role := 'renter';
    new.return_condition_rating := null;
    new.agreement_followed_rating := null;
  elsif new.reviewer_id = v_owner_id then
    if new.reviewed_user_id <> v_renter_id then
      raise exception 'As the owner, this review must be for the renter.'
        using errcode = '23514';
    end if;
    new.reviewer_role := 'owner';
    new.item_accuracy_rating := null;
    new.rental_experience_rating := null;
  else
    raise exception 'Only the renter or the listing owner of this rental may review it.'
      using errcode = '23514';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_enforce_review_eligibility on reviews;
create trigger trg_enforce_review_eligibility
  before insert on reviews
  for each row execute function enforce_review_eligibility();

notify pgrst, 'reload schema';
