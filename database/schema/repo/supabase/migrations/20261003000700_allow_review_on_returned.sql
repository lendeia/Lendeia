-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — let Returned rentals be reviewed
-- PURPOSE   :
--   Fixes "You can only review a completed rental." after a renter
--   returns an item early. The live database still has an older
--   version of enforce_review_eligibility() that only accepts
--   'Completed'. This installs the final version (Completed OR
--   Returned, and sets reviews.listing_id), plus the reputation views
--   that should also count Returned rentals. Safe to run more than
--   once. Combines history/reviews/28_allow_review_on_returned.sql and
--   history/reviews/59_shop_reviews_sync.sql.
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


-- ---- 4. Returned rentals count toward reputation too ----
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
