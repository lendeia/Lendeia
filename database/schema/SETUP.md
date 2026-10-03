# Setup (Supabase CLI)

Copy the `supabase/` folder into your project (merge if one already exists).

1. supabase login
2. supabase link --project-ref YOUR_PROJECT_REF
3. supabase db pull        (answer Y to record the baseline as applied)
4. supabase migration list (LOCAL and REMOTE should match)
5. supabase db push        (applies the 4 files in supabase/migrations/)

Read docs/DEPLOY_CHECKLIST.md first, then docs/PRIVACY_FIX.md.

## Folders
supabase/migrations/  applied by `db push`, in filename order
supabase/proposed/    NOT applied automatically. Move to migrations/ only when ready (lock_direct_admin_writes goes LAST)
supabase/rollback/    undo script for the admin layer
supabase/tests/       run on local/staging only
editor/               paste into the Supabase SQL Editor (owner_* = owner only, staff_* = staff/admin)
history/              old applied patches. Reference only. Never re-run.
docs/                 guides
