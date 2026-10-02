# Admin page — what each screen/button calls

Sign in as an admin/owner, then call with supabase-js:  `const { data, error } = await supabase.rpc('<function>', { ...args })`
Errors come back in `error.message` in plain English (shown below) — display them as-is.

| Screen / button | Function | Arguments |
|---|---|---|
| Home counters | admin_dashboard_counts | none  -> {open_support_requests, pending_review_reports, ...} |
| Support queue (list) | read the table directly | `supabase.from('support_requests').select('*').neq('status','resolved')` (admins are allowed by RLS) |
| Set status button | admin_set_support_status | p_request uuid, p_status 'open'/'in_progress'/'resolved' |
| User search box | admin_find_user | p_query text (3+ characters) |
| Warn / Restrict / Suspend / Ban / Undo | admin_account_action | p_target uuid, p_action 'warn'/'restrict'/'unrestrict'/'suspend'/'unsuspend'/'ban'/'unban', p_reason text, p_days int (suspend only), p_report_id uuid (optional) |
| Review reports list | admin_list_review_reports | p_status 'pending' (or null for all) |
| Dismiss / Resolve report | admin_resolve_review_report | p_report uuid, p_status 'resolved'/'dismissed' |
| Message reports list | admin_list_message_reports | p_limit int |
| Payments (finance) | admin_recent_payments | p_limit int |
| Owner: set role | admin_set_role | p_target uuid, p_role 'user'/'admin'/'owner', p_permissions text[] |
| Owner: remove listing | admin_remove_listing | p_listing uuid, p_reason text |

Error messages you will see: Not signed in · Account not allowed · Permission denied · Owner only · You cannot act on yourself ·
An owner cannot be actioned · Only an owner can act on an admin · A reason is required · A suspension needs 1 to 365 days ·
Account is pending deletion... · This report was already handled · User not found.

Hide buttons the user's role can't use (role/permissions come from their own users row), but remember: the database enforces it, the UI only tidies it.
