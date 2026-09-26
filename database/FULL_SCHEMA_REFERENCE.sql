-- ==================================================================================
-- RENTA — FULL DATABASE SCHEMA REFERENCE
-- ==================================================================================
-- What this file is:
--   A single, cleanly ordered document showing the FINAL, correct state of
--   every table, policy, trigger, and view in the project — after all the
--   incremental migrations built during development are applied and
--   superseded versions are resolved. Several rules below (e.g. who can
--   insert a rental) were rewritten more than once as new requirements
--   came in; only the LAST version of each is kept here, since running an
--   earlier, now-superseded version would silently undo a later fix.
--
-- What this file is NOT:
--   A replacement for the individual migration files under
--   database/schema/*.sql — those remain the actual source-of-truth
--   history and are what you actually run, in order, against Supabase.
--   This file exists purely so a person can read (or re-run against a
--   brand-new database) the whole schema in one place without having to
--   mentally track which later file overrides which earlier one.
--
-- How to use it:
--   - On a FRESH Supabase project: run this file top to bottom, once.
--   - On the EXISTING project this was actually built against: everything
--     below is already applied piece by piece across the files in
--     database/schema/*.sql — you do not need to re-run this file too.
--
-- Order matters: tables before policies before triggers before views,
-- and later sections sometimes reference tables/columns defined earlier.
-- ==================================================================================


-- ====================================================================
-- SECTION 1 — CORE TABLES
-- Users (auth identity), listings, profiles + saved listings, rentals.
-- These are the base tables everything else (policies, triggers,
-- reviews) is built on top of.
-- ====================================================================

-- ---- 1a. users — auth identity + basic profile ----
-- Mirrors Supabase's built-in auth.users by id, so other tables can FK to
-- a simple uuid without depending on the `auth` schema directly.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique,                      -- nullable: anonymous users have none (see Section 2)
  avatar_url text,
  auth_provider text not null default 'anonymous', -- 'anonymous' | 'google'
  is_anonymous boolean not null default false,      -- kept in sync by a trigger, Section 2
  created_at timestamptz not null default now()
);

-- ---- 1b. listings — equipment listings owned/managed by users ----
create table if not exists listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  name text not null,
  brand text,
  model text,
  category text not null,
  price_per_day numeric(10,2) not null check (price_per_day > 0),
  condition text not null default 'Good',
  description text,
  location text not null,
  latitude double precision,
  longitude double precision,
  primary_image_url text,
  photo_urls text[] not null default '{}',          -- real uploaded photo URLs, Section 3
  is_active boolean not null default true,
  availability_note text not null default 'Available now',
  plan text not null default 'free',                -- 'free' | 'standard' | 'featured'
  plan_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_listings_owner on listings(owner_id);
create index if not exists idx_listings_category on listings(category);

-- ---- 1c. profiles + saved_listings ----
-- profiles: extended data (ratings/review counts) kept separate from the
-- auth identity row. saved_listings: bookmarks, many-to-many.
create table if not exists profiles (
  user_id uuid primary key references users(id) on delete cascade,
  rating numeric(2,1) not null default 0,
  review_count integer not null default 0,
  rental_history_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists saved_listings (
  user_id uuid not null references users(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- ---- 1d. rentals — rental requests between a renter and a listing's owner ----
create table if not exists rentals (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  renter_id uuid not null references users(id) on delete cascade,
  start_date date not null,
  end_date date not null check (end_date > start_date),
  price_per_day numeric(10,2) not null,
  status text not null default 'Pending', -- Pending | Accepted | Declined | Completed | Cancelled
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_rentals_listing on rentals(listing_id);
create index if not exists idx_rentals_renter on rentals(renter_id);
create index if not exists idx_rentals_status on rentals(status);


-- ====================================================================
-- SECTION 2 — ANONYMOUS AUTH SUPPORT
-- Makes the `users` table compatible with Supabase anonymous sign-in,
-- and keeps `is_anonymous` accurate automatically so RLS elsewhere
-- (Section 5, "require a real account") can trust it.
-- ====================================================================

alter table users alter column email drop not null;
alter table users drop constraint if exists users_email_key;

create unique index if not exists users_email_unique_not_null
  on users (email)
  where email is not null;

alter table users
  drop constraint if exists users_id_fkey,
  add constraint users_id_fkey
    foreign key (id) references auth.users(id) on delete cascade;

create or replace function sync_is_anonymous()
returns trigger as $$
begin
  new.is_anonymous := (new.auth_provider = 'anonymous');
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_is_anonymous on users;
create trigger trg_sync_is_anonymous
  before insert or update on users
  for each row execute function sync_is_anonymous();


-- ====================================================================
-- SECTION 3 — STRICTER LISTING VALIDATION
-- Moves rules that only lived in the frontend form (ListEquipment.jsx)
-- into real, unbypassable database constraints and a per-plan limit
-- trigger, plus a duplicate-listing guard.
-- ====================================================================

alter table listings
  drop constraint if exists listings_min_photos;
alter table listings
  add constraint listings_min_photos check (array_length(photo_urls, 1) >= 3);

alter table listings
  drop constraint if exists listings_name_length,
  drop constraint if exists listings_description_length;
alter table listings
  add constraint listings_name_length check (char_length(btrim(name)) between 3 and 120),
  add constraint listings_description_length check (
    description is not null and char_length(btrim(description)) >= 20
  );

alter table listings
  drop constraint if exists listings_category_allowed;
alter table listings
  add constraint listings_category_allowed check (
    category in ('Power Tools', 'Construction', 'Gardening', 'Cleaning', 'Heavy Equipment')
  );

alter table listings
  drop constraint if exists listings_condition_allowed;
alter table listings
  add constraint listings_condition_allowed check (
    condition in ('New', 'Like New', 'Good', 'Fair', 'Needs Repair')
  );

alter table listings
  drop constraint if exists listings_price_ceiling;
alter table listings
  add constraint listings_price_ceiling check (price_per_day <= 100000);

alter table listings
  drop constraint if exists listings_location_present;
alter table listings
  add constraint listings_location_present check (char_length(btrim(location)) > 0);

alter table listings
  drop constraint if exists listings_plan_allowed;
alter table listings
  add constraint listings_plan_allowed check (plan in ('free', 'standard', 'featured'));

alter table listings
  drop constraint if exists listings_plan_photo_limit;
alter table listings
  add constraint listings_plan_photo_limit check (
    array_length(photo_urls, 1) <= case plan
      when 'free' then 5
      when 'standard' then 10
      when 'featured' then 20
    end
  );

create or replace function enforce_listing_plan_limits()
returns trigger as $$
declare
  max_active integer;
  active_count integer;
begin
  max_active := case new.plan
    when 'free' then 7
    when 'standard' then 10
    when 'featured' then 30
    else 7
  end;

  select count(*) into active_count
  from listings
  where owner_id = new.owner_id
    and is_active = true
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if active_count >= max_active then
    raise exception
      'Plan "%" allows up to % active listings; you already have %.',
      new.plan, max_active, active_count
      using errcode = '23514';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_enforce_listing_plan_limits on listings;
create trigger trg_enforce_listing_plan_limits
  before insert or update of owner_id, plan, is_active on listings
  for each row
  when (new.is_active = true)
  execute function enforce_listing_plan_limits();

create unique index if not exists listings_no_duplicate_active
  on listings (owner_id, lower(btrim(name)), lower(btrim(coalesce(brand, ''))), lower(btrim(coalesce(model, ''))))
  where is_active = true;


-- ====================================================================
-- SECTION 4 — ROW-LEVEL SECURITY: LISTINGS, PROFILES, SAVED LISTINGS
-- Public can read active listings and all profiles; only the owner can
-- write their own rows. listings_insert_own here is the FINAL version
-- (requires a real, non-anonymous account — see Section 2's is_anonymous).
-- ====================================================================

alter table listings enable row level security;

drop policy if exists listings_select_active on listings;
create policy listings_select_active on listings
  for select using (is_active = true);

drop policy if exists listings_insert_own on listings;
create policy listings_insert_own on listings
  for insert with check (
    owner_id = auth.uid()
    and exists (select 1 from users u where u.id = auth.uid() and u.is_anonymous = false)
  );

drop policy if exists listings_update_own on listings;
create policy listings_update_own on listings
  for update using (owner_id = auth.uid());

drop policy if exists listings_delete_own on listings;
create policy listings_delete_own on listings
  for delete using (owner_id = auth.uid());

alter table profiles enable row level security;
alter table saved_listings enable row level security;

drop policy if exists profiles_select_all on profiles;
create policy profiles_select_all on profiles
  for select using (true);

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update using (user_id = auth.uid());

drop policy if exists profiles_insert_own on profiles;
create policy profiles_insert_own on profiles
  for insert with check (user_id = auth.uid());

drop policy if exists saved_listings_owner_only on saved_listings;
create policy saved_listings_owner_only on saved_listings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ====================================================================
-- SECTION 5 — ROW-LEVEL SECURITY: RENTALS
-- rentals_insert_own here is the FINAL version — it combines THREE rules
-- that were each added at different points: (1) you can only insert as
-- yourself, (2) you cannot rent your own listing, (3) you must have a
-- real, non-anonymous account. Earlier, simpler versions of this same
-- policy from development history are intentionally NOT included here,
-- since applying them after this one would remove rules (2) and (3).
-- ====================================================================

alter table rentals enable row level security;

drop policy if exists rentals_select_participant on rentals;
create policy rentals_select_participant on rentals
  for select using (
    renter_id = auth.uid()
    or exists (
      select 1 from listings l
      where l.id = rentals.listing_id and l.owner_id = auth.uid()
    )
  );

drop policy if exists rentals_insert_own on rentals;
create policy rentals_insert_own on rentals
  for insert with check (
    renter_id = auth.uid()
    and not exists (
      select 1 from listings l
      where l.id = listing_id and l.owner_id = auth.uid()
    )
    and exists (
      select 1 from users u
      where u.id = auth.uid() and u.is_anonymous = false
    )
  );

drop policy if exists rentals_update_participant on rentals;
create policy rentals_update_participant on rentals
  for update using (
    renter_id = auth.uid()
    or exists (
      select 1 from listings l
      where l.id = rentals.listing_id and l.owner_id = auth.uid()
    )
  );


-- ====================================================================
-- SECTION 6 — SELF-RENTAL PREVENTION (TRIGGER LAYER)
-- Defense in depth alongside Section 5's RLS check: re-verifies the same
-- "can't rent your own listing" rule directly, so it still holds even if
-- a future service-role/admin code path bypasses RLS entirely.
-- ====================================================================

create or replace function reject_self_rental()
returns trigger as $$
declare
  v_owner_id uuid;
begin
  select owner_id into v_owner_id from listings where id = new.listing_id;

  if v_owner_id is null then
    raise exception 'Listing % does not exist.', new.listing_id
      using errcode = '23503';
  end if;

  if v_owner_id = new.renter_id then
    raise exception 'You cannot rent your own listing.'
      using errcode = '23514';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_reject_self_rental on rentals;
create trigger trg_reject_self_rental
  before insert or update of listing_id, renter_id on rentals
  for each row execute function reject_self_rental();


-- ====================================================================
-- SECTION 7 — RENTAL STATUS TRANSITION RULES
-- Who is allowed to move a rental from one status to another. This is
-- the FINAL version of enforce_rental_status_transition (includes the
-- "owner may mark Completed" rule added after reviews were introduced —
-- an earlier version of this same function without that rule existed
-- briefly during development and is superseded by this one).
-- ====================================================================

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


-- ====================================================================
-- SECTION 8 — REVIEWS & RATINGS
-- A review may only be left for a Completed rental, only by that
-- rental's actual renter, about that rental's actual listing owner —
-- enforced by a trigger, not just app logic. One review per rental
-- (UNIQUE constraint). No update/delete policies exist at all, so
-- reviews are permanent once submitted.
-- ====================================================================

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

drop policy if exists reviews_select_all on reviews;
create policy reviews_select_all on reviews
  for select using (true);

drop policy if exists reviews_insert_own on reviews;
create policy reviews_insert_own on reviews
  for insert with check (reviewer_id = auth.uid());

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


-- ====================================================================
-- SECTION 9 — RATING AGGREGATE VIEWS
-- Real, computed-from-actual-data ratings — never fabricated numbers.
-- owner_rating_summary: an owner's rating across ALL their listings.
-- listing_rating_summary: a single listing's own rating (like a product
-- page). Explicit GRANTs are required here — a view does not
-- automatically inherit the same role grants its underlying table has.
-- ====================================================================

create or replace view owner_rating_summary as
select
  reviewed_user_id as owner_id,
  round(avg(rating)::numeric, 1) as avg_rating,
  count(*) as review_count
from reviews
group by reviewed_user_id;

create or replace view listing_rating_summary as
select
  r.listing_id,
  round(avg(rv.rating)::numeric, 1) as avg_rating,
  count(*) as review_count
from reviews rv
join rentals r on r.id = rv.rental_id
group by r.listing_id;

grant select on owner_rating_summary to anon, authenticated;
grant select on listing_rating_summary to anon, authenticated;


-- ====================================================================
-- SECTION 10 — STORAGE: LISTING PHOTOS
-- Real, persistent photo uploads (replacing temporary blob: preview
-- URLs). Public read; a user may only write/delete inside a folder
-- path prefixed with their own user id.
-- ====================================================================

insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', true)
on conflict (id) do nothing;

drop policy if exists "listing_photos_public_read" on storage.objects;
create policy "listing_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'listing-photos');

drop policy if exists "listing_photos_insert_own" on storage.objects;
create policy "listing_photos_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "listing_photos_delete_own" on storage.objects;
create policy "listing_photos_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ====================================================================
-- SECTION 11 — FINISH: REFRESH POSTGREST'S SCHEMA CACHE
-- Without this, newly added tables/views/columns can intermittently
-- 404 or fail to embed correctly until PostgREST notices them on its
-- own schedule — this forces it to notice immediately.
-- ====================================================================

notify pgrst, 'reload schema';
