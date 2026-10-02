# Privacy fix: stop signed-in users reading each other's email / phone / role

## The problem (reproduced on a rebuild of your schema)
RLS policy users_select_all lets any signed-in session (anonymous guests count as signed in) read every row of `users`, and the
`authenticated` role can read every column. A stranger could run  select email, phone, age, gender, role from users  and get
everyone's data. Your phone-sharing rules ("a phone is never visible except through get_shared_phone()") are bypassed.

## Step 1 — confirm on LIVE (2 minutes, read-only)
Run  editor/owner_security/06_private_column_exposure  in the SQL Editor.
If any private column (email, phone, age, gender, role, permissions, status_reason, suspended_until, restricted_actions,
scheduled_deletion_at, auth_provider) shows  signed_in_can_read = true , the leak is real on your project.
Expected after the fix: only id, name, avatar_url, username, bio, city, last_active_at, shop_name, created_at, is_anonymous, account_status.

## Step 2 — find what in the app will break (do this BEFORE applying)
In your app folder, search:
    grep -rn "from('users')\|from(\"users\")\|users(" src
    grep -rn "select('\*')\|select(\"\*\")" src
For every hit on `users` ask:
  a) selects '*' or users(*)          -> list the public columns by name instead
  b) reads the SIGNED-IN user's own email / phone / age / gender / role / permissions / status details
                                      -> use  supabase.rpc('get_my_profile')  (returns your own full row)
  c) reads ANOTHER person's email/phone/role -> that is exactly what must stop (use get_shared_phone() for phones)
  d) update/upsert on users ending in .select() or returning *  -> name public columns or drop the .select()
Admin screens: use the admin_* functions (they keep working).

## Step 3 — apply on STAGING, click through the whole app
    psql "<staging db url>" -f supabase/proposed/20261003000400_protect_private_user_columns.sql
    psql "<staging db url>" -v ON_ERROR_STOP=1 -f supabase/tests/private_columns_test.sql      -> ALL TESTS PASSED
Then: sign up, log in, browse listings, create a listing, request a rental, message, edit profile, share phone, guest browsing, admin page.

## Step 4 — live
Backup first. Apply the same file. Run 06_private_column_exposure again to confirm.
Undo if something important breaks:   grant select on users to authenticated;   (then fix the app and re-apply)

## What was tested (scratch copy of your schema, not your live database)
- Before: a stranger reads victim@... and the phone number. After: "permission denied" for every private column.
- After: public name/bio still readable, own profile via get_my_profile() works, own update + upsert work, other people's rows can't be updated.
- The RLS policies on listings and rentals read users.is_anonymous and users.account_status, so those two columns MUST stay granted.
  I proved it: without them, simply browsing listings fails with "permission denied for table users".
- Guests (anonymous sessions) can't read private columns and still can't create a listing; logged-out visitors are limited to public columns.
- Breaking the fix on purpose (leave email granted / forget the policy columns) is caught by the test.
- The admin-layer tests (admin_functions_test.sql) still pass with the fix applied.
- NOT tested: your app code. That's Step 2.

## Known trade-off
select('*') on users stops working for everyone signed in — that is the price of column-level privacy.
If listing columns by name across the app is too much work, tell me and I'll write a public_profiles view and a list of exact code changes instead.
