-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — rental limits, verification, delisting, notifications
-- PURPOSE   :
--   Four features:
--
--   1) RENTAL CAPACITY LIMITS + VERIFICATION
--      A renter with fewer than 5 successfully COMPLETED rentals (as a
--      renter) can have at most 2 active (Pending/Accepted) requests at
--      once; once they've completed 5, that rises to 5. Enforced by a
--      trigger on insert into `rentals` — not just a frontend check —
--      so it can't be bypassed by calling the API directly.
--
--   2) AUTO-DELIST ON SUCCESSFUL COMPLETION
--      When an owner marks a rental Completed, the underlying listing
--      is automatically set inactive (is_active = false) — it no longer
--      shows up in Browse/Map/Home. The owner still needs to be able to
--      see it in their own Dashboard afterward (to relist or delete),
--      which needs a new RLS policy: previously `listings_select_active`
--      only ever let ANYONE (including the owner) see active listings —
--      an owner's own inactive listings were invisible even to
--      themselves.
--
--   3) NOTIFICATIONS
--      A real `notifications` table + triggers for: rental request
--      received, request accepted, request declined, new message, new
--      review. "Payment successful" is inserted directly from app code
--      at the point of a successful mock payment (see
--      backend/supabase/subscription.js), since that event doesn't
--      correspond to any existing database row changing.
--      NOT INCLUDED: "listing expiring" as a stored/pushed notification
--      — that needs something to run on a schedule (e.g. pg_cron),
--      which is a separate piece of Supabase configuration this
--      migration doesn't set up. Instead, Dashboard.jsx computes
--      "expiring soon" live from each listing's plan_expires_at when the
--      page loads and shows an inline banner — real information, just
--      not a persisted/pushed notification.
-- CONNECTS TO :
--   Consumed by backend/supabase/rentals.js, listings.js, notifications.js
--   (new). RLS/triggers here are the actual enforcement; the frontend
--   only reflects what these allow.
-- ==================================================================

-- ====================================================================
-- 1. RENTAL CAPACITY LIMITS + VERIFICATION
-- ====================================================================

create or replace view renter_completed_rentals_summary as
select renter_id as user_id, count(*) as completed_as_renter
from rentals
where status = 'Completed'
group by renter_id;

grant select on renter_completed_rentals_summary to anon, authenticated;

create or replace function enforce_renter_active_limit()
returns trigger as $$
declare
  v_completed integer;
  v_cap integer;
  v_active_count integer;
begin
  select coalesce(completed_as_renter, 0) into v_completed
  from renter_completed_rentals_summary
  where user_id = new.renter_id;

  v_cap := case when coalesce(v_completed, 0) >= 5 then 5 else 2 end;

  select count(*) into v_active_count
  from rentals
  where renter_id = new.renter_id and status in ('Pending', 'Accepted');

  if v_active_count >= v_cap then
    raise exception
      'You can have up to % active rental requests at a time (you have %.). Complete % successful rentals to raise this to 5.',
      v_cap, v_active_count, 5
      using errcode = '23514';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_enforce_renter_active_limit on rentals;
create trigger trg_enforce_renter_active_limit
  before insert on rentals
  for each row execute function enforce_renter_active_limit();


-- ====================================================================
-- 2. AUTO-DELIST ON SUCCESSFUL COMPLETION
-- ====================================================================

