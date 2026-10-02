# Deploy checklist (in this order)

## 0. Before touching anything
- [ ] Take a backup: Supabase dashboard -> Database -> Backups (or `supabase db dump -f backup_before_admin_layer.sql`).
- [ ] Do the 3 "first" checks in INDEX.md and write down the results.

## 1. Baseline (once) — see BASELINE_STEPS.md
- [ ] `supabase link --project-ref <live-id>` then `supabase db pull` -> one baseline file, marked as applied.
- [ ] Commit to Git.

## 2. Staging project (free second Supabase project)
- [ ] Create it, `supabase link` to it, `supabase db push` (baseline + the 3 new migrations).
- [ ] NOTE: staging built from the baseline only has what the live DB has. If the baseline is missing policies, the
      RLS audit on staging will show it — that is the point of testing there.
- [ ] Run the tests:  psql "<staging db url>" -v ON_ERROR_STOP=1 -f supabase/tests/admin_functions_test.sql
      Expected last line: ALL TESTS PASSED   (it rolls back, nothing is kept)
- [ ] Create a test owner + test admin on staging and click through the admin page (ADMIN_PAGE_SPEC.md).

## 3. Live
- [ ] `supabase db push` (applies only the 3 new migrations; the baseline is already marked applied).
- [ ] Run editor/owner_security/01_rls_audit and 03_anon_grants again.
- [ ] Make sure exactly the right people are role 'owner' / 'admin' (owner_manage/02_staff_list).

## 4. Later, when the admin page uses supabase.rpc('admin_*')
- [ ] Apply supabase/proposed/20261003000300_lock_direct_admin_writes.sql on staging first, re-run the tests, click through.
- [ ] Then on live. Until then any admin can still bypass the functions through direct table updates.

## 5. Privacy fix (do it right after step 3 — it protects real user data)
- [ ] Follow PRIVACY_FIX.md (confirm on live -> find app code that breaks -> staging -> live).
- [ ] Run supabase/tests/private_columns_test.sql on staging after applying it.

## Rollback
- Admin layer only: run supabase/rollback/admin_layer_rollback.sql (drops the admin_* functions and admin_audit_log; admin_actions is kept).
- Anything bigger: restore the backup from step 0.

## Rules going forward
- Every database change = a new file via `supabase migration new <name>` -> test on staging -> push. No more pasting patches into the live SQL Editor.
- Never edit a migration after it ran live. Write a new one.
- The SQL Editor on live is for the editor/ read-only snippets and rare owner WRITE_ ones.
