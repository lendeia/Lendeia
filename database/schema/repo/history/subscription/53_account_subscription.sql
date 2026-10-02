-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — account-level subscription
-- PURPOSE   :
--   Previously, "plan" (free/standard/featured) was chosen and paid for
--   PER LISTING, inside the ListEquipment publish flow. This moves it to
--   the ACCOUNT — like a real subscription (ChatGPT Plus-style): you
--   subscribe once, and it applies to every listing you create while
--   subscribed, shown as a badge in the top nav / Profile, not
--   re-purchased each time you list something.
--
--   `listings.plan` (added earlier) is NOT removed — it stays as a
--   per-row SNAPSHOT of whichever plan was active on the account at the
--   moment that specific listing was created, which is what the existing
--   per-listing CHECK constraints and enforce_listing_plan_limits
--   trigger (stricter_listing_rules.sql) key off of. That's intentional:
--   if someone downgrades later, listings they already published under a
--   higher tier keep their original snapshot rather than retroactively
--   breaking a stricter constraint.
-- CONNECTS TO :
--   Consumed by backend/supabase/subscription.js. Read by
--   frontend/components/SubscriptionModal.jsx, Navbar.jsx's badge, and
--   Profile.jsx's subscription section. ListEquipment.jsx now reads the
--   account's current plan from here instead of asking the user to pick
--   one during publish.
-- ==================================================================

alter table profiles
  add column if not exists plan text not null default 'free',
  add column if not exists plan_expires_at timestamptz;

alter table profiles
  drop constraint if exists profiles_plan_allowed;
alter table profiles
  add constraint profiles_plan_allowed check (plan in ('free', 'standard', 'featured'));

-- profiles_update_own (from database policies) already lets a user
-- update their own profiles row, which covers subscribing/upgrading —
-- no new RLS policy is needed here.