-- An owner can now see their OWN listings regardless of is_active — this
-- is additive (RLS policies for the same command are OR'd together), so
-- public visibility of active listings (listings_select_active) is
-- unaffected; this only adds visibility of a person's own inactive ones.
drop policy if exists listings_select_own_all on listings;
create policy listings_select_own_all on listings
  for select using (owner_id = auth.uid());

-- Final version of enforce_rental_status_transition (was previously
-- defined in reviews_and_ratings.sql) — adds one line in the Completed
-- branch: delist the listing.
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
    -- Auto-delist: a successfully completed rental takes the item off
    -- the public marketplace until the owner explicitly relists it.
    update listings set is_active = false where id = new.listing_id;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_enforce_rental_status_transition on rentals;
create trigger trg_enforce_rental_status_transition
  before update of status on rentals
  for each row execute function enforce_rental_status_transition();


-- ====================================================================
-- 3. NOTIFICATIONS
-- ====================================================================

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null check (type in (
    'rental_request_received', 'request_accepted', 'request_declined',
    'new_message', 'payment_successful', 'new_review'
  )),
  title text not null,
  body text,
  related_id uuid,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user on notifications(user_id, created_at desc);

alter table notifications enable row level security;

drop policy if exists notifications_select_own on notifications;
create policy notifications_select_own on notifications
  for select using (user_id = auth.uid());

-- A user may only insert a notification FOR THEMSELVES (used by the
-- "payment successful" case, inserted directly from app code at the
-- moment of a successful mock payment). Cross-user notifications (e.g.
-- "your request was accepted", which must be inserted for the RENTER by
-- an action the OWNER performed) only ever happen via the
-- SECURITY DEFINER trigger functions below, which bypass this policy —
-- a plain client can never directly insert a notification for someone
-- else.
drop policy if exists notifications_insert_own on notifications;
create policy notifications_insert_own on notifications
  for insert with check (user_id = auth.uid());

drop policy if exists notifications_update_own on notifications;
create policy notifications_update_own on notifications
  for update using (user_id = auth.uid());

-- ---- Rental request received (owner) / accepted / declined (renter) ----
create or replace function notify_on_rental_insert()
returns trigger as $$
declare
  v_owner_id uuid;
  v_listing_name text;
begin
  select owner_id, name into v_owner_id, v_listing_name from listings where id = new.listing_id;
  insert into notifications (user_id, type, title, body, related_id)
  values (
    v_owner_id,
    'rental_request_received',
    'New rental request',
    format('Someone requested to rent "%s".', v_listing_name),
    new.id
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_notify_on_rental_insert on rentals;
create trigger trg_notify_on_rental_insert
  after insert on rentals
  for each row execute function notify_on_rental_insert();

create or replace function notify_on_rental_status_change()
returns trigger as $$
declare
  v_listing_name text;
begin
  if new.status = old.status then
    return new;
  end if;

  select name into v_listing_name from listings where id = new.listing_id;

  if new.status = 'Accepted' then
    insert into notifications (user_id, type, title, body, related_id)
    values (new.renter_id, 'request_accepted', 'Request accepted',
      format('Your request to rent "%s" was accepted.', v_listing_name), new.id);
  elsif new.status = 'Declined' then
    insert into notifications (user_id, type, title, body, related_id)
    values (new.renter_id, 'request_declined', 'Request declined',
      format('Your request to rent "%s" was declined.', v_listing_name), new.id);
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_notify_on_rental_status_change on rentals;
create trigger trg_notify_on_rental_status_change
  after update of status on rentals
  for each row execute function notify_on_rental_status_change();

-- ---- New message ----
create or replace function notify_on_message_insert()
returns trigger as $$
declare
  v_recipient_id uuid;
begin
  select user_id into v_recipient_id
  from conversation_participants
  where conversation_id = new.conversation_id and user_id <> new.sender_id
  limit 1;

  if v_recipient_id is not null then
    insert into notifications (user_id, type, title, body, related_id)
    values (v_recipient_id, 'new_message', 'New message', left(new.content, 140), new.conversation_id);
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_notify_on_message_insert on messages;
create trigger trg_notify_on_message_insert
  after insert on messages
  for each row execute function notify_on_message_insert();

-- ---- New review ----
create or replace function notify_on_review_insert()
returns trigger as $$
begin
  insert into notifications (user_id, type, title, body, related_id)
  values (new.reviewed_user_id, 'new_review', 'New review',
    format('You received a %s-star review.', new.rating), new.id);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_notify_on_review_insert on reviews;
create trigger trg_notify_on_review_insert
  after insert on reviews
  for each row execute function notify_on_review_insert();

notify pgrst, 'reload schema';
