# What I found (tested by rebuilding your schema on a scratch Postgres with mock Supabase auth/storage)

## 1. NEEDS YOUR ATTENTION — private user data readable by any signed-in session  (fix written + tested)
Reproduced on the rebuilt copy: any signed-in session, including anonymous guests, could read every user's email, phone, age, gender and role.
Fix: supabase/proposed/20261003000400_protect_private_user_columns.sql  +  tests/private_columns_test.sql  +  docs/PRIVACY_FIX.md
Step 1 is to confirm it on LIVE with editor/owner_security/06_private_column_exposure. Applying it needs small app changes (PRIVACY_FIX.md step 2).

## 2. The old files cannot rebuild your database on their own
Replayed in order, listings, saved_listings, profiles and rentals end with Row Level Security OFF: their policies live in
database/policies/*.sql, which wasn't in the zip. So never build a fresh/staging database from history/ — use the baseline (BASELINE_STEPS.md).

## 3. Run-order mistakes in my first guess (fixed in history/, found by replaying)
- profiles needs listings first (saved_listings references it)
- guest_can_see_public_profiles needs phone_sharing_and_presence first (last_active_at)
- messaging must run before limits_delisting_notifications (it adds a trigger on messages)
Result: all 59 files now replay with no errors except the two below.

## 4. Two errors that remain on a fresh database
- anonymous_auth: it drops the index users_email_key before the constraint that owns it -> error. The next line fixes the state, but a runner that
  stops on the first error (or wraps the file in one transaction) would abort. Fix = swap those two lines. Irrelevant for your live DB.
- pg_cron: exists only on Supabase, my scratch database stubbed it. Not a real problem.

## 5. Admins couldn't read the moderation queues
review_reports / message_reports only allow the REPORTER to read. So an admin page could never list them. Fixed by migration 20261003000200 (read functions).

## 6. Direct-write back doors (see PERMISSIONS.md limit 1)
Four RLS policies let any admin bypass the new functions. Tested fix: supabase/proposed/20261003000300_lock_direct_admin_writes.sql (apply last).

## 7. Functions redefined in several files — only the LAST is live (never re-run an older file)
| Function | Defined in files (history/ numbers) | Live version |
|---|---|---|
| block_self_role_escalation | 45, 46, 47 | 47_trust_safety_account_status |
| check_device_account_limit | 55, 56 | 56_fix_device_limit_no_delete |
| enforce_listing_plan_limits | 7, 23, 24 | 24_fix_plan_limit_on_deactivate |
| enforce_rental_status_transition | 16, 17, 19, 21, 22, 23, 27, 30, 31 | 31_CRITICAL_lock_rental_price_fields |
| enforce_renter_active_limit | 19, 29 | 29_device_wide_rental_cap |
| enforce_review_eligibility | 17, 20, 28, 35, 59 | 59_shop_reviews_sync |
| get_or_create_conversation | 18, 40 | 40_messaging_photos_block_report |

## 8. What was actually tested
- All 59 old files replayed on a scratch DB; all 19 read-only editor queries run; all 7 WRITE_ editor queries behave (allowed cases change data, forbidden cases change nothing).
- New admin layer: 70+ checks (supabase/tests). I also broke the functions on purpose three ways (no lockout, admin can ban admin, forgot to revoke anon) and the tests caught each.
- Migrations re-run cleanly (idempotent), and the rollback script removes everything.
- NOT tested: your real live database, your real app, your real data volume. Staging is where that gets tested.
