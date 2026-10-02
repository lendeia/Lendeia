# Make ONE true baseline of your live database (do this once)

Why: the 61 old files are patches (some functions are redefined up to 9 times) and, as tested, they CANNOT rebuild your database
on their own (see CHECKS.md #2). A pull of the live database is the real current state.

Needs: Supabase CLI + Docker Desktop running.
1. In your project folder:     supabase init              (skip if ./supabase exists)
2. Link to the live project:   supabase link --project-ref <project-id>     (id = part after /project/ in the dashboard URL)
3. Pull the live schema:       supabase db pull
   -> creates supabase/migrations/<timestamp>_remote_schema.sql  (your baseline)
   -> answer Y when it offers to record it as already applied, so `db push` won't run it again on live
4. Check:                      supabase migration list     (LOCAL and REMOTE columns match)
5. Copy this package's repo/supabase/migrations/*.sql next to it (their timestamps sort after the baseline) and commit.

If db pull complains about migration history, don't force it — send me the message.
Optional: `supabase db pull --schema auth` / `--schema storage` only if you customised those yourself.
