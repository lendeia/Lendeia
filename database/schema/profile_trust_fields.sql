-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — profile trust fields
-- PURPOSE   :
--   New self-reported profile fields for the "trust profile" UI:
--   username, short bio, city/area, age, gender, phone number.
--
--   WHAT THIS DOES NOT DO (flagged honestly, not hidden): it does not
--   add "phone verified" or "location verified" as real, cryptographically
--   checked states. There's no SMS/OTP provider wired into this project,
--   so a phone number here is self-reported and unverified — the UI
--   must never show it with a green "verified" checkmark. "Email
--   verified" IS real and needs no new column at all: Supabase's own
--   auth session already exposes email_confirmed_at on the client-side
--   user object, surfaced via account.emailVerified (see
--   backend/supabase/anonymousAuth.js). "Location verified" is
--   interpreted as "has granted browser location at least once" —
--   reusing state/location/locationStore.jsx's already-cached
--   coordinates, not a new server-side flag.
-- CONNECTS TO :
--   Consumed by backend/supabase/profile.js's updateMyProfile() and
--   displayed in frontend/pages/Profile/Profile.jsx's trust section.
-- ==================================================================

alter table users
  add column if not exists username text,
  add column if not exists bio text,
  add column if not exists city text,
  add column if not exists age integer,
  add column if not exists gender text,
  add column if not exists phone text;

alter table users drop constraint if exists users_age_reasonable;
alter table users add constraint users_age_reasonable
  check (age is null or (age >= 18 and age <= 120));

alter table users drop constraint if exists users_gender_allowed;
alter table users add constraint users_gender_allowed
  check (gender is null or gender in ('male', 'female', 'other', 'prefer_not_to_say'));

alter table users drop constraint if exists users_bio_length;
alter table users add constraint users_bio_length
  check (bio is null or char_length(bio) <= 300);

create unique index if not exists users_username_unique
  on users (lower(username)) where username is not null;

notify pgrst, 'reload schema';
