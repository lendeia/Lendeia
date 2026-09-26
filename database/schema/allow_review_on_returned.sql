-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — allow reviews on Returned rentals too
-- PURPOSE   :
--   enforce_review_eligibility() (two_way_category_reviews.sql) only
--   ever allowed a review for a 'Completed' rental — since
--   real_returned_status.sql introduced a genuine, distinct 'Returned'
--   status (an early return, separate from Cancelled), a rental that
--   ended that way could never be reviewed at all. Both are legitimate,
--   finished rental experiences worth reviewing; only Cancelled/
--   Declined (which never actually happened) and Pending/Accepted
--   (still ongoing) remain non-reviewable.
-- CONNECTS TO :
--   Consumed by Dashboard.jsx's "Leave Review" button, which now also
--   needs to treat status === 'Returned' as review-eligible, the same
--   way it already treats 'Completed'.
-- ==================================================================

create or replace function enforce_review_eligibility()
returns trigger as $$
declare
  v_rental_status text;
  v_renter_id uuid;
  v_owner_id uuid;
begin
  select r.status, r.renter_id, l.owner_id
    into v_rental_status, v_renter_id, v_owner_id
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

-- Both reputation views below also only ever counted 'Completed' —
-- same gap, same fix: a Returned rental is just as much a legitimately
-- finished rental as a Completed one (the item genuinely was rented and
-- used), so it should count toward someone's rental history/reputation
-- and toward the renter-verification threshold too.
create or replace view user_completed_rentals_summary as
select user_id, count(*) as completed_count
from (
  select renter_id as user_id from rentals where status in ('Completed', 'Returned')
  union all
  select l.owner_id as user_id
  from rentals r
  join listings l on l.id = r.listing_id
  where r.status in ('Completed', 'Returned')
) t
group by user_id;

create or replace view renter_completed_rentals_summary as
select renter_id as user_id, count(*) as completed_as_renter
from rentals
where status in ('Completed', 'Returned')
group by renter_id;

notify pgrst, 'reload schema';
