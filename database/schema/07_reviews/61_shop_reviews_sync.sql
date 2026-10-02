-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — keep shop + item reviews in sync
-- PURPOSE   :
--   Run this ONCE in the Supabase SQL editor, AFTER every other file in
--   database/schema/. It is safe to run more than once.
--
--   1) The review-eligibility trigger had been re-created by several
--      migrations, and each one silently erased the previous one's
--      change:
--        - allow_review_on_returned.sql lets 'Returned' rentals be
--          reviewed, but does NOT set reviews.listing_id;
--        - fix_listing_reviews_visibility.sql sets listing_id, but only
--          allows 'Completed' rentals.
--      Whichever ran last won, so either Returned rentals could not be
--      reviewed, or new reviews got listing_id = NULL and never showed on
--      the item's own page. This file installs ONE final version that
--      does both.
--   2) Repairs existing rows: fills in listing_id and reviewer_role
--      where they are NULL (older reviews), so item pages and shop pages
--      both see them.
--   3) listing_rating_summary (the star rating on item cards / map pins)
--      counted BOTH directions of review, so an owner rating a renter
--      moved the ITEM's stars. It now counts only renter -> owner
--      reviews, the same set the item page lists.
-- CONNECTS TO :
--   backend/supabase/reviews.js (getListingRatingSummary,
--   getRatingsForListings). The store page itself no longer depends on
--   any view — see getShopReviews() there.
-- ==================================================================

-- ---- 1. Repair existing rows ----
alter table reviews add column if not exists listing_id uuid references listings(id) on delete set null;

update reviews rv
set listing_id = r.listing_id
from rentals r
where rv.rental_id = r.id and rv.listing_id is null;

update reviews rv
set reviewer_role = case when rv.reviewer_id = r.renter_id then 'renter' else 'owner' end
from rentals r
where rv.rental_id = r.id and rv.reviewer_role is null;

-- ---- 2. One final eligibility trigger (Completed OR Returned + listing_id) ----
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

  if v_rental_status not in ('Completed', 'Returned') then
    raise exception 'You can only review a completed or returned rental.'
      using errcode = '23514';
  end if;

  if new.reviewer_id = new.reviewed_user_id then
    raise exception 'You cannot review yourself.'
      using errcode = '23514';
  end if;

  -- Always taken from the rental itself, never from client input.
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

-- ---- 3. Item rating = renter -> owner reviews of that item only ----
create or replace view listing_rating_summary as
select
  rv.listing_id,
  round(avg(rv.rating)::numeric, 1) as avg_rating,
  count(*) as review_count
from reviews rv
where rv.listing_id is not null
  and rv.reviewer_role is distinct from 'owner'
group by rv.listing_id;

grant select on listing_rating_summary to anon, authenticated;

notify pgrst, 'reload schema';
