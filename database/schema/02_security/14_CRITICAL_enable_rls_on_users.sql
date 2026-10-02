-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — CRITICAL: enable RLS on `users`
-- PURPOSE   :
--   A real security audit found that `users` (database/schema/users.sql)
--   has NEVER had Row Level Security enabled, unlike every other table
--   in this project (listings, rentals, reviews, messages, etc. all
--   have it). Without RLS, Supabase's default grants typically allow
--   any authenticated session (including an anonymous guest session,
--   which every visitor automatically gets) to read AND WRITE any row
--   in this table directly via the API, completely bypassing the app's
--   own "only update your own profile" logic in
--   backend/supabase/profile.js. That logic was never real
--   protection — exactly the "if (user.id === owner_id) // allow" trap:
--   a check in application code that a direct API call skips entirely.
--   This was likely exploitable to: read any user's phone/age/gender/
--   email, and modify any user's name/avatar/phone/etc.
--   Fixed by enabling RLS with:
--     - SELECT: permissive (auth.uid() IS NOT NULL) — public profile
--       browsing (OwnerStore.jsx, message sender names, review author
--       names, etc.) depends on reading OTHER users' name/avatar/bio
--       across dozens of existing joins throughout this app; a
--       same-row-only SELECT policy would break all of them.
--     - INSERT/UPDATE: restricted to auth.uid() = id — only you can
--       create or modify your own row, full stop.
--   HONEST RESIDUAL NOTE: because SELECT is permissive at the ROW level
--   (needed to not break existing features), a direct API call could
--   still read the phone/age/gender columns of any user, even though
--   the app's own UI never displays those fields for anyone but the
--   account owner. True column-level privacy would need routing every
--   cross-user read through a dedicated view exposing only public
--   columns, which would require rewriting the many existing
--   `users!listings_owner_id_fkey(...)`-style embedded joins throughout
--   this codebase — flagged as a real follow-up hardening step, not
--   done here to avoid a wide, high-risk rewrite in the same change
--   that fixes the far more severe "arbitrary write" hole.
-- CONNECTS TO :
--   This is the single most important fix from this audit. Run it
--   before anything else.
-- ==================================================================

alter table users enable row level security;

drop policy if exists users_select_all on users;
create policy users_select_all on users
  for select using (auth.uid() is not null);

drop policy if exists users_insert_own on users;
create policy users_insert_own on users
  for insert with check (auth.uid() = id);

drop policy if exists users_update_own on users;
create policy users_update_own on users
  for update using (auth.uid() = id) with check (auth.uid() = id);

notify pgrst, 'reload schema';
