-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — reviews & ratings
-- PURPOSE   :
--   Adds a real reviews system, matching the marketplace spec's rules:
--     - A review can only be left for a rental that is Completed.
--     - Only the RENTER of that rental may leave it (not the owner, not
--       a random user).
--     - The review must be about that rental's listing OWNER (the person
--       being reviewed is fixed by the rental, not chosen freely).
--     - A user cannot review themselves (redundant with the above, but
--       checked directly too, as defense in depth).
--     - Exactly one review per rental (enforced by a UNIQUE constraint on
--       rental_id, not just app-side logic).
--     - No updates/deletes are permitted via RLS at all (no policy for
--       either exists) — reviews are permanent once submitted, which also
--       makes "editing another user's review" structurally impossible,
--       not just disallowed by convention.
--   Also extends the rental-status trigger (see
--   database/schema/rental_status_transitions.sql) so an owner can mark
--   an Accepted rental as Completed — without this, "Completed" was an
--   unreachable status and reviews would have been permanently dead code.
-- CONNECTS TO :
--   Consumed by backend/supabase/reviews.js. The rating aggregate view
--   (owner_rating_summary) is read by frontend/pages/Store/OwnerStore.jsx
--   and Details.jsx's owner card.
-- ==================================================================

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null unique references rentals(id) on delete cascade,
  reviewer_id uuid not null references users(id) on delete cascade,
  reviewed_user_id uuid not null references users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists idx_reviews_reviewed_user on reviews(reviewed_user_id);

alter table reviews enable row level security;

-- Public read (ratings/reviews are shown on owner store pages to anyone).
drop policy if exists reviews_select_all on reviews;
create policy reviews_select_all on reviews
  for select using (true);

-- A user can only insert a review AS THEMSELVES — WHICH rental/rating/
-- reviewed-user combinations are actually legitimate is enforced by the
-- trigger below, not by this policy (RLS alone can't easily check
-- "is this rental Completed and does it belong to this renter" against
-- another table's current state in a race-safe way — a trigger can).
drop policy if exists reviews_insert_own on reviews;
create policy reviews_insert_own on reviews
  for insert with check (reviewer_id = auth.uid());

-- No update or delete policies exist for `reviews` at all. With RLS
-- enabled and no matching policy, Postgres denies the operation by
-- default — so reviews are structurally immutable, not just "not
-- exposed in the UI."

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

  if new.reviewer_id <> v_renter_id then
    raise exception 'Only the renter of this rental can leave this review.'
      using errcode = '23514';
  end if;

  if new.reviewed_user_id <> v_owner_id then
    raise exception 'This review must be for the listing owner.'
      using errcode = '23514';
  end if;

  if new.reviewer_id = new.reviewed_user_id then
    raise exception 'You cannot review yourself.'
      using errcode = '23514';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_enforce_review_eligibility on reviews;
create trigger trg_enforce_review_eligibility
  before insert on reviews
  for each row execute function enforce_review_eligibility();

-- Real aggregate rating per owner, computed from actual review rows —
-- never a fabricated number. An owner with zero reviews simply won't
-- appear in this view (backend/supabase/reviews.js treats that as
-- "New Owner" rather than defaulting to a fake rating).
create or replace view owner_rating_summary as
select
  reviewed_user_id as owner_id,
  round(avg(rating)::numeric, 1) as avg_rating,
  count(*) as review_count
from reviews
group by reviewed_user_id;

-- ---- Extend rental status transitions: allow owner to mark Completed ----
-- Replaces the function from database/schema/rental_status_transitions.sql
-- with the same rules PLUS: the owner may move an Accepted rental to
-- Completed (nobody else, and only from Accepted — not from Pending).
create or replace function enforce_rental_status_transition()
returns trigger as $$
declare
  v_owner_id uuid;
begin
  if new.status = old.status then
    return new;
  end if;

  select owner_id into v_owner_id from listings where id = new.listing_id;

  if old.status in ('Cancelled', 'Declined', 'Completed') then
    raise exception 'This rental request is already %, and cannot be changed further.', old.status
      using errcode = '23514';
  end if;

  if new.status in ('Accepted', 'Declined') and auth.uid() is distinct from v_owner_id then
    raise exception 'Only the listing owner can accept or decline a rental request.'
      using errcode = '23514';
  end if;

  if new.status = 'Cancelled'
     and auth.uid() is distinct from new.renter_id
     and auth.uid() is distinct from v_owner_id then
    raise exception 'Only the renter or the listing owner can cancel this rental request.'
      using errcode = '23514';
  end if;

  if new.status = 'Completed' then
    if auth.uid() is distinct from v_owner_id then
      raise exception 'Only the listing owner can mark a rental as completed.'
        using errcode = '23514';
    end if;
    if old.status <> 'Accepted' then
      raise exception 'Only an Accepted rental can be marked Completed.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_enforce_rental_status_transition on rentals;
create trigger trg_enforce_rental_status_transition
  before update of status on rentals
  for each row execute function enforce_rental_status_transition();
