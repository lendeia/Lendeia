-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — storage bucket for listing photos
-- PURPOSE   :
--   Creates a public storage bucket for real, persistent listing photo
--   uploads, replacing the previous `URL.createObjectURL()` approach in
--   ListEquipment.jsx, which only produced temporary `blob:` URLs that
--   broke the moment the page was refreshed or viewed by anyone else.
--   Files are stored under a path prefixed with the uploader's own
--   auth.uid() (e.g. "3fa2.../photo1.jpg"), which is what the RLS
--   policies below check against — mirroring the ownership model already
--   used for the `listings` table itself.
-- CONNECTS TO :
--   Consumed by backend/supabase/storage.js (uploadListingPhotos), called
--   from frontend/pages/ListEquipment/ListEquipment.jsx at publish time.
--   The resulting public URLs are what get written into
--   listings.photo_urls / primary_image_url (see backend/supabase/listings.js).
-- ==================================================================

insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', true)
on conflict (id) do nothing;

-- Anyone can view listing photos (they're shown on public listing pages).
drop policy if exists "listing_photos_public_read" on storage.objects;
create policy "listing_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'listing-photos');

-- A user may only upload into a path that starts with their own user id
-- (enforced by requiring the first path segment to equal auth.uid()),
-- e.g. "<their-uuid>/<filename>" — they cannot write into another user's
-- folder no matter what filename/path they send.
drop policy if exists "listing_photos_insert_own" on storage.objects;
create policy "listing_photos_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- A user may delete only their own uploaded photos.
drop policy if exists "listing_photos_delete_own" on storage.objects;
create policy "listing_photos_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
