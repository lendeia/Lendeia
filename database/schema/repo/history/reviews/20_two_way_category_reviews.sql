-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — two-way category reviews + reporting
-- PURPOSE   :
--   Extends the review system from "renter rates owner, one overall
--   star rating" to a real two-sided system:
--     - Renter -> Owner: Overall, Item matched listing, Communication,
--       Reliability, Rental experience
--     - Owner -> Renter: Overall, Communication, Reliability, Returned
--       item properly, Followed rental agreement
--   Both sides may now review the SAME completed rental — previously
--   the UNIQUE constraint was on rental_id alone (one review total per
--   rental); it's now on (rental_id, reviewer_id), so each side gets
--   exactly one review each, still enforced at the database level, not
--   just app logic.
--
--   Trust rules (all still enforced by a trigger, not just the app):
--     - Only a Completed rental's actual renter or actual owner may
--       review it — nobody else.
--     - No self-review (redundant given the above, kept as defense in
--       depth).
--     - Which category columns are "real" for a given review is
--       determined by reviewer_role, set automatically by the trigger
--       from which side the reviewer actually was — never trusted from
--       client input.
--     - Still no update/delete policies on `reviews` at all — reviews
--       remain permanent once submitted, so there's no "endless editing
--       after disputes."
--
--   Also adds review_reports (a person can flag a review as
--   inappropriate/fraudulent) and two reputation views (completed-
--   rental counts, per-category averages).
--
--   EXPLICITLY NOT INCLUDED — flagged, not hidden: an admin/moderation
--   dashboard to actually act on reports (approve/dismiss/remove a
--   review) needs a real admin-role/permission system, which does not
--   exist in this project yet. review_reports records a report; nothing
--   currently reads or acts on that queue. Building that safely (so a
--   regular user can't grant themselves admin) is its own follow-up
--   piece, not something to bolt on here.
-- CONNECTS TO :
--   Extends database/schema/reviews_and_ratings.sql. Consumed by
--   backend/supabase/reviews.js.
-- ==================================================================

-- ---- 1. New columns on `reviews` ----
alter table reviews
  add column if not exists reviewer_role text,
  add column if not exists communication_rating smallint,
  add column if not exists reliability_rating smallint,
  -- renter -> owner only
  add column if not exists item_accuracy_rating smallint,
  add column if not exists rental_experience_rating smallint,
  -- owner -> renter only
  add column if not exists return_condition_rating smallint,
  add column if not exists agreement_followed_rating smallint;

alter table reviews
  drop constraint if exists reviews_reviewer_role_allowed;
alter table reviews
  add constraint reviews_reviewer_role_allowed check (reviewer_role in ('renter', 'owner'));

alter table reviews
  drop constraint if exists reviews_category_ratings_range;
alter table reviews
  add constraint reviews_category_ratings_range check (
    (communication_rating is null or communication_rating between 1 and 5) and
    (reliability_rating is null or reliability_rating between 1 and 5) and
    (item_accuracy_rating is null or item_accuracy_rating between 1 and 5) and
    (rental_experience_rating is null or rental_experience_rating between 1 and 5) and
    (return_condition_rating is null or return_condition_rating between 1 and 5) and
    (agreement_followed_rating is null or agreement_followed_rating between 1 and 5)
  );

-- ---- 2. One review per rental PER SIDE, not per rental overall ----
alter table reviews drop constraint if exists reviews_rental_id_key;
drop index if exists reviews_rental_id_key;
create unique index if not exists reviews_one_per_rental_per_reviewer
  on reviews (rental_id, reviewer_id);

-- ---- 3. Replace the eligibility trigger to allow both directions ----
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

  if v_rental_status <> 'Completed' then
    raise exception 'You can only review a completed rental.'
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
    -- Owner-only categories don't apply to a renter's review — force
    -- them null regardless of what the client sent, rather than trust it.
    new.return_condition_rating := null;
    new.agreement_followed_rating := null;
  elsif new.reviewer_id = v_owner_id then
    if new.reviewed_user_id <> v_renter_id then
      raise exception 'As the owner, this review must be for the renter.'
        using errcode = '23514';
    end if;
    new.reviewer_role := 'owner';
    -- Renter-only categories don't apply to an owner's review.
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

-- ---- 4. Review reporting (submission only — see file header) ----
create table if not exists review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references reviews(id) on delete cascade,
  reporter_id uuid not null references users(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) > 0),
  description text,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

create unique index if not exists review_reports_one_per_reporter
  on review_reports (review_id, reporter_id);

alter table review_reports enable row level security;

drop policy if exists review_reports_insert_own on review_reports;
create policy review_reports_insert_own on review_reports
  for insert with check (reporter_id = auth.uid());

-- A reporter can see their own submitted reports (e.g. to avoid
-- reporting the same review twice) — but not anyone else's reports,
-- since there's no admin role yet to distinguish "admin reading the
-- queue" from "a regular user reading other people's reports."
drop policy if exists review_reports_select_own on review_reports;
create policy review_reports_select_own on review_reports
  for select using (reporter_id = auth.uid());

-- ---- 5. Reputation: completed-rental counts + category averages ----
create or replace view user_completed_rentals_summary as
select user_id, count(*) as completed_count
from (
  select renter_id as user_id from rentals where status = 'Completed'
  union all
  select l.owner_id as user_id
  from rentals r
  join listings l on l.id = r.listing_id
  where r.status = 'Completed'
) t
group by user_id;

create or replace view user_category_rating_summary as
select
  reviewed_user_id as user_id,
  round(avg(communication_rating)::numeric, 1) as avg_communication,
  round(avg(reliability_rating)::numeric, 1) as avg_reliability,
  round(avg(item_accuracy_rating)::numeric, 1) as avg_item_accuracy,
  round(avg(rental_experience_rating)::numeric, 1) as avg_rental_experience,
  round(avg(return_condition_rating)::numeric, 1) as avg_return_condition,
  round(avg(agreement_followed_rating)::numeric, 1) as avg_agreement_followed
from reviews
group by reviewed_user_id;

grant select on user_completed_rentals_summary to anon, authenticated;
grant select on user_category_rating_summary to anon, authenticated;

notify pgrst, 'reload schema';
