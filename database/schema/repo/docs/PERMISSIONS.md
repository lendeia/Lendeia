# Who can do what (enforced by the database from migration 20261003000100)

users.role = 'user' | 'admin' | 'owner'.  Admins also have users.permissions: support | moderation | finance.
Every function below also requires the account to be ACTIVE (a suspended admin is locked out) and signed in.

| Action (function) | Owner | Admin needs |
|---|---|---|
| dashboard counts  admin_dashboard_counts | yes | any admin |
| set support request status  admin_set_support_status | yes | support |
| warn / restrict / suspend / ban / undo  admin_account_action | yes | moderation |
| resolve review report  admin_resolve_review_report | yes | moderation |
| list review / message reports, find user  admin_list_*, admin_find_user | yes | moderation |
| recent payments  admin_recent_payments | yes | finance |
| change roles / permissions  admin_set_role | yes | NOT allowed |
| permanently remove a listing  admin_remove_listing | yes | NOT allowed |
| read the audit log  admin_audit_log | yes | NOT allowed |

Account action rules: nobody acts on themselves; an owner can never be actioned; an admin can only be actioned by an owner;
accounts pending deletion can only be warned (an owner cancels the deletion first); suspensions are 1-365 days; a reason is required.
Everything is logged: admin_actions (account actions, listing removals) and admin_audit_log (everything else, owner-readable, append-only).

## Two honest limits
1. Until you apply supabase/proposed/20261003000300_lock_direct_admin_writes.sql, an admin can still bypass these functions by
   updating tables directly (RLS policies users_admin_update_status, support_requests_admin_update, listings_admin_delete,
   admin_actions_insert still allow any admin). Apply it once the admin page uses the functions.
2. The SQL Editor runs as the database owner and ignores all of this. Only owners should have Supabase dashboard access.
