-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION - admin can remove a bad listing (new)
-- PURPOSE   :
--   listings_delete_own (FULL_SCHEMA_REFERENCE.sql) only ever let the
--   listing's OWNER delete it - there was no way for an admin/owner
--   account to remove someone else's listing at all, even a clearly
--   bad one found while reviewing a report. Adds a second, additional
--   delete policy (Postgres RLS combines multiple policies for the
--   same operation with OR, so the owner's own existing delete path is
--   unaffected) and extends admin_actions so removing a listing is
--   logged in the same audit trail as every other moderation action,
--   not a silent, untracked one.
-- ==================================================================

drop policy if exists listings_admin_delete on listings;
create policy listings_admin_delete on listings
  for delete using (is_admin_or_owner());

alter table admin_actions drop constraint if exists admin_actions_action_check;
alter table admin_actions add constraint admin_actions_action_check check (
  action in ('warn', 'restrict', 'unrestrict', 'suspend', 'unsuspend', 'ban', 'unban', 'remove_listing')
);

-- A snapshot of the removed listing's name, not a live foreign key —
-- the listing row itself is gone by the time this log entry gets read
-- back, so there is nothing left for a real reference to point at.
-- Kept separate from related_report_id, which stays a proper
-- reference to an actual support_requests row for every other action.
alter table admin_actions add column if not exists removed_listing_name text;

notify pgrst, 'reload schema';
