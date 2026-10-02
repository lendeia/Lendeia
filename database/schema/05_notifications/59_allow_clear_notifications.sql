-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — allow clearing notifications
-- PURPOSE   :
--   notifications only ever had SELECT/INSERT/UPDATE policies
--   (limits_delisting_notifications.sql) — there was no way to actually
--   delete a notification at all, so a "Clear" action had nothing to
--   call. Adds the missing DELETE policy, scoped to the notification's
--   own owner only.
-- CONNECTS TO :
--   Used by backend/supabase/notifications.js's clearNotification() and
--   clearAllNotifications(), exposed via the bell dropdown in
--   frontend/components/Navbar.jsx.
-- ==================================================================

drop policy if exists notifications_delete_own on notifications;
create policy notifications_delete_own on notifications
  for delete using (user_id = auth.uid());

notify pgrst, 'reload schema';
