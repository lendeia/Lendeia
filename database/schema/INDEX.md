# Lendeia SQL — v5 (deployable + managed + privacy fix)

editor/   snippets you paste into the Supabase SQL Editor — OWNER use only (5 folders)
repo/     what goes into your Git project

## repo/
supabase/migrations/   3 NEW migrations (audit log, enforced admin functions, admin read functions). Apply AFTER the baseline.
supabase/tests/        admin_functions_test.sql (70+ checks) and private_columns_test.sql — roll back, run on local/staging only
supabase/rollback/     admin_layer_rollback.sql  (undo the 3 migrations)
supabase/proposed/     2 files, NOT auto-applied: protect_private_user_columns (privacy fix, needs small app changes) and lock_direct_admin_writes (apply LAST)
history/               the 59 old patch files, grouped in 12 topic folders (accounts, admin, core, devices, listings, messaging, notifications,
                       rentals, reviews, security, storage, subscription) + archive/ (2 superseded). Numbers = tested run order. See history/README.md. Never re-run.
docs/                  START HERE: DEPLOY_CHECKLIST.md, then PRIVACY_FIX.md (important), CHECKS.md, PERMISSIONS.md, ADMIN_PAGE_SPEC.md, BASELINE_STEPS.md

## editor/ folders
staff_daily, staff_moderation   read/WRITE queries for owner or admin
owner_manage, owner_money, owner_security   OWNER ONLY (new: owner_security/06_private_column_exposure)
WRITE_ files change data. Edit only lines marked "change me".

## Do these first (30 minutes)
1. editor/owner_security/06_private_column_exposure   <- can any signed-in user read other people's email/phone?
2. editor/owner_security/01_rls_audit                  <- every table should show rls_enabled = true
3. editor/owner_manage/02_staff_list                   <- your account must be 'owner'
Then follow repo/docs/DEPLOY_CHECKLIST.md.
