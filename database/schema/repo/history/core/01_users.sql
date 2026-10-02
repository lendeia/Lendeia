-- ==================================================================
-- FILE TYPE : SUPABASE SCHEMA — TABLE
-- PURPOSE   :
--   Auth identity table. In a real Supabase project this normally mirrors
--   the built-in `auth.users` table (Supabase manages that one itself);
--   this app-level `users` table exists so other tables can FK to a simple
--   uuid without depending on the `auth` schema directly.
-- CONNECTS TO :
--   Referenced by listings.owner_id, rentals.renter_id, profiles.user_id,
--   saved_listings.user_id (all `references users(id)`).
--   See database/schema/anonymous_auth.sql for how this stays in sync with
--   Supabase anonymous auth users and how duplicates are prevented.
-- ==================================================================
-- Users table: auth identity + basic profile
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  avatar_url text,
  auth_provider text not null default 'email', -- 'email' | 'google'
  created_at timestamptz not null default now()
);
