-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION - real 30-day account deletion (new)
-- PURPOSE   :
--   Account deletion was previously immediate and permanent - one
--   click, no recovery. This adds a real 30-day grace period instead:
--   clicking "Delete Account" marks the account 'pending_deletion'
--   with a scheduled_deletion_at 30 days out and signs them out; if
--   they sign back in before that date, ensureAnonymousSession()
--   (backend/supabase/anonymousAuth.js) automatically restores the
--   account to active and cancels the deletion - no separate
--   "undo" step to hunt for, logging back in IS the undo. Their
--   listings stop showing to other people for that whole window
--   (matching what someone would reasonably expect "delete my
--   account" to mean), but nothing is actually destroyed until the 30
--   days genuinely pass, at which point a daily scheduled job
--   (pg_cron) permanently deletes them - the exact same real,
--   irreversible deletion supabase/functions/delete-account/index.ts
--   already performed immediately before.
-- CONNECTS TO :
--   backend/supabase/account.js's deleteMyAccount() (now schedules
--   instead of deleting immediately); backend/supabase/
--   anonymousAuth.js's ensureAnonymousSession() (the reactivate-on-
--   login check); supabase/functions/delete-account/index.ts (updated
--   to match).
-- ==================================================================

alter table users
  drop constraint if exists users_account_status_check;
alter table users
  add constraint users_account_status_check
  check (account_status in ('active', 'restricted', 'suspended', 'banned', 'pending_deletion'));

alter table users
  add column if not exists scheduled_deletion_at timestamptz;

-- ---- Hide a pending-deletion account's listings from everyone else ----
-- Extends the real-time expiration check listings_select_active
-- already does (listing_lifecycle.sql) with the identical no-cron-
-- needed approach: checked fresh on every read, not a stale flag that
-- could drift.
drop policy if exists listings_select_active on listings;
create policy listings_select_active on listings
  for select using (
    is_active = true
    and (plan_expires_at is null or plan_expires_at > now())
    and not exists (
      select 1 from users where users.id = listings.owner_id and users.account_status = 'pending_deletion'
    )
  );

-- ---- Cancel-on-login: reactivate if they come back inside the window ----
-- Real changes only happen when there's actually a pending deletion
-- that hasn't passed yet; otherwise a no-op. Mirrors
-- expire_suspension_if_due()'s same pattern from trust_safety_
-- account_status.sql.
create or replace function reactivate_if_pending_deletion(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update users
  set account_status = 'active', scheduled_deletion_at = null
  where id = target
    and account_status = 'pending_deletion'
    and scheduled_deletion_at is not null
    and scheduled_deletion_at > now();
end;
$$;

-- ---- The actual, permanent, irreversible deletion once 30 days pass ----
-- Runs INSIDE the database (pg_cron below), not as an HTTP call, so it
-- can delete straight from auth.users too, not just public.users -
-- something supabase/functions/delete-account/index.ts needed the
-- service-role Admin API for specifically because it runs as an edge
-- function outside the database; a function defined here with definer
-- rights can do both in one place.
create or replace function finalize_scheduled_deletions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  due_user record;
begin
  for due_user in
    select id from users
    where account_status = 'pending_deletion'
      and scheduled_deletion_at is not null
      and scheduled_deletion_at <= now()
  loop
    -- Each deletion is independent — admin_actions.admin_id uses
    -- `on delete restrict` on purpose (an audit trail should never
    -- silently lose "who did this"), which means deleting someone who
    -- has ever taken a moderation action (even an ex-admin) would fail
    -- this specific delete. Without this exception handler, one such
    -- case would abort the WHOLE loop and silently block every other
    -- legitimate deletion due to run that day too. Catching it here
    -- means everyone else still gets processed correctly; that one
    -- account just stays pending (safe - "still exists a bit longer"
    -- is the right failure mode here, not "blocks everyone else" or
    -- "silently loses audit history").
    begin
      delete from public.users where id = due_user.id;
      delete from auth.users where id = due_user.id;
    exception when others then
      raise warning 'finalize_scheduled_deletions: could not delete user %: %', due_user.id, sqlerrm;
    end;
  end loop;
end;
$$;

-- ---- Run it automatically, once a day ----
create extension if not exists pg_cron;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.unschedule(jobid) from cron.job where jobname = 'finalize-scheduled-deletions';
select cron.schedule(
  'finalize-scheduled-deletions',
  '0 3 * * *', -- 03:00 UTC daily - low-traffic hours
  $$select finalize_scheduled_deletions();$$
);

notify pgrst, 'reload schema';
