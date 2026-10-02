-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — profile avatar storage
-- PURPOSE   :
--   Real, persistent avatar photo uploads — replacing Profile.jsx's
--   PersonalInfoModal, which previously used `URL.createObjectURL(file)`
--   and saved that temporary `blob:` URL directly as the user's
--   avatar_url. A `blob:` URL only exists in the browser tab that
--   created it — saving it to the database meant the photo appeared to
--   work in that one moment, then showed broken/empty everywhere else:
--   other pages, other sessions, other people viewing your profile, and
--   even the same tab after a refresh. Same bug class already fixed for
--   listing photos in listing_photos_storage.sql — same fix here.
--   Public read; a user may only write/delete inside a folder path
--   prefixed with their own user id, same convention as listing photos.
-- CONNECTS TO :
--   Consumed by backend/supabase/storage.js's new uploadAvatar(), called
--   from frontend/pages/Profile/Profile.jsx's PersonalInfoModal.
-- ==================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
