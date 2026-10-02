-- Undo the admin layer (migrations 20261003000000, 20261003000100 and 20261003000200).
-- NOT a migration: run by hand only if you need to back out. It deletes admin_audit_log history.
-- admin_actions (the older account-action log) is NOT touched.
drop function if exists admin_list_review_reports(text);
drop function if exists admin_list_message_reports(integer);
drop function if exists admin_find_user(text);
drop function if exists admin_account_action(uuid, text, text, integer, uuid);
drop function if exists admin_set_support_status(uuid, text);
drop function if exists admin_resolve_review_report(uuid, text);
drop function if exists admin_set_role(uuid, text, text[]);
drop function if exists admin_remove_listing(uuid, text);
drop function if exists admin_dashboard_counts();
drop function if exists admin_recent_payments(integer);
drop function if exists admin_require(text);
drop policy   if exists admin_audit_log_select_owner on admin_audit_log;
drop table    if exists admin_audit_log;
drop function if exists is_owner();
notify pgrst, 'reload schema';
