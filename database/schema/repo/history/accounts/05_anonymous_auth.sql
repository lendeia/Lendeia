-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — anonymous auth support
-- PURPOSE   :
--   Reconciles the app-level `users` table (database/schema/users.sql)
--   with Supabase's built-in anonymous auth, and guarantees a user can
--   never end up duplicated in either `auth.users` or this app's
--   `users` table.
-- CONNECTS TO :
--   Consumed by backend/supabase/anonymousAuth.js. Run this AFTER
--   database/schema/users.sql. See database/schema/stricter_listing_rules.sql
--   for the separate migration tightening listing validation.
-- ==================================================================

-- Anonymous Supabase users have no email, so `email` can no longer be
-- a plain NOT NULL column. It stays UNIQUE for the users who do have
-- one (e.g. once a real email/OAuth login is added later), via a
-- partial unique index that simply ignores NULLs.
alter table users alter column email drop not null;

drop index if exists users_email_key; -- the implicit unique index behind `unique` in the base schema
alter table users drop constraint if exists users_email_key;

create unique index if not exists users_email_unique_not_null
  on users (email)
  where email is not null;

-- `id` on `users` is already `references auth.users(id)` in spirit (both
-- are the Supabase auth UUID) and is already the primary key, which is
-- itself the strongest duplicate guard available: Postgres physically
-- cannot insert two rows with the same id. The upsert pattern used in
-- backend/supabase/anonymousAuth.js (`onConflict: 'id', ignoreDuplicates: true`)
-- relies on exactly this constraint, so nothing further is needed here
-- beyond making sure the FK actually points at Supabase's auth schema:
alter table users
  drop constraint if exists users_id_fkey,
  add constraint users_id_fkey
    foreign key (id) references auth.users(id) on delete cascade;

-- Track whether a user row is an anonymous identity vs a "real" one,
-- so a future real-login flow can distinguish/merge them if needed.
alter table users
  add column if not exists is_anonymous boolean not null default false;

-- Keep is_anonymous in sync automatically instead of trusting every
-- call site to set it correctly.
create or replace function sync_is_anonymous()
returns trigger as $$
begin
  new.is_anonymous := (new.auth_provider = 'anonymous');
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_is_anonymous on users;
create trigger trg_sync_is_anonymous
  before insert or update on users
  for each row execute function sync_is_anonymous();
