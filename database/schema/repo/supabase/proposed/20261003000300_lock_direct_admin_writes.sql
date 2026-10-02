-- ==================================================================
-- PROPOSED (NOT in migrations/ on purpose) — close the back doors around the admin functions
-- ==================================================================
-- Today these RLS policies let ANY admin change data directly through the API, skipping
-- the permission checks and the audit log that the admin_* functions enforce:
--   users_admin_update_status      any admin can update any user row (status, etc.)
--   support_requests_admin_update  any admin can edit support requests
--   listings_admin_delete          any admin can delete any listing
--   admin_actions_insert           any admin can write (or forge) action-log rows
-- Dropping them means staff can only act THROUGH the functions: permission-checked and logged.
--
-- DO NOT apply until the app's admin screens call the admin_* functions instead of
-- updating tables directly — otherwise today's admin buttons stop working.
-- Order: baseline -> 3 migrations -> switch the admin page to rpc() -> test on staging -> this file.
-- Undo: re-create the four policies from history/ (trust_safety_account_status, owner_role_and_admin_access,
--       admin_remove_listing).
drop policy if exists users_admin_update_status     on users;
drop policy if exists support_requests_admin_update on support_requests;
drop policy if exists listings_admin_delete         on listings;
drop policy if exists admin_actions_insert          on admin_actions;
notify pgrst, 'reload schema';
